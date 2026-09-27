import { findingId, sha256Hex } from "./hashing"
import { readChunkCache, writeChunkCache } from "./history"
import {
  FALLBACK_MODELS,
  PROMPT_VERSION,
  ReviewSchema,
  SYSTEM_PROMPT,
  userPrompt,
  type ApiModel,
  type CliModel,
  type CodexModel,
  type CodexEffort,
  type CodexModelOption,
  type ClaudeEffort,
  type RawChunkReview,
} from "./review-spec"
import type { AiUsage, ChunkData, Finding } from "./types"

export type Provider =
  | { kind: "cli"; model: CliModel; effort?: ClaudeEffort; endpoint: string }
  | { kind: "codex"; model: CodexModel; effort: CodexEffort; endpoint: string }
  | { kind: "api"; apiKey: string; model: ApiModel; effort?: ClaudeEffort }

type Reviewer = (text: string) => Promise<RawChunkReview>

class AuthError extends Error {}

async function apiReviewer(apiKey: string, model: ApiModel, effort?: ClaudeEffort): Promise<Reviewer> {
  const [{ default: Anthropic }, { betaZodOutputFormat }] = await Promise.all([
    import("@anthropic-ai/sdk"),
    import("@anthropic-ai/sdk/helpers/beta/zod"),
  ])
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
  return async (text) => {
    try {
      const response = await client.beta.messages.parse({
        model,
        max_tokens: 16000,
        ...(FALLBACK_MODELS.includes(model)
          ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
          : {}),
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt(text) }],
        output_config: { format: betaZodOutputFormat(ReviewSchema), ...(effort ? { effort } : {}) },
      })
      if (response.stop_reason === "refusal") throw new Error("Claude declined to review this excerpt.")
      if (!response.parsed_output) throw new Error("Claude completed without a structured result.")
      return {
        result: response.parsed_output,
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
      }
    } catch (error) {
      if (error instanceof Anthropic.AuthenticationError) throw new AuthError("The Anthropic API key was rejected.")
      throw error
    }
  }
}

export const HELPER_URL = "http://localhost:4317"

const cliEndpoints = (name: "claude" | "codex") => [`/api/${name}`, `${HELPER_URL}/api/${name}`]

const cliReviewer = (model: CliModel | CodexModel, endpoint: string, effort?: CodexEffort | ClaudeEffort): Reviewer => async (text) => {
  const response = await fetch(`${endpoint}/review`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, model, effort }),
  })
  const body = await response.json()
  if (!response.ok) throw new Error(body.error ?? "AI review failed.")
  return body as RawChunkReview
}

export async function cliStatus(name: "claude" | "codex"): Promise<{ ready: boolean; message: string; endpoint: string | null; models?: CodexModelOption[] }> {
  for (const endpoint of cliEndpoints(name)) {
    try {
      const response = await fetch(`${endpoint}/status`)
      if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) continue
      const status = (await response.json()) as { ready: boolean; message: string; models?: CodexModelOption[] }
      return { ...status, endpoint }
    } catch {}
  }
  return { ready: false, message: "", endpoint: null }
}

interface ChunkReview {
  chunk_id: string
  findings: Finding[]
  input_tokens: number
  output_tokens: number
  cached?: boolean
}

const cacheKey = (chunk: ChunkData, provider: Provider) =>
  sha256Hex([PROMPT_VERSION, provider.kind === "cli" ? "claude" : provider.kind === "codex" ? "codex" : "claude-api", provider.model, provider.effort ?? "", chunk.text].join("\u001f"))

async function reviewChunk(
  review: Reviewer,
  provider: Provider,
  chunk: ChunkData,
  refresh: boolean,
): Promise<ChunkReview> {
  const key = await cacheKey(chunk, provider)
  if (!refresh) {
    const cached = await readChunkCache<ChunkReview>(key)
    if (cached && cached.chunk_id === chunk.id) return { ...cached, cached: true }
  }

  const raw = await review(chunk.text)
  const findings = await Promise.all(
    raw.result.findings.map(async (item): Promise<Finding> => {
      const page = item.page < chunk.page_start || item.page > chunk.page_end ? chunk.page_start : item.page
      return {
        id: await findingId(["ai", item.category, String(page), item.excerpt, item.message]),
        source: "ai",
        category: item.category,
        severity: item.severity,
        page,
        chunk_id: chunk.id,
        excerpt: item.excerpt,
        message: item.message,
        suggestion: item.suggestion,
        confidence: item.confidence,
      }
    }),
  )
  const result: ChunkReview = {
    chunk_id: chunk.id,
    findings,
    input_tokens: raw.input_tokens,
    output_tokens: raw.output_tokens,
  }
  await writeChunkCache(key, result)
  return result
}

export async function runAiReview(
  chunks: ChunkData[],
  provider: Provider,
  refresh: boolean,
  workers: number,
  progress: (done: number, total: number) => void,
): Promise<{ findings: Finding[]; usage: AiUsage; errors: string[] }> {
  const review =
    provider.kind === "cli" || provider.kind === "codex"
      ? cliReviewer(provider.model, provider.endpoint, provider.effort)
      : await apiReviewer(provider.apiKey, provider.model, provider.effort)
  const reviews: ChunkReview[] = []
  const errors: string[] = []
  let next = 0
  let done = 0

  const worker = async () => {
    while (next < chunks.length) {
      const chunk = chunks[next++]
      try {
        reviews.push(await reviewChunk(review, provider, chunk, refresh))
      } catch (error) {
        if (error instanceof AuthError) {
          if (!errors.includes(error.message)) errors.push(error.message)
          next = chunks.length
          break
        }
        errors.push(`${chunk.id}: ${error instanceof Error ? error.message : String(error)}`)
      }
      progress(++done, chunks.length)
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, workers) }, worker))

  reviews.sort((a, b) => a.chunk_id.localeCompare(b.chunk_id))
  const fresh = reviews.filter((r) => !r.cached)
  return {
    findings: reviews.flatMap((r) => r.findings),
    usage: {
      calls: fresh.length,
      cached_chunks: reviews.length - fresh.length,
      input_tokens: fresh.reduce((sum, r) => sum + r.input_tokens, 0),
      output_tokens: fresh.reduce((sum, r) => sum + r.output_tokens, 0),
    },
    errors,
  }
}
