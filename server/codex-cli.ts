import { spawn } from "node:child_process"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { IncomingMessage, ServerResponse } from "node:http"
import type { Connect, Plugin } from "vite"
import { z } from "zod"

import { CODEX_EFFORTS, CODEX_MODEL, ReviewSchema, SYSTEM_PROMPT, userPrompt, type CodexEffort, type CodexModelOption, type RawChunkReview } from "../src/lib/review-spec.ts"

const { $schema: _metaSchema, ...schema } = z.toJSONSchema(ReviewSchema)

function codexEnv() {
  const env = { ...process.env }
  delete env.OPENAI_API_KEY
  delete env.CODEX_API_KEY
  return env
}

function runCodex(args: string[], input = "", cwd?: string): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn("codex", args, { cwd, env: codexEnv(), stdio: ["pipe", "pipe", "pipe"] })
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (data) => (stdout += data))
    child.stderr.on("data", (data) => (stderr += data))
    child.on("error", reject)
    child.on("close", (code) => resolve({ code, stdout, stderr }))
    child.stdin.end(input)
  })
}

let modelCache: { at: number; models: CodexModelOption[] } | null = null

async function codexModels(): Promise<CodexModelOption[]> {
  if (modelCache && Date.now() - modelCache.at < 5 * 60_000) return modelCache.models
  const { code, stdout, stderr } = await runCodex(["debug", "models"])
  if (code !== 0) throw new Error(stderr.trim().split("\n").pop() || "Could not load Codex models.")
  const catalog = JSON.parse(stdout) as { models?: Array<{
    slug?: string
    display_name?: string
    description?: string
    visibility?: string
    default_reasoning_level?: string
    supported_reasoning_levels?: Array<{ effort?: string }>
  }> }
  const models = (catalog.models ?? [])
    .filter((item) => item.visibility === "list" && typeof item.slug === "string")
    .map((item) => ({
      id: item.slug!,
      label: item.display_name || item.slug!,
      description: item.description || "",
      defaultEffort: item.default_reasoning_level || "medium",
      efforts: (item.supported_reasoning_levels ?? [])
        .map((level) => level.effort)
        .filter((effort): effort is (typeof CODEX_EFFORTS)[number] => CODEX_EFFORTS.includes(effort as (typeof CODEX_EFFORTS)[number])),
    }))
  modelCache = { at: Date.now(), models }
  return models
}

export async function codexStatus(): Promise<{ ready: boolean; message: string; models: CodexModelOption[] }> {
  try {
    const { code } = await runCodex(["login", "status"])
    if (code !== 0) return { ready: false, message: "Codex CLI is not logged in. Run `codex login`.", models: [] }
    const models = await codexModels()
    return { ready: models.length > 0, message: models.length ? "" : "Codex has no selectable models.", models }
  } catch {
    return { ready: false, message: "Codex CLI or its model catalog is unavailable.", models: [] }
  }
}

export async function reviewWithCodex(text: string, model: string, effort: CodexEffort = "default"): Promise<RawChunkReview> {
  const selected = model === CODEX_MODEL ? undefined : (await codexModels()).find((option) => option.id === model)
  if (model !== CODEX_MODEL && !selected) throw new Error(`Unknown Codex model: ${model}`)
  if (effort !== "default" && (!selected || !selected.efforts.includes(effort))) throw new Error(`Unsupported reasoning effort: ${effort}`)
  const directory = await mkdtemp(join(tmpdir(), "book-check-codex-"))
  const schemaPath = join(directory, "schema.json")
  const resultPath = join(directory, "result.json")
  try {
    await writeFile(schemaPath, JSON.stringify(schema))
    const prompt = `${SYSTEM_PROMPT}\n\nDo not inspect files, run commands, browse, or use tools. Review only the excerpt supplied below. Return the structured result.\n\n${userPrompt(text)}`
    const { code, stdout, stderr } = await runCodex(
      ["exec", "--skip-git-repo-check", "--ephemeral", "--sandbox", "read-only", ...(model === CODEX_MODEL ? [] : ["--model", model]), ...(effort === "default" ? [] : ["-c", `model_reasoning_effort=${effort}`]), "--output-schema", schemaPath, "--output-last-message", resultPath, "--json", "-"],
      prompt,
      directory,
    )
    if (code !== 0) throw new Error(stderr.trim().split("\n").pop() || "Codex review failed.")
    const result = ReviewSchema.parse(JSON.parse(await readFile(resultPath, "utf8")))
    let inputTokens = 0
    let outputTokens = 0
    for (const line of stdout.split("\n")) {
      if (!line.trim()) continue
      try {
        const event = JSON.parse(line) as { type?: string; usage?: { input_tokens?: number; output_tokens?: number } }
        if (event.type === "turn.completed") {
          inputTokens = event.usage?.input_tokens ?? 0
          outputTokens = event.usage?.output_tokens ?? 0
        }
      } catch {}
    }
    return { result, input_tokens: inputTokens, output_tokens: outputTokens }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader("Content-Type", "application/json")
  res.end(JSON.stringify(body))
}

async function readBody(req: IncomingMessage): Promise<string> {
  let body = ""
  for await (const chunk of req) body += chunk
  return body
}

export async function handleCodexRequest(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const path = req.url?.split("?")[0]
  if (path === "/api/codex/status" && req.method === "GET") {
    sendJson(res, 200, await codexStatus())
    return true
  }
  if (path === "/api/codex/review" && req.method === "POST") {
    try {
      const { text, model, effort = "default" } = JSON.parse(await readBody(req)) as { text: unknown; model: unknown; effort?: unknown }
      if (typeof model !== "string" || typeof text !== "string" || !text.trim() || typeof effort !== "string") throw new Error("Invalid Codex review request.")
      sendJson(res, 200, await reviewWithCodex(text, model, effort as CodexEffort))
    } catch (error) {
      sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) })
    }
    return true
  }
  return false
}

const middleware: Connect.NextHandleFunction = async (req, res, next) => {
  if (!(await handleCodexRequest(req, res))) next()
}

export function codexCliPlugin(): Plugin {
  return {
    name: "codex-cli",
    configureServer: (server) => void server.middlewares.use(middleware),
    configurePreviewServer: (server) => void server.middlewares.use(middleware),
  }
}
