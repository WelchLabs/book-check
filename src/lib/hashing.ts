export async function sha256Hex(data: BufferSource | string): Promise<string> {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
}

export async function findingId(parts: string[]): Promise<string> {
  return (await sha256Hex(parts.join("\u001f"))).slice(0, 12)
}
