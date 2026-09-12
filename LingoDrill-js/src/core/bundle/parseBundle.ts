// core/bundle/parseBundle.ts

import type { BundleFile } from "./types"

/**
 * Почему файл не удалось прочитать как бандл.
 * UI переводит код в сообщение (`bundle.error.<reason>`), поэтому текст ошибки
 * здесь не локализуется.
 */
export type BundleParseReason = "savedWebPage" | "notBundle"

export class BundleParseError extends Error {
  readonly reason: BundleParseReason
  /** Начало файла — то, что показывается пользователю как «что это было». */
  readonly excerpt: string
  /** Адрес сохранённой страницы, если браузер его записал. */
  readonly savedFrom: string | null

  constructor(reason: BundleParseReason, excerpt: string, savedFrom: string | null) {
    super(`Bundle parse failed: ${reason}`)
    this.name = "BundleParseError"
    this.reason = reason
    this.excerpt = excerpt
    this.savedFrom = savedFrom
  }
}

/** Первые строки файла в виде, пригодном для показа в диалоге. */
export function fileExcerpt(text: string, limit = 300): string {
  const printable = text
    .slice(0, limit * 2)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "·")
    .replace(/\s+/g, " ")
    .trim()
  return printable.length > limit ? printable.slice(0, limit) + "…" : printable
}

/**
 * Читает .lingodrill из файла, выбранного пользователем.
 *
 * На телефоне файл нередко доезжает не тем, чем был: браузер по кнопке
 * «сохранить страницу» кладёт на диск MHTML-архив (`From: <Saved by Blink>`),
 * внутри которого лежит тот самый JSON, показанный как текст. Такой архив —
 * и просто HTML-страница с JSON внутри — распаковывается здесь, чтобы импорт
 * работал вместо `Unexpected token 'F'`.
 */
export async function readBundleFile(blob: Blob): Promise<BundleFile> {
  return parseBundleText(await blob.text())
}

export function parseBundleText(raw: string): BundleFile {
  const text = raw.replace(/^\uFEFF/, "").trim()

  const direct = tryParseBundle(text)
  if (direct) return direct

  const salvaged = salvageBundle(text)
  if (salvaged) return salvaged

  throw new BundleParseError(
    looksLikeSavedPage(text) ? "savedWebPage" : "notBundle",
    fileExcerpt(text),
    savedPageLocation(text),
  )
}

function isBundle(value: unknown): value is BundleFile {
  if (typeof value !== "object" || value === null) return false
  const manifest = (value as BundleFile).manifest
  return (
    typeof manifest === "object" && manifest !== null &&
    typeof manifest.version === "number" &&
    typeof manifest.audio === "object" && manifest.audio !== null &&
    Array.isArray(manifest.sequences)
  )
}

function tryParseBundle(text: string): BundleFile | null {
  if (!text.startsWith("{")) return null
  try {
    const parsed: unknown = JSON.parse(text)
    return isBundle(parsed) ? parsed : null
  } catch {
    return null
  }
}

/** Признаки того, что вместо бандла сохранили веб-страницу. */
function looksLikeSavedPage(text: string): boolean {
  const head = text.slice(0, 2048)
  return (
    /^(From|MIME-Version|Content-Type|Snapshot-Content-Location):/im.test(head) ||
    /^\s*<(!doctype|html|head|body|pre)\b/i.test(head)
  )
}

/**
 * Адрес страницы, снимок которой сохранил браузер. Он и объясняет, что пошло
 * не так: снимок страницы файлообменника вместо самого файла выглядит как
 * «правильный» .lingodrill, пока не увидишь, откуда он взялся.
 */
function savedPageLocation(text: string): string | null {
  const head = headersOf(text)
  const url = /^(?:Snapshot-Content-Location|Content-Location):\s*(\S+)/im.exec(head)?.[1]
  return url ?? null
}

/** Достаёт бандл из MHTML-архива или HTML-страницы, если он там есть. */
function salvageBundle(text: string): BundleFile | null {
  for (const part of mimeParts(text)) {
    /* Разметку снимаем первой: JSON внутри <pre> экранирован (&lt; &amp;),
       и как есть он тоже разберётся — только метки фрагментов приедут с
       «&lt;» вместо «<». */
    const looksLikeMarkup = /<\s*(pre|html|body|div)\b/i.test(part)
    const candidates = looksLikeMarkup
      ? [stripMarkup(part), part]
      : [part, stripMarkup(part)]

    for (const candidate of candidates) {
      const found = findBundleJson(candidate)
      if (found) return found
    }
  }
  return null
}

/**
 * Разбирает MHTML на декодированные части. Не MIME — возвращает исходный текст
 * единственной частью, чтобы дальше его разобрали как обычный HTML.
 */
function mimeParts(text: string): string[] {
  const boundary = /^Content-Type:\s*multipart\/[^\n]*boundary\s*=\s*"?([^";\r\n]+)"?/im.exec(headersOf(text))?.[1]
  if (!boundary) return [text]

  const parts: string[] = []
  for (const chunk of text.split(`--${boundary}`).slice(1)) {
    const split = /\r?\n\r?\n/.exec(chunk)
    if (!split) continue
    const headers = headersOf(chunk)
    const body = chunk.slice(split.index + split[0].length)
    const encoding = /^Content-Transfer-Encoding:\s*([^\r\n]+)/im.exec(headers)?.[1]?.trim().toLowerCase()
    parts.push(decodePart(body, encoding))
  }
  return parts.length > 0 ? parts : [text]
}

/**
 * Заголовки — всё до первой пустой строки, со склеенными переносами:
 * Chrome переносит длинный Content-Type, и boundary уезжает на следующую
 * строку, где его уже не найти.
 */
function headersOf(text: string): string {
  const blank = /\r?\n\r?\n/.exec(text)
  const head = blank ? text.slice(0, blank.index) : text
  return head.replace(/\r?\n[ \t]+/g, " ")
}

function decodePart(body: string, encoding: string | undefined): string {
  try {
    if (encoding === "quoted-printable") return decodeQuotedPrintable(body)
    if (encoding === "base64") return decodeBase64(body)
  } catch {
    return body
  }
  return body
}

function decodeQuotedPrintable(body: string): string {
  const joined = body.replace(/=\r?\n/g, "")
  const bytes: number[] = []
  const encoder = new TextEncoder()

  for (let i = 0; i < joined.length; i++) {
    const ch = joined[i]
    if (ch === "=" && /^[0-9A-Fa-f]{2}$/.test(joined.slice(i + 1, i + 3))) {
      bytes.push(parseInt(joined.slice(i + 1, i + 3), 16))
      i += 2
      continue
    }
    const code = ch.charCodeAt(0)
    if (code < 0x80) bytes.push(code)
    else encoder.encode(ch).forEach(b => bytes.push(b))
  }
  return new TextDecoder("utf-8").decode(new Uint8Array(bytes))
}

function decodeBase64(body: string): string {
  const binary = atob(body.replace(/\s+/g, ""))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new TextDecoder("utf-8").decode(bytes)
}

/** HTML → текст: браузер показывает JSON внутри <pre> и экранирует < > &. */
function stripMarkup(html: string): string {
  const pre = /<pre[^>]*>([\s\S]*?)<\/pre>/i.exec(html)
  const body = pre ? pre[1] : html
  return body
    .replace(/<[^>]*>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
}

/**
 * Ищет в тексте JSON-объект бандла. Отталкивается от ключа "manifest": он
 * первый в экспортируемом объекте, поэтому ближайшая слева `{` — начало
 * бандла.
 */
function findBundleJson(text: string): BundleFile | null {
  const key = /"manifest"\s*:/g
  let match: RegExpExecArray | null

  while ((match = key.exec(text)) !== null) {
    const start = text.lastIndexOf("{", match.index)
    if (start < 0) continue
    const end = findObjectEnd(text, start)
    if (end < 0) continue
    const candidate = tryParseBundle(text.slice(start, end + 1))
    if (candidate) return candidate
  }
  return null
}

/** Индекс `}`, закрывающей объект, открытый в `start` (строки учитываются). */
function findObjectEnd(text: string, start: number): number {
  let depth = 0
  let inString = false
  let escaped = false

  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === "\\") escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === "{") depth++
    else if (ch === "}" && --depth === 0) return i
  }
  return -1
}
