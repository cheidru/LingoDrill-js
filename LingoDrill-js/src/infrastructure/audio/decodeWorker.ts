// infrastructure/audio/decodeWorker.ts
//
// Web Worker для декодирования аудио в отдельном потоке.
//
// ЗАЧЕМ:
// decodeAudioData() — нативный вызов браузера. Когда он запущен на main thread,
// ctx.close() НЕ останавливает его — нативный декодер продолжает потреблять память
// до тех пор, пока ОС не убьёт вкладку. Promise.race + setTimeout позволяют
// бросить JS-ошибку, но нативный процесс продолжает работать.
//
// Единственный надёжный способ убить нативный decode — запустить его в Web Worker
// и вызвать worker.terminate(). Это мгновенно уничтожает поток вместе со всей
// памятью, выделенной нативным декодером.
//
// ПРОТОКОЛ:
// Main → Worker:  { arrayBuffer: ArrayBuffer }  (transferred, zero-copy)
// Worker → Main:  { channels: Float32Array[], sampleRate: number, duration: number }
//                 (transferred, zero-copy)
// Worker → Main:  { error: string }  (при ошибке)
//
// ИСПРАВЛЕНИЕ:
// AudioContext может быть недоступен в контексте Web Worker в некоторых браузерах.
// Порядок проверки: AudioContext → webkitAudioContext → OfflineAudioContext.
// OfflineAudioContext требует параметры (channels, length, sampleRate),
// но мы не знаем их заранее — поэтому используем "достаточно большие" значения.
// Если ни один конструктор не найден — возвращаем понятную ошибку.

const workerCode = `
self.onmessage = async function(e) {
  try {
    var arrayBuffer = e.data.arrayBuffer;

    // Determine which AudioContext constructor is available in this worker scope.
    // AudioContext is available in workers in modern Chrome/Firefox/Safari,
    // but some older browsers or WebViews only expose OfflineAudioContext.
    var CtxClass = self.AudioContext || self.webkitAudioContext || null;
    var ctx;

    if (CtxClass) {
      ctx = new CtxClass();
    } else if (self.OfflineAudioContext || self.webkitOfflineAudioContext) {
      // Fallback: OfflineAudioContext is more widely available in workers.
      // We need to provide (numberOfChannels, length, sampleRate).
      // Use generous defaults — the actual decode result determines the real values.
      var OCtx = self.OfflineAudioContext || self.webkitOfflineAudioContext;
      ctx = new OCtx(2, 44100 * 60, 44100);
    } else {
      self.postMessage({ error: "Web Workers not supported on this device" });
      return;
    }

    var audioBuffer = await ctx.decodeAudioData(arrayBuffer);

    // Extract raw channel data (AudioBuffer is not transferable)
    var channels = [];
    var transferList = [];
    for (var ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
      var data = audioBuffer.getChannelData(ch).slice(); // copy to own buffer
      channels.push(data);
      transferList.push(data.buffer);
    }

    if (ctx.close) {
      ctx.close().catch(function() {});
    }

    self.postMessage({
      channels: channels,
      sampleRate: audioBuffer.sampleRate,
      numberOfChannels: audioBuffer.numberOfChannels,
      length: audioBuffer.length,
      duration: audioBuffer.duration,
    }, transferList);
  } catch (err) {
    self.postMessage({ error: err.message || String(err) });
  }
};
`;

// Create a blob URL for the worker code
let workerBlobUrl: string | null = null;

function getWorkerBlobUrl(): string {
  if (!workerBlobUrl) {
    const blob = new Blob([workerCode], { type: "application/javascript" });
    workerBlobUrl = URL.createObjectURL(blob);
  }
  return workerBlobUrl;
}

export interface WorkerDecodeResult {
  channels: Float32Array[];
  sampleRate: number;
  numberOfChannels: number;
  length: number;
  duration: number;
}

/**
 * Decode audio data in a Web Worker with a hard timeout.
 *
 * On timeout, worker.terminate() is called which instantly kills
 * the native decoder and frees all its memory — unlike ctx.close()
 * which does NOT reliably abort the native decode.
 *
 * @param arrayBuffer - compressed audio data (will be transferred, not copied)
 * @param timeoutMs - max time before worker is killed (default: 5000ms)
 * @param label - optional label for error messages
 * @returns decoded channel data + metadata
 */
export function decodeInWorker(
  arrayBuffer: ArrayBuffer,
  timeoutMs = 5_000,
  label = "",
): Promise<WorkerDecodeResult> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let worker: Worker | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };

    const kill = (reason: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (worker) {
        worker.terminate();
        worker = null;
      }
      reject(new Error(reason));
    };

    try {
      worker = new Worker(getWorkerBlobUrl());
    } catch {
      // Web Workers not supported (rare) — fall back
      reject(new Error("Web Workers not supported on this device"));
      return;
    }

    worker.onmessage = (e: MessageEvent) => {
      if (settled) return;
      settled = true;
      cleanup();

      const data = e.data;
      if (data.error) {
        reject(new Error(data.error));
      } else {
        resolve({
          channels: data.channels,
          sampleRate: data.sampleRate,
          numberOfChannels: data.numberOfChannels,
          length: data.length,
          duration: data.duration,
        });
      }
      // Worker is done, terminate to free memory
      worker?.terminate();
      worker = null;
    };

    worker.onerror = (e: ErrorEvent) => {
      kill(`Worker error: ${e.message || "unknown"}`);
    };

    // Start the watchdog timer
    timeoutId = setTimeout(() => {
      const detail = label ? ` (${label})` : "";
      kill(
        `Audio decoding timed out${detail}. ` +
        `The file is too large for this device. ` +
        `Please use a desktop browser or split the audio file.`
      );
    }, timeoutMs);

    // Transfer the ArrayBuffer to the worker (zero-copy)
    worker.postMessage({ arrayBuffer }, [arrayBuffer]);
  });
}

/**
 * Reconstruct an AudioBuffer from worker decode result.
 * Must be called on the main thread (AudioBuffer constructor
 * requires main-thread AudioContext on some browsers).
 */
export function resultToAudioBuffer(result: WorkerDecodeResult): AudioBuffer {
  const buffer = new AudioBuffer({
    numberOfChannels: result.numberOfChannels,
    length: result.length,
    sampleRate: result.sampleRate,
  });
  for (let ch = 0; ch < result.numberOfChannels; ch++) {
    buffer.getChannelData(ch).set(result.channels[ch]);
  }
  return buffer;
}