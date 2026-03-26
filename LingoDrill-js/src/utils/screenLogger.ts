// utils/screenLogger.ts
//
// Визуальный логгер для отладки на мобильных устройствах.
// Рендерит логи прямо в DOM без зависимости от React.
// Патчит console.log/warn/error чтобы дублировать вывод на экран.
//
// ИСПОЛЬЗОВАНИЕ:
//   import { initScreenLogger, screenLog } from "../utils/screenLogger"
//   initScreenLogger()          // вызвать один раз при старте
//   screenLog("hello")          // явный вызов
//   console.log("also appears") // автоматически дублируется

let panel: HTMLDivElement | null = null
let logCount = 0
const MAX_LOGS = 50

function ensurePanel(): HTMLDivElement {
  if (panel && document.body.contains(panel)) return panel

  panel = document.createElement("div")
  panel.id = "__screen-logger__"
  panel.style.cssText = [
    "position: fixed",
    "bottom: 0",
    "left: 0",
    "right: 0",
    "max-height: 40vh",
    "overflow-y: auto",
    "background: rgba(0,0,0,0.88)",
    "color: #0f0",
    "font: 11px/1.4 monospace",
    "padding: 6px 8px",
    "z-index: 999999",
    "pointer-events: auto",
    "white-space: pre-wrap",
    "word-break: break-all",
  ].join(";")
  document.body.appendChild(panel)
  return panel
}

export function screenLog(msg: string, level: "log" | "warn" | "error" = "log") {
  const p = ensurePanel()
  logCount = logCount + 1

  const line = document.createElement("div")
  line.style.borderBottom = "1px solid rgba(255,255,255,0.1)"
  line.style.padding = "2px 0"

  if (level === "error") line.style.color = "#f55"
  else if (level === "warn") line.style.color = "#ff0"

  const ts = new Date()
  const time = `${ts.getMinutes().toString().padStart(2, "0")}:${ts.getSeconds().toString().padStart(2, "0")}.${ts.getMilliseconds().toString().padStart(3, "0")}`

  line.textContent = `[${time}] ${msg}`
  p.appendChild(line)

  // Auto-scroll
  p.scrollTop = p.scrollHeight

  // Trim old entries
  while (p.childNodes.length > MAX_LOGS) {
    p.removeChild(p.firstChild!)
  }
}

export function initScreenLogger() {
  ensurePanel()

  const origLog = console.log.bind(console)
  const origWarn = console.warn.bind(console)
  const origError = console.error.bind(console)

  console.log = (...args: unknown[]) => {
    origLog(...args)
    screenLog(args.map(a => stringify(a)).join(" "), "log")
  }

  console.warn = (...args: unknown[]) => {
    origWarn(...args)
    screenLog(args.map(a => stringify(a)).join(" "), "warn")
  }

  console.error = (...args: unknown[]) => {
    origError(...args)
    screenLog(args.map(a => stringify(a)).join(" "), "error")
  }

  // Catch global errors
  window.addEventListener("error", (e) => {
    screenLog(`[GLOBAL ERROR] ${e.message} @ ${e.filename}:${e.lineno}`, "error")
  })

  window.addEventListener("unhandledrejection", (e) => {
    const reason = e.reason instanceof Error ? e.reason.message : String(e.reason)
    screenLog(`[UNHANDLED REJECTION] ${reason}`, "error")
  })

  screenLog("Screen logger initialized", "log")
}

function stringify(val: unknown): string {
  if (val === null) return "null"
  if (val === undefined) return "undefined"
  if (val instanceof Error) return `${val.name}: ${val.message}`
  if (typeof val === "object") {
    try { return JSON.stringify(val, null, 0) } catch { return String(val) }
  }
  return String(val)
}