import { z } from "zod"

export const PROMPT_VERSION = "2026-07-03.1"

export const MODELS = [
  "claude-fable-5-1",
  "claude-opus-5-5",
  "claude-opus-5",
  "claude-sonnet-5",
  "claude-haiku-4-5",
] as const
export type Model = (typeof MODELS)[number]

export const MODEL_LABELS: Record<Model, string> = {
  "claude-fable-5-1": "Claude Fable 5.1",
  "claude-opus-5-5": "Claude Opus 5.5",
  "claude-opus-5": "Claude Opus 5",
  "claude-sonnet-5": "Claude Sonnet 5",
  "claude-haiku-4-5": "Claude Haiku 4.5",
}

export const CLI_MODELS = MODELS
export type CliModel = Model

export const API_MODELS = MODELS
export type ApiModel = Model

export const FALLBACK_MODELS: readonly Model[] = ["claude-fable-5-1", "claude-opus-5"]

export const SYSTEM_PROMPT = `You are a meticulous senior copy editor reviewing extracted pages from a designed nonfiction book.

Return only high-confidence, actionable findings. Check spelling, grammar, punctuation, usage, typography, internal consistency, clarity, citation formatting, factual-risk signals, and extraction corruption. Preserve the author's voice. Do not rewrite merely for personal preference. Do not flag text that is clearly part of a diagram, quoted historical source, bibliography entry, phonetic notation, running header, or intentional stylistic choice. Distinguish a PDF extraction artifact from an error likely present in the printed page. If uncertain, omit the finding.

Never raise hyphenation issues: do not flag hyphens, hyphenated or unhyphenated compounds, en dashes, or em dashes. Skip any finding that is only about hyphenation or dash style.

For each finding, quote the smallest exact excerpt, report the page from the nearest [[PAGE N]] marker, explain the issue in one concise sentence, and provide a direct replacement when possible. Severity is error for highly likely correctness problems, warning for likely editorial problems, and info for worthwhile consistency or verification notes. Return at most 12 findings.`

export const CATEGORIES = [
  "spelling",
  "grammar",
  "punctuation",
  "usage",
  "typography",
  "consistency",
  "clarity",
  "citation",
  "factual-risk",
  "extraction",
  "structure",
] as const

export const ReviewSchema = z.object({
  findings: z.array(
    z.object({
      category: z.enum(CATEGORIES),
      severity: z.enum(["error", "warning", "info"]),
      page: z.number().int(),
      excerpt: z.string(),
      message: z.string(),
      suggestion: z.string(),
      confidence: z.number(),
    }),
  ),
})

export type ReviewResult = z.infer<typeof ReviewSchema>

export interface RawChunkReview {
  result: ReviewResult
  input_tokens: number
  output_tokens: number
}

export const userPrompt = (text: string) => `Review this book excerpt:\n\n${text}`
