import { runAiReview, type Provider } from "./ai-review"
import { extractDocument } from "./extract"
import { runLocalChecks } from "./local-checks"
import { SEVERITY_ORDER, type AiState, type AiUsage, type Finding, type ReviewReport } from "./types"

export type Stage = "extract" | "local" | "ai" | "done"

export interface PipelineOptions {
  file: File
  provider: Provider | null
  allowedWords: string[]
  refreshAi: boolean
  workers: number
  chunkWords: number
  onStage: (stage: Stage) => void
  onProgress: (done: number, total: number) => void
}

function findingGroup(category: string): string {
  if (category === "spelling" || category === "extraction") return "word"
  if (category === "grammar" || category === "usage" || category === "word-choice") return "language"
  if (category === "typography" || category === "punctuation") return "mechanics"
  return category
}

function normalizedWords(value: string): Set<string> {
  return new Set(value.toLowerCase().replaceAll("’", "'").match(/[\p{L}\p{N}]+/gu) ?? [])
}

function duplicateFinding(local: Finding, ai: Finding): boolean {
  if (local.page !== ai.page || local.severity === "info") return false
  if (findingGroup(local.category) !== findingGroup(ai.category)) return false
  const localWords = normalizedWords(local.excerpt)
  const aiWords = normalizedWords(ai.excerpt)
  if (!localWords.size || !aiWords.size) return false
  const smallest = Math.min(localWords.size, aiWords.size)
  if (localWords.size === aiWords.size && localWords.isSubsetOf(aiWords)) return true
  if (smallest <= 4 && (localWords.isSubsetOf(aiWords) || aiWords.isSubsetOf(localWords))) return true
  const similarity = localWords.intersection(aiWords).size / localWords.union(aiWords).size
  return similarity >= 0.5 && smallest <= 4
}

export function mergeFindings(local: Finding[], ai: Finding[]): Finding[] {
  return [...local.filter((l) => !ai.some((a) => duplicateFinding(l, a))), ...ai].filter(
    (finding) => finding.category.toLowerCase() !== "hyphenation",
  )
}

export async function runPipeline(options: PipelineOptions): Promise<ReviewReport> {
  const { file, provider, allowedWords, refreshAi, workers, chunkWords, onStage, onProgress } = options

  onStage("extract")
  const document = await extractDocument(file, chunkWords, onProgress)

  onStage("local")
  const localFindings = await runLocalChecks(document, allowedWords)

  let aiFindings: Finding[] = []
  let aiUsage: AiUsage = { calls: 0, cached_chunks: 0, input_tokens: 0, output_tokens: 0 }
  let aiState: AiState = "skipped"
  let aiMessage = provider ? "" : "AI review skipped."

  if (provider) {
    onStage("ai")
    onProgress(0, document.chunks.length)
    const result = await runAiReview(document.chunks, provider, refreshAi, workers, onProgress)
    aiFindings = result.findings
    aiUsage = result.usage
    const completed = aiUsage.calls + aiUsage.cached_chunks
    aiState = result.errors.length ? (completed > 0 ? "partial" : "failed") : "complete"
    aiMessage = result.errors.join("\n")
  }

  const findings = mergeFindings(localFindings, aiFindings).sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      (a.page ?? 0) - (b.page ?? 0) ||
      a.source.localeCompare(b.source) ||
      a.category.localeCompare(b.category),
  )

  onStage("done")
  return {
    version: "2",
    created_at: new Date().toISOString(),
    document,
    findings,
    ai_provider: provider ? (provider.kind === "cli" ? "claude" : "claude-api") : null,
    ai_model: provider?.model ?? null,
    ai_state: aiState,
    ai_message: aiMessage,
    ai_usage: aiUsage,
    output_dir: "",
  }
}
