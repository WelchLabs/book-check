import { z } from "zod"

import type { ReviewReport } from "./types"

const FindingSchema = z.object({
  id: z.string().default(""),
  source: z.enum(["local", "ai"]).catch("ai"),
  category: z.string().default("other"),
  severity: z.enum(["error", "warning", "info"]).catch("info"),
  page: z.number().nullable().default(null),
  chunk_id: z.string().nullable().default(null),
  excerpt: z.string().default(""),
  message: z.string().default(""),
  suggestion: z.string().default(""),
  confidence: z.number().default(1),
})

const DocumentSchema = z.object({
  input_path: z.string().default(""),
  title: z.string(),
  author: z.string().default(""),
  page_count: z.number().default(0),
  word_count: z.number().default(0),
  sha256: z.string().default(""),
  metadata: z
    .record(z.string(), z.unknown())
    .default({})
    .transform((m) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, String(v)]))),
  pages: z
    .array(z.object({ number: z.number(), text: z.string().default(""), word_count: z.number().default(0) }))
    .default([]),
  chunks: z
    .array(
      z.object({
        id: z.string(),
        page_start: z.number(),
        page_end: z.number(),
        text: z.string().default(""),
        word_count: z.number().default(0),
      }),
    )
    .default([]),
})

const ReportSchema = z.object({
  version: z.string().default("2"),
  created_at: z.string().default(""),
  document: DocumentSchema,
  findings: z.array(FindingSchema),
  ai_provider: z.string().nullable().default(null),
  ai_model: z.string().nullable().default(null),
  ai_state: z.enum(["skipped", "complete", "partial", "failed"]).catch("skipped"),
  ai_message: z.string().default(""),
  ai_usage: z
    .object({
      calls: z.number().default(0),
      cached_chunks: z.number().default(0),
      input_tokens: z.number().default(0),
      output_tokens: z.number().default(0),
    })
    .default({ calls: 0, cached_chunks: 0, input_tokens: 0, output_tokens: 0 }),
  output_dir: z.string().default(""),
})

export function parseSavedReport(text: string): ReviewReport | null {
  let data: unknown
  try {
    data = JSON.parse(text.replace(/^﻿/, ""))
  } catch {
    return null
  }
  const parsed = ReportSchema.safeParse(data)
  return parsed.success ? parsed.data : null
}
