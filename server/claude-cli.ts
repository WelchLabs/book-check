import { spawn } from "node:child_process"
import type { IncomingMessage, ServerResponse } from "node:http"
import type { Connect, Plugin } from "vite"
import { z } from "zod"

import { CLI_MODELS, ReviewSchema, SYSTEM_PROMPT, userPrompt, type CliModel, type RawChunkReview } from "../src/lib/review-spec.ts"

const { $schema: _metaSchema, ...schema } = z.toJSONSchema(ReviewSchema)
const SCHEMA = JSON.stringify(schema)

function claudeEnv() {
  const env = { ...process.env }
  delete env.ANTHROPIC_API_KEY
  delete env.ANTHROPIC_AUTH_TOKEN
  return env
}

function runClaude(args: string[], input = ""): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn("claude", args, { env: claudeEnv(), stdio: ["pipe", "pipe", "pipe"] })
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (data) => (stdout += data))
    child.stderr.on("data", (data) => (stderr += data))
    child.on("error", reject)
    child.on("close", (code) => resolve({ code, stdout, stderr }))
    child.stdin.end(input)
  })
}

export async function claudeStatus(): Promise<{ ready: boolean; message: string }> {
  try {
    const { stdout } = await runClaude(["auth", "status"])
    const loggedIn = Boolean(JSON.parse(stdout).loggedIn)
    return { ready: loggedIn, message: loggedIn ? "" : "Claude CLI is not logged in. Run `claude auth login`." }
  } catch {
    return { ready: false, message: "Claude CLI is not installed." }
  }
}

function resultEnvelope(stdout: string): Record<string, unknown> {
  for (const line of stdout.split("\n").reverse()) {
    if (!line.trim().startsWith("{")) continue
    try {
      const value = JSON.parse(line)
      if (value.type === "result") return value
    } catch {}
  }
  throw new Error("Claude did not return a result envelope.")
}

export async function reviewWithClaude(text: string, model: CliModel): Promise<RawChunkReview> {
  const prompt = `Do not inspect the filesystem, run commands, browse, or use tools. Review only the excerpt supplied below and return the requested structured result.\n\n${userPrompt(text)}`
  const { code, stdout, stderr } = await runClaude(
    [
      "-p",
      "--model", model,
      "--append-system-prompt", SYSTEM_PROMPT,
      "--output-format", "json",
      "--json-schema", SCHEMA,
      "--permission-mode", "default",
      "--disallowed-tools", "Bash,Edit,Write,Read,WebFetch,WebSearch",
    ],
    prompt,
  )

  let envelope: Record<string, unknown>
  try {
    envelope = resultEnvelope(stdout)
  } catch (error) {
    throw new Error(stderr.trim().split("\n").pop() || (error as Error).message)
  }
  if (code !== 0 || envelope.is_error) {
    const detail = typeof envelope.result === "string" && envelope.result ? envelope.result : stderr.trim().split("\n").pop()
    throw new Error(detail || "Claude review failed.")
  }

  const structured = envelope.structured_output ?? JSON.parse(String(envelope.result ?? "null"))
  const usage = (envelope.usage ?? {}) as Record<string, number>
  return {
    result: ReviewSchema.parse(structured),
    input_tokens: usage.input_tokens ?? 0,
    output_tokens: usage.output_tokens ?? 0,
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

export async function handleClaudeRequest(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const path = req.url?.split("?")[0]
  if (path === "/api/claude/status" && req.method === "GET") {
    sendJson(res, 200, await claudeStatus())
    return true
  }
  if (path === "/api/claude/review" && req.method === "POST") {
    try {
      const { text, model } = JSON.parse(await readBody(req)) as { text: string; model: CliModel }
      if (!CLI_MODELS.includes(model)) throw new Error(`Unknown model: ${model}`)
      sendJson(res, 200, await reviewWithClaude(text, model))
    } catch (error) {
      sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) })
    }
    return true
  }
  return false
}

const middleware: Connect.NextHandleFunction = async (req, res, next) => {
  if (!(await handleClaudeRequest(req, res))) next()
}

export function claudeCliPlugin(): Plugin {
  return {
    name: "claude-cli",
    configureServer: (server) => void server.middlewares.use(middleware),
    configurePreviewServer: (server) => void server.middlewares.use(middleware),
  }
}
