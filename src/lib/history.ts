import { createStore, del, get, set } from "idb-keyval"

import { countFindings, type Counts, type ReviewReport } from "./types"

const store = createStore("book-check", "reports")

export interface HistoryEntry {
  id: string
  title: string
  created_at: string
  saved_at: string
  page_count: number
  counts: Counts
}

export const reportId = (report: ReviewReport) => `${report.document.sha256.slice(0, 16)}-${report.created_at}`

async function readIndex(): Promise<HistoryEntry[]> {
  return (await get<HistoryEntry[]>("index", store)) ?? []
}

export async function listReports(): Promise<HistoryEntry[]> {
  try {
    return await readIndex()
  } catch {
    return []
  }
}

export async function storeReport(report: ReviewReport): Promise<HistoryEntry[]> {
  const id = reportId(report)
  const entry: HistoryEntry = {
    id,
    title: report.document.title,
    created_at: report.created_at,
    saved_at: new Date().toISOString(),
    page_count: report.document.page_count,
    counts: countFindings(report.findings),
  }
  await set(`report:${id}`, report, store)
  const index = [entry, ...(await readIndex()).filter((e) => e.id !== id)]
  await set("index", index, store)
  await set("current", id, store)
  return index
}

export async function loadReport(id: string): Promise<ReviewReport | null> {
  return (await get<ReviewReport>(`report:${id}`, store)) ?? null
}

export async function deleteReport(id: string): Promise<HistoryEntry[]> {
  await del(`report:${id}`, store)
  const index = (await readIndex()).filter((e) => e.id !== id)
  await set("index", index, store)
  if ((await get<string>("current", store)) === id) await del("current", store)
  return index
}

export async function setCurrentReport(id: string | null) {
  if (id) await set("current", id, store)
  else await del("current", store)
}

export async function loadCurrentReport(): Promise<ReviewReport | null> {
  try {
    const id = await get<string>("current", store)
    return id ? await loadReport(id) : null
  } catch {
    return null
  }
}

const chunkStore = createStore("book-check-chunks", "reviews")

export async function readChunkCache<T>(key: string): Promise<T | null> {
  try {
    return (await get<T>(key, chunkStore)) ?? null
  } catch {
    return null
  }
}

export async function writeChunkCache<T>(key: string, value: T) {
  try {
    await set(key, value, chunkStore)
  } catch {}
}
