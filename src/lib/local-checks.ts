import affUrl from "dictionary-en-files/index.aff?url"
import dicUrl from "dictionary-en-files/index.dic?url"
import nspell from "nspell"

import { findingId } from "./hashing"
import { SEVERITY_ORDER, type DocumentData, type Finding, type Severity } from "./types"

const TOKEN_PATTERN = /\b[A-Za-z][A-Za-z’'-]*\b/g
const SENTENCE_SPLIT = /(?<=[.!?])\s+/

const KNOWN_WORDS = [
  "ai", "abou", "activations", "allophones", "arpa", "backpropagation", "convolutional", "darpa",
  "differenced", "gameplay", "gpt", "harpy", "hmm", "hmms", "invariances", "itakura", "lpc", "nixon",
  "overfitting", "pretraining", "saito", "scalable", "sift", "tokenization", "waveforms", "zapdash",
]

type Draft = Omit<Finding, "id">

function draft(
  category: string,
  severity: Severity,
  page: number,
  excerpt: string,
  message: string,
  suggestion: string,
  confidence: number,
): Draft {
  return {
    source: "local",
    category,
    severity,
    page,
    chunk_id: null,
    excerpt: excerpt.trim(),
    message,
    suggestion,
    confidence,
  }
}

async function withIds(drafts: Draft[]): Promise<Finding[]> {
  return Promise.all(
    drafts.map(async (d) => ({
      id: await findingId([d.source, d.category, String(d.page), d.excerpt, d.message]),
      ...d,
    })),
  )
}

export function parseAllowlist(contents: string): string[] {
  return contents
    .split(/\r?\n/)
    .map((line) => line.trim().toLowerCase())
    .filter((word) => word && !word.startsWith("#"))
}

let spellerPromise: Promise<ReturnType<typeof nspell>> | null = null

function loadSpeller() {
  spellerPromise ??= Promise.all([affUrl, dicUrl].map((url) => fetch(url).then((r) => r.text()))).then(
    ([aff, dic]) => nspell(aff, dic),
  )
  return spellerPromise
}

const isAllLower = (token: string) => /\p{Ll}/u.test(token) && !/\p{Lu}/u.test(token)
const pause = () => new Promise((resolve) => setTimeout(resolve))

async function spellingFindings(document: DocumentData, extraWords: string[]): Promise<Draft[]> {
  const allowlist = new Set([...KNOWN_WORDS, ...extraWords])
  const occurrences = new Map<string, number[]>()
  const display = new Map<string, string>()

  for (const page of document.pages) {
    for (const match of page.text.matchAll(TOKEN_PATTERN)) {
      const token = match[0].replace(/^[’'-]+|[’'-]+$/g, "")
      const normalized = token.toLowerCase().replaceAll("’", "'")
      if ([...normalized].length < 4 || allowlist.has(normalized) || !isAllLower(token) || /\d/.test(token)) {
        continue
      }
      if (!occurrences.has(normalized)) occurrences.set(normalized, [])
      occurrences.get(normalized)!.push(page.number)
      if (!display.has(normalized)) display.set(normalized, token)
    }
  }

  const speller = await loadSpeller()
  const findings: Draft[] = []
  let checked = 0
  for (const word of [...occurrences.keys()].sort()) {
    const token = display.get(word)!
    if (speller.correct(token)) continue
    if (++checked % 25 === 0) await pause()
    const suggestions = speller.suggest(token)
    if (!suggestions.length) continue
    const occ = occurrences.get(word)!
    const pages = [...new Set(occ)].sort((a, b) => a - b)
    const location = pages.length === 1 ? `page ${pages[0]}` : `pages ${pages.slice(0, 5).join(", ")}`
    const replacement = word === "inecraft" ? "Minecraft" : suggestions[0]
    const message = `“${token}” is not in the local dictionary (${occ.length} occurrence${occ.length !== 1 ? "s" : ""}; ${location}).`
    findings.push(draft("spelling", "warning", pages[0], token, message, replacement, 0.72))
  }
  return findings
}

interface Rule {
  category: string
  severity: Severity
  regex: RegExp
  message: string
  confidence: number
  replacement: (match: RegExpMatchArray) => string
}

const SEPARATE_WORDS: Record<string, string> = { alot: "a lot", eachother: "each other", inorder: "in order" }

const RULES: Rule[] = [
  {
    category: "repetition",
    severity: "error",
    regex: /\b([A-Za-z][A-Za-z’'-]{1,})\s+\1\b/gi,
    message: "Repeated adjacent word.",
    confidence: 0.99,
    replacement: (m) => m[1],
  },
  {
    category: "punctuation",
    severity: "warning",
    regex: /(?<!\.)[!?]{2,}|,{2,}|;{2,}|:{2,}/g,
    message: "Repeated punctuation may be accidental.",
    confidence: 0.94,
    replacement: (m) => m[0][0],
  },
  {
    category: "spacing",
    severity: "warning",
    regex: /(?<!\.)[ \t]+(?:,(?!,)|[!?;:]|\.(?!\.))/g,
    message: "Unexpected space before punctuation.",
    confidence: 0.97,
    replacement: (m) => m[0].trimStart(),
  },
  {
    category: "word-choice",
    severity: "error",
    regex: /\b(could|would|should|may|might|must) of\b/gi,
    message: "Use “have” after this modal verb.",
    confidence: 0.99,
    replacement: (m) => `${m[1]} have`,
  },
  {
    category: "word-choice",
    severity: "warning",
    regex: /\b(alot|eachother|inorder)\b/gi,
    message: "This expression is normally written as separate words.",
    confidence: 0.97,
    replacement: (m) => SEPARATE_WORDS[m[1].toLowerCase()] ?? "",
  },
  {
    category: "grammar",
    severity: "error",
    regex: /\beach\s+[a-z]+\s+(are|were)\b/gi,
    message: "“Each” normally takes a singular noun and verb.",
    confidence: 0.96,
    replacement: () => "",
  },
]

const POSSESSIVE_NOUNS =
  "architecture|breakdown|content|frequency|grammar|graph|knowledge|model|objective|performance|phone|pronunciation|structure|system|transition|vocabulary"
const POSSESSIVE_RULE = new RegExp(
  `\\b(?:of|for|with|by|from|about|changed|replaced)\\s+(it['’]s\\s+(?:[A-Za-z-]+\\s+)?(?:${POSSESSIVE_NOUNS}))\\b`,
  "gi",
)

export function patternFindings(document: DocumentData): Draft[] {
  const findings: Draft[] = []
  for (const page of document.pages) {
    for (const rule of RULES) {
      for (const match of page.text.matchAll(rule.regex)) {
        findings.push(
          draft(rule.category, rule.severity, page.number, match[0], rule.message, rule.replacement(match), rule.confidence),
        )
      }
    }
    for (const match of page.text.matchAll(POSSESSIVE_RULE)) {
      findings.push(
        draft(
          "grammar",
          "error",
          page.number,
          match[1],
          "The possessive determiner “its” is likely intended here.",
          match[1].replace(/it['’]s/gi, "its"),
          0.93,
        ),
      )
    }
    for (const sentence of page.text.split(SENTENCE_SPLIT)) {
      const words = sentence.match(TOKEN_PATTERN)?.length ?? 0
      if (words >= 70 && !sentence.includes("\n\n") && !sentence.trimStart().startsWith("Figure ")) {
        const excerpt = `${[...sentence].slice(0, 180).join("").trimEnd()}…`
        const message = `This sentence contains ${words} words; consider whether it should be split.`
        findings.push(draft("readability", "info", page.number, excerpt, message, "", 0.68))
      }
    }
  }
  return findings
}

function consistencyFindings(document: DocumentData): Draft[] {
  const findings: Draft[] = []
  const variants: [string, RegExp][] = [
    ["Figure", /\bfig(?:ure)?\.?\s+\d+(?:\.\d+)?/gi],
    ["percent", /(?:\bpercent\b|%)/gi],
  ]
  for (const [label, pattern] of variants) {
    const forms = new Map<string, number>()
    const firstPage = new Map<string, number>()
    for (const page of document.pages) {
      for (const match of page.text.matchAll(pattern)) {
        const value = (label === "Figure" ? match[0].replace(/\s+\d.*/, "") : match[0]).toLowerCase()
        forms.set(value, (forms.get(value) ?? 0) + 1)
        if (!firstPage.has(value)) firstPage.set(value, page.number)
      }
    }
    if (forms.size > 1) {
      const summary = [...forms].map(([form, count]) => `“${form}” × ${count}`).join(", ")
      const page = Math.min(...firstPage.values())
      findings.push(
        draft("consistency", "info", page, summary, `Multiple ${label.toLowerCase()} styles appear in the document.`, "", 0.62),
      )
    }
  }
  return findings
}

export async function runLocalChecks(document: DocumentData, extraWords: string[]): Promise<Finding[]> {
  const drafts = [
    ...patternFindings(document),
    ...(await spellingFindings(document, extraWords)),
    ...consistencyFindings(document),
  ]
  const findings = await withIds(drafts)
  return findings.sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      (a.page ?? 0) - (b.page ?? 0) ||
      a.category.localeCompare(b.category) ||
      a.id.localeCompare(b.id),
  )
}
