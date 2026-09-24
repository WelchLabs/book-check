export type Severity = "error" | "warning" | "info"

export const SEVERITY_ORDER: Record<Severity, number> = { error: 0, warning: 1, info: 2 }

export interface PageData {
  number: number
  text: string
  word_count: number
}

export interface ChunkData {
  id: string
  page_start: number
  page_end: number
  text: string
  word_count: number
}

export interface DocumentData {
  input_path: string
  title: string
  author: string
  page_count: number
  word_count: number
  sha256: string
  metadata: Record<string, string>
  pages: PageData[]
  chunks: ChunkData[]
}

export interface Finding {
  id: string
  source: "local" | "ai"
  category: string
  severity: Severity
  page: number | null
  chunk_id: string | null
  excerpt: string
  message: string
  suggestion: string
  confidence: number
}

export interface AiUsage {
  calls: number
  cached_chunks: number
  input_tokens: number
  output_tokens: number
}

export type AiState = "skipped" | "complete" | "partial" | "failed"

export interface ReviewReport {
  version: string
  created_at: string
  document: DocumentData
  findings: Finding[]
  ai_provider: string | null
  ai_model: string | null
  ai_state: AiState
  ai_message: string
  ai_usage: AiUsage
  output_dir: string
}

export interface Counts {
  total: number
  error: number
  warning: number
  info: number
  local: number
  ai: number
}

export function countFindings(findings: Finding[]): Counts {
  const counts: Counts = { total: findings.length, error: 0, warning: 0, info: 0, local: 0, ai: 0 }
  for (const finding of findings) {
    counts[finding.severity] += 1
    counts[finding.source] += 1
  }
  return counts
}
