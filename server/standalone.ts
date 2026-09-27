import { createServer } from "node:http"

import { claudeStatus, handleClaudeRequest } from "./claude-cli.ts"
import { codexStatus, handleCodexRequest } from "./codex-cli.ts"

const port = Number(process.env.PORT ?? 4317)
const allowedOrigins = [
  "https://welchlabs.github.io",
  ...(process.env.BOOK_CHECK_ORIGINS ?? "").split(",").map((o) => o.trim()).filter(Boolean),
]

function originAllowed(origin: string | undefined): boolean {
  if (!origin) return true
  if (allowedOrigins.includes(origin)) return true
  try {
    const { hostname } = new URL(origin)
    return hostname === "localhost" || hostname === "127.0.0.1"
  } catch {
    return false
  }
}

const server = createServer(async (req, res) => {
  const origin = req.headers.origin
  if (!originAllowed(origin)) {
    res.statusCode = 403
    res.end("Origin not allowed")
    return
  }
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin)
    res.setHeader("Vary", "Origin")
  }
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "GET, POST")
    res.setHeader("Access-Control-Allow-Headers", "Content-Type")
    res.setHeader("Access-Control-Allow-Private-Network", "true")
    res.statusCode = 204
    res.end()
    return
  }
  if (!(await handleClaudeRequest(req, res)) && !(await handleCodexRequest(req, res))) {
    res.statusCode = 404
    res.end("Not found")
  }
})

server.listen(port, "127.0.0.1", async () => {
  const [claude, codex] = await Promise.all([claudeStatus(), codexStatus()])
  console.log(`Book Check is listening for Claude and Codex reviews on http://localhost:${port}`)
  console.log(`Allowed sites: ${allowedOrigins.join(", ")}, and any localhost page`)
  if (!claude.ready) console.log(claude.message)
  if (!codex.ready) console.log(codex.message)
})
