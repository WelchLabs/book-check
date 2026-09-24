import { countFindings, type ReviewReport } from "./types"

export function markdownReport(report: ReviewReport): string {
  const counts = countFindings(report.findings)
  const lines = [
    `# Book Check: ${report.document.title}`,
    "",
    `- Source: \`${report.document.input_path}\``,
    `- Pages: ${report.document.page_count}`,
    `- Words: ${report.document.word_count.toLocaleString("en-US")}`,
    `- Findings: ${counts.total} (${counts.error} errors, ${counts.warning} warnings, ${counts.info} notes)`,
    `- AI review: ${report.ai_state}`,
  ]
  if (report.ai_model) lines.push(`- Model: \`${report.ai_model}\``)
  if (report.ai_provider) lines.push(`- Provider: \`${report.ai_provider}\``)
  if (report.ai_message) lines.push(`- AI note: ${report.ai_message}`)
  lines.push("", "## Findings", "")
  if (!report.findings.length) lines.push("No findings.")
  for (const finding of report.findings) {
    const location = finding.page != null ? `page ${finding.page}` : "unknown page"
    lines.push(
      `### ${finding.severity.toUpperCase()} · ${finding.category} · ${location} · ${finding.source}`,
      "",
      ...(finding.excerpt ? finding.excerpt.split("\n").map((line) => `> ${line}`) : [">"]),
      "",
      finding.message,
      "",
    )
    if (finding.suggestion) lines.push(`Suggested change: \`${finding.suggestion}\``, "")
  }
  return `${lines.join("\n").trimEnd()}\n`
}

export function reportBaseName(report: ReviewReport): string {
  const stem = (report.document.input_path.split(/[\\/]/).pop() ?? "").replace(/\.[^.]+$/, "")
  const safe = stem.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[-._]+|[-._]+$/g, "") || "book"
  return `${safe}-${report.document.sha256.slice(0, 10)}`
}

export function downloadFile(name: string, contents: string, type: string) {
  const url = URL.createObjectURL(new Blob([contents], { type }))
  const link = Object.assign(document.createElement("a"), { href: url, download: name })
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
