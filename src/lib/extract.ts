import type { TextItem } from "pdfjs-dist/types/src/display/api"
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url"

import { sha256Hex } from "./hashing"
import type { ChunkData, DocumentData, PageData } from "./types"

const WORD_PATTERN = /[\p{L}\p{N}_’'-]+/gu
const ALPHA_RUN = /[A-Za-z]+/g
const VOL_MARKER = /\bV\s+o\s+L\s*\./i
const BLANK_LINE = /\n\s*\n/
const PAGE_NUMBER_ONLY = /^\d{1,4}$/

export function countWords(text: string): number {
  return text.match(WORD_PATTERN)?.length ?? 0
}

export function normalizeText(text: string): string {
  return text
    .normalize("NFKC")
    .replaceAll("­", "")
    .replaceAll(" ", " ")
    .replace(/([a-z])-\s*\n\s*([a-z])/g, "$1$2")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

export function proseText(text: string): string {
  const paragraphs: string[] = []
  for (const block of normalizeText(text).split(BLANK_LINE)) {
    const lines: string[] = []
    for (const rawLine of block.split("\n")) {
      const line = rawLine.trim()
      const tokens = line.match(ALPHA_RUN) ?? []
      const spacedRatio = tokens.length ? tokens.filter((t) => t.length === 1).length / tokens.length : 0
      if (line.includes("|") && VOL_MARKER.test(line)) continue
      if (tokens.length >= 7 && spacedRatio >= 0.7) continue
      if (line) lines.push(line)
    }
    if (!lines.length) continue
    if (lines.length === 1 && PAGE_NUMBER_ONLY.test(lines[0])) continue
    paragraphs.push(lines.join(" ").replace(/\s{2,}/g, " "))
  }
  return paragraphs.join("\n\n")
}

export function splitChunks(pages: PageData[], targetWords: number): ChunkData[] {
  const target = Math.max(targetWords, 300)
  const chunks: ChunkData[] = []
  let parts: string[] = []
  let words = 0
  let pageStart = 1
  let pageEnd = 1

  const flush = () => {
    const text = parts.join("\n\n").trim()
    if (text) {
      chunks.push({
        id: `chunk-${String(chunks.length + 1).padStart(4, "0")}`,
        page_start: pageStart,
        page_end: pageEnd,
        text,
        word_count: countWords(text),
      })
    }
    parts = []
    words = 0
  }

  for (const page of pages) {
    const paragraphs = page.text.split(BLANK_LINE).map((p) => p.trim()).filter(Boolean)
    for (const paragraph of paragraphs) {
      const paragraphWords = countWords(paragraph)
      if (parts.length && words + paragraphWords > target) flush()
      if (!parts.length) {
        pageStart = page.number
        parts.push(`[[PAGE ${page.number}]]`)
      } else if (page.number !== pageEnd) {
        parts.push(`[[PAGE ${page.number}]]`)
      }
      parts.push(paragraph)
      words += paragraphWords
      pageEnd = page.number
    }
  }
  flush()
  return chunks
}

function pageText(items: TextItem[]): string {
  let text = ""
  let lastY: number | null = null
  let lastHeight = 0
  for (const item of items) {
    const y = item.transform[5]
    const height = item.height || lastHeight
    if (lastY !== null && item.str) {
      const gap = Math.abs(lastY - y)
      const lineHeight = Math.max(height, lastHeight)
      if (gap > lineHeight * 0.5) text += gap > lineHeight * 1.8 ? "\n\n" : "\n"
    }
    text += item.str
    if (item.str) {
      lastY = y
      lastHeight = height
    }
  }
  return text
}

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1).toLowerCase())
    .join(" ")
}

export async function extractDocument(
  file: File,
  chunkWords: number,
  onPage?: (done: number, total: number) => void,
): Promise<DocumentData> {
  if (!file.name.toLowerCase().endsWith(".pdf")) throw new Error(`Expected a PDF file: ${file.name}`)

  const buffer = await file.arrayBuffer()
  const sha256 = await sha256Hex(buffer)
  const { getDocument, GlobalWorkerOptions } = await import("pdfjs-dist")
  GlobalWorkerOptions.workerSrc = workerUrl
  const task = getDocument({ data: new Uint8Array(buffer) })
  const pdf = await task.promise

  const metadata: Record<string, string> = {}
  const { info } = await pdf.getMetadata()
  for (const [key, value] of Object.entries((info ?? {}) as Record<string, unknown>)) {
    if (typeof value === "string" || typeof value === "number") metadata[key] = String(value)
  }

  const pages: PageData[] = []
  for (let number = 1; number <= pdf.numPages; number++) {
    const page = await pdf.getPage(number)
    const content = await page.getTextContent()
    const items = content.items.filter((item): item is TextItem => "str" in item)
    const text = proseText(pageText(items))
    pages.push({ number, text, word_count: countWords(text) })
    page.cleanup()
    onPage?.(number, pdf.numPages)
  }
  await task.destroy()

  const stem = file.name.replace(/\.[^.]+$/, "")
  let title = metadata.Title || stem
  if (title.toLowerCase().endsWith(".indd")) {
    title = titleCase(title.replace(/\.[^.]+$/, "").replaceAll("_", " "))
  }

  const wordCount = pages.reduce((sum, page) => sum + page.word_count, 0)
  if (wordCount === 0) {
    throw new Error(`No extractable text found in ${file.name} (the PDF may contain only scanned images).`)
  }

  return {
    input_path: file.name,
    title,
    author: metadata.Author ?? "",
    page_count: pages.length,
    word_count: wordCount,
    sha256,
    metadata,
    pages,
    chunks: splitChunks(pages, chunkWords),
  }
}
