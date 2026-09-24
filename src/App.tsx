import { useEffect, useMemo, useState } from "react"
import { useDropzone } from "react-dropzone"
import { useTheme } from "next-themes"
import {
  ArrowRight,
  Bot,
  BrainCircuit,
  CircleAlert,
  CircleHelp,
  FileText,
  History,
  FileUp,
  Info,
  KeyRound,
  Layers,
  Loader2,
  Moon,
  Play,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  ServerCog,
  SquareTerminal,
  Sun,
  Trash2,
  TriangleAlert,
  Undo2,
  Users,
  type LucideIcon,
} from "lucide-react"

import { SetupGuide } from "@/components/setup-guide"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { claudeCliStatus, type Provider } from "@/lib/ai-review"
import {
  deleteReport,
  listReports,
  loadCurrentReport,
  loadReport,
  setCurrentReport,
  storeReport,
  type HistoryEntry,
} from "@/lib/history"
import { parseAllowlist } from "@/lib/local-checks"
import { runPipeline, type Stage } from "@/lib/pipeline"
import { downloadFile, markdownReport, reportBaseName } from "@/lib/report"
import { API_MODELS, CLI_MODELS, MODEL_LABELS, type ApiModel, type CliModel } from "@/lib/review-spec"
import { parseSavedReport } from "@/lib/saved-report"
import { countFindings, type Finding, type ReviewReport, type Severity } from "@/lib/types"

const SETTINGS_STORAGE = "book-check:settings"
const API_KEY_STORAGE = "book-check:api-key"

interface Settings {
  workers: number
  chunkWords: number
  cliModel: CliModel
  apiModel: ApiModel
  refreshAi: boolean
}

const DEFAULT_SETTINGS: Settings = {
  workers: 2,
  chunkWords: 2200,
  cliModel: "claude-sonnet-5",
  apiModel: "claude-opus-5",
  refreshAi: false,
}

const SEVERITY: Record<
  Severity,
  { icon: LucideIcon; label: string; variant: "destructive" | "secondary" | "outline"; pressed: string }
> = {
  error: {
    icon: CircleAlert,
    label: "Errors that are very likely wrong",
    variant: "destructive",
    pressed: "data-[pressed]:bg-red-600! data-[pressed]:border-red-600! data-[pressed]:text-white!",
  },
  warning: {
    icon: TriangleAlert,
    label: "Warnings worth a second look",
    variant: "secondary",
    pressed: "data-[pressed]:bg-amber-500! data-[pressed]:border-amber-500! data-[pressed]:text-white!",
  },
  info: {
    icon: Info,
    label: "Notes that are worth verifying",
    variant: "outline",
    pressed: "data-[pressed]:bg-sky-600! data-[pressed]:border-sky-600! data-[pressed]:text-white!",
  },
}

const SOURCE_PRESSED = "data-[pressed]:bg-primary! data-[pressed]:border-primary! data-[pressed]:text-primary-foreground!"
const UNPRESSED = "not-data-[pressed]:opacity-40 not-data-[pressed]:line-through"

const STAGE_TEXT: Record<Stage, (done: number, total: number) => string> = {
  extract: (done, total) => `Reading page ${done} of ${total}`,
  local: () => "Running spelling and grammar checks",
  ai: (done, total) => `Claude has reviewed ${done} of ${total} sections`,
  done: () => "Finishing the report",
}

function readSettings(): Settings {
  try {
    const text = localStorage.getItem(SETTINGS_STORAGE)
    const stored: Settings = text ? { ...DEFAULT_SETTINGS, ...JSON.parse(text) } : DEFAULT_SETTINGS
    return {
      ...stored,
      cliModel: CLI_MODELS.includes(stored.cliModel) ? stored.cliModel : DEFAULT_SETTINGS.cliModel,
      apiModel: API_MODELS.includes(stored.apiModel) ? stored.apiModel : DEFAULT_SETTINGS.apiModel,
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

function readStoredKey(): string {
  try {
    return localStorage.getItem(API_KEY_STORAGE) ?? ""
  } catch {
    return ""
  }
}

function writeStored(key: string, value: string) {
  try {
    if (value) localStorage.setItem(key, value)
    else localStorage.removeItem(key)
  } catch {}
}

function IconTip({ label, children }: { label: string; children: React.ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

function ThemeButton() {
  const { resolvedTheme, setTheme } = useTheme()
  const dark = resolvedTheme === "dark"
  return (
    <IconTip label={dark ? "Switch to the light theme" : "Switch to the dark theme"}>
      <Button variant="ghost" size="icon" onClick={() => setTheme(dark ? "light" : "dark")}>
        {dark ? <Sun /> : <Moon />}
      </Button>
    </IconTip>
  )
}

function SettingRow({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
      <div className="flex items-center gap-3 text-sm sm:w-72 sm:shrink-0">
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        <span>{label}</span>
      </div>
      <div className="flex flex-1 items-center gap-3">{children}</div>
    </div>
  )
}

function ModelSelect<T extends string>({
  value,
  options,
  disabled,
  onChange,
}: {
  value: T
  options: readonly T[]
  disabled: boolean
  onChange: (value: T) => void
}) {
  return (
    <Select
      value={value}
      items={options.map((option) => ({ value: option, label: MODEL_LABELS[option as CliModel] ?? option }))}
      disabled={disabled}
      onValueChange={(v) => v && onChange(v as T)}
    >
      <SelectTrigger className="w-full cursor-pointer transition-all hover:border-foreground/30 hover:bg-muted data-[popup-open]:border-ring data-[popup-open]:ring-3 data-[popup-open]:ring-ring/30 [&_svg]:transition-transform [&_svg]:duration-200 hover:[&_svg]:text-foreground data-[popup-open]:[&_svg]:rotate-180">
        <SelectValue />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {MODEL_LABELS[option as CliModel] ?? option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export default function App() {
  const [settings, setSettings] = useState<Settings>(readSettings)
  const [apiKey, setApiKey] = useState(readStoredKey)
  const [report, setReport] = useState<ReviewReport | null>(null)
  const [removed, setRemoved] = useState<{ finding: Finding; index: number }[]>([])
  const [unsaved, setUnsaved] = useState(false)
  const [stage, setStage] = useState<Stage | null>(null)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [error, setError] = useState("")
  const [cliEndpoint, setCliEndpoint] = useState<string | null>(null)
  const [useCli, setUseCli] = useState(true)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [guideOpen, setGuideOpen] = useState(false)
  const [pending, setPending] = useState<{ pdf: File; allowedWords: string[] } | null>(null)

  useEffect(() => {
    const checkCli = () => claudeCliStatus().then((status) => setCliEndpoint(status.ready ? status.endpoint : null))
    checkCli()
    window.addEventListener("focus", checkCli)
    listReports().then(setHistory)
    loadCurrentReport().then((current) => current && setReport((open) => open ?? current))
    return () => window.removeEventListener("focus", checkCli)
  }, [])

  useEffect(() => {
    if (report) storeReport(report).then(setHistory).catch(() => {})
  }, [report])

  function updateSettings(patch: Partial<Settings>) {
    setSettings((current) => {
      const next = { ...current, ...patch }
      writeStored(SETTINGS_STORAGE, JSON.stringify(next))
      return next
    })
  }

  const busy = stage !== null
  const cliReady = cliEndpoint !== null
  const usingCli = cliReady && useCli
  const provider: Provider | null = usingCli
    ? { kind: "cli", model: settings.cliModel, endpoint: cliEndpoint }
    : apiKey.trim()
      ? { kind: "api", apiKey: apiKey.trim(), model: settings.apiModel }
      : null

  function openReport(next: ReviewReport | null, isNew = false) {
    if (!next) setCurrentReport(null).catch(() => {})
    setReport(next)
    setRemoved([])
    setUnsaved(isNew)
  }

  function removeFinding(finding: Finding) {
    if (!report) return
    const index = report.findings.indexOf(finding)
    setReport({ ...report, findings: report.findings.filter((f) => f !== finding) })
    setRemoved((stack) => [...stack, { finding, index }])
    setUnsaved(true)
  }

  function undoRemove() {
    const last = removed.at(-1)
    if (!report || !last) return
    const findings = [...report.findings]
    findings.splice(last.index, 0, last.finding)
    setReport({ ...report, findings })
    setRemoved((stack) => stack.slice(0, -1))
    setUnsaved(true)
  }

  async function openSaved(id: string) {
    const saved = await loadReport(id)
    if (saved) openReport(saved)
    else setHistory(await deleteReport(id))
  }

  function saveReport() {
    if (!report) return
    downloadFile(`${reportBaseName(report)}.json`, JSON.stringify(report, null, 2), "application/json")
    setUnsaved(false)
  }

  async function handleFiles(files: File[]) {
    setError("")
    const pdf = files.find((f) => f.name.toLowerCase().endsWith(".pdf") || f.type === "application/pdf")
    const others = await Promise.all(files.filter((f) => f !== pdf).map(async (f) => ({ file: f, text: await f.text() })))
    const saved = others.map((o) => parseSavedReport(o.text)).find((r) => r !== null)
    const allowedWords = others
      .filter((o) => !o.text.trimStart().startsWith("{"))
      .flatMap((o) => parseAllowlist(o.text))

    if (!pdf && saved) {
      openReport(saved)
      return
    }
    if (pdf) {
      setPending({ pdf, allowedWords })
      return
    }
    if (pending && allowedWords.length) {
      setPending({ ...pending, allowedWords: [...pending.allowedWords, ...allowedWords] })
      return
    }
    const json = others.find((o) => o.text.trimStart().startsWith("{"))
    setError(
      json
        ? `${json.file.name} is not a saved Book Check result.`
        : "Choose a PDF to check, or a saved results JSON file to open.",
    )
  }

  async function startCheck() {
    if (!pending) return
    setError("")
    try {
      const result = await runPipeline({
        file: pending.pdf,
        provider,
        allowedWords: pending.allowedWords,
        refreshAi: settings.refreshAi,
        workers: settings.workers,
        chunkWords: settings.chunkWords,
        onStage: setStage,
        onProgress: (done, total) => setProgress({ done, total }),
      })
      setPending(null)
      openReport(result, true)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setStage(null)
    }
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop: handleFiles, disabled: busy })

  return (
    <div className="min-h-svh bg-background text-foreground">
      <main className="mx-auto flex max-w-4xl flex-col gap-8 px-4 py-12">
        <header className="flex items-center justify-between gap-4">
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Welch Labs Book Check</h1>
          <div className="flex gap-1">
            {report && removed.length > 0 && (
              <IconTip label="Put back the last finding you removed">
                <Button variant="ghost" size="icon" onClick={undoRemove}>
                  <Undo2 />
                </Button>
              </IconTip>
            )}
            {report && (
              <>
                <IconTip
                  label={
                    unsaved
                      ? "Save your changes as a JSON file you can open here again later"
                      : "Save the results as a JSON file you can open here again later"
                  }
                >
                  <Button variant={unsaved ? "default" : "ghost"} size="icon" onClick={saveReport}>
                    <Save />
                  </Button>
                </IconTip>
                <IconTip label="Download the report as Markdown">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => downloadFile(`${reportBaseName(report)}.md`, markdownReport(report), "text/markdown")}
                  >
                    <FileText />
                  </Button>
                </IconTip>
                <IconTip label="Check another file">
                  <Button variant="ghost" size="icon" onClick={() => openReport(null)}>
                    <RotateCcw />
                  </Button>
                </IconTip>
              </>
            )}
            <IconTip label="How to set up Claude reviews from scratch">
              <Button variant="ghost" size="icon" onClick={() => setGuideOpen(true)}>
                <CircleHelp />
              </Button>
            </IconTip>
            <ThemeButton />
          </div>
        </header>

        {!report && (
          <div className="flex flex-col gap-4">
            {cliReady && (
              <label className="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm">
                <SquareTerminal className="size-4 text-muted-foreground" />
                <span className="flex-1">Review with Claude through your local claude -p login</span>
                <Switch checked={useCli} disabled={busy} onCheckedChange={setUseCli} />
              </label>
            )}
            {!usingCli && (
              <div className="relative">
                <KeyRound className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="password"
                  className="pl-9"
                  placeholder="Anthropic API key for the Claude review, or leave empty to run only the built in checks"
                  value={apiKey}
                  disabled={busy}
                  onChange={(e) => {
                    setApiKey(e.target.value)
                    writeStored(API_KEY_STORAGE, e.target.value)
                  }}
                />
              </div>
            )}
            {!cliReady && (
              <button
                type="button"
                className="flex w-fit items-center gap-2 text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
                onClick={() => setGuideOpen(true)}
              >
                <CircleHelp className="size-4 shrink-0" />
                Follow the setup guide to review with your Claude account instead of an API key
              </button>
            )}

            {provider && (
              <Card size="sm">
                <CardContent className="flex flex-col gap-5">
                  <SettingRow icon={Users} label="How many Claude reviews run at the same time">
                    <Slider
                      min={1}
                      max={8}
                      step={1}
                      value={[settings.workers]}
                      disabled={busy}
                      onValueChange={(v) => updateSettings({ workers: Array.isArray(v) ? v[0] : v })}
                    />
                    <span className="w-12 text-right text-sm font-medium tabular-nums">{settings.workers}</span>
                  </SettingRow>
                  <SettingRow icon={Layers} label="How many words Claude reads in each review">
                    <Slider
                      min={500}
                      max={6000}
                      step={100}
                      value={[settings.chunkWords]}
                      disabled={busy}
                      onValueChange={(v) => updateSettings({ chunkWords: Array.isArray(v) ? v[0] : v })}
                    />
                    <span className="w-12 text-right text-sm font-medium tabular-nums">{settings.chunkWords}</span>
                  </SettingRow>
                  <SettingRow icon={BrainCircuit} label="Model that reviews each section">
                    {usingCli ? (
                      <ModelSelect
                        value={settings.cliModel}
                        options={CLI_MODELS}
                        disabled={busy}
                        onChange={(cliModel) => updateSettings({ cliModel })}
                      />
                    ) : (
                      <ModelSelect
                        value={settings.apiModel}
                        options={API_MODELS}
                        disabled={busy}
                        onChange={(apiModel) => updateSettings({ apiModel })}
                      />
                    )}
                  </SettingRow>
                  <SettingRow icon={RefreshCw} label="Review every section again instead of reusing earlier results">
                    <Switch
                      checked={settings.refreshAi}
                      disabled={busy}
                      onCheckedChange={(refreshAi) => updateSettings({ refreshAi })}
                    />
                  </SettingRow>
                  <p className="text-xs text-muted-foreground">
                    The whole book is always reviewed. It is split into sections of about{" "}
                    {settings.chunkWords.toLocaleString("en-US")} words, and {settings.workers}{" "}
                    {settings.workers === 1 ? "review works" : "reviews work"} through them at the same time. More
                    reviews finish sooner, and smaller sections catch more but take longer.
                  </p>
                </CardContent>
              </Card>
            )}

            <Card
              {...getRootProps()}
              className={`cursor-pointer border-2 border-dashed transition-colors hover:border-foreground/30 hover:bg-muted/40 ${isDragActive ? "border-primary bg-muted" : ""}`}
            >
              <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
                <input {...getInputProps()} />
                {stage ? (
                  <>
                    <Loader2 className="size-8 animate-spin text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">{STAGE_TEXT[stage](progress.done, progress.total)}</p>
                    {progress.total > 0 && stage !== "local" && (
                      <Progress value={(progress.done / progress.total) * 100} className="w-64" />
                    )}
                  </>
                ) : pending ? (
                  <>
                    <FileText className="size-8 text-foreground" />
                    <div className="flex flex-col gap-1">
                      <p className="text-sm font-medium break-all">{pending.pdf.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(pending.pdf.size / 1024 / 1024).toFixed(1)} MB
                        {pending.allowedWords.length > 0 &&
                          `, ${pending.allowedWords.length} allowed spellings from your word list`}
                        . Drop or click to choose a different file.
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <FileUp className="size-8 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      Drop a PDF to check it, or a saved results JSON file to open it again. Add a word list file to
                      allow custom spellings.
                    </p>
                  </>
                )}
              </CardContent>
            </Card>

            {pending && (
              <Button size="lg" className="h-11 w-full text-base" disabled={busy} onClick={startCheck}>
                {busy ? <Loader2 className="animate-spin" /> : <Play />}
                {provider ? "Start the check with Claude and the built in checks" : "Start the built in checks"}
              </Button>
            )}

            {error && (
              <Alert variant="destructive">
                <CircleAlert />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {history.length > 0 && (
              <div className="flex flex-col gap-2">
                <h2 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <History className="size-4" />
                  Earlier checks saved in this browser
                </h2>
                {history.map((entry) => (
                  <Card key={entry.id} size="sm" className="transition-colors hover:bg-muted/50">
                    <CardContent className="flex items-center gap-3">
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 flex-col items-start text-left"
                        disabled={busy}
                        onClick={() => openSaved(entry.id)}
                      >
                        <span className="w-full truncate text-sm font-medium">{entry.title}</span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(entry.created_at).toLocaleString()}, {entry.page_count} pages,{" "}
                          {entry.counts.total} findings
                        </span>
                      </button>
                      <div className="flex items-center gap-1.5 text-xs tabular-nums">
                        <Badge variant="destructive">{entry.counts.error}</Badge>
                        <Badge variant="secondary">{entry.counts.warning}</Badge>
                        <Badge variant="outline">{entry.counts.info}</Badge>
                      </div>
                      <IconTip label="Delete this saved check from this browser">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          disabled={busy}
                          onClick={async () => setHistory(await deleteReport(entry.id))}
                        >
                          <Trash2 />
                        </Button>
                      </IconTip>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {report && <ReportView report={report} onRemove={removeFinding} />}
      </main>
      <SetupGuide open={guideOpen} onOpenChange={setGuideOpen} />
    </div>
  )
}

function ReportView({ report, onRemove }: { report: ReviewReport; onRemove: (finding: Finding) => void }) {
  const [severities, setSeverities] = useState<Severity[]>(["error", "warning", "info"])
  const [sources, setSources] = useState<Finding["source"][]>(["local", "ai"])
  const [query, setQuery] = useState("")
  const counts = countFindings(report.findings)

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return report.findings.filter(
      (f) =>
        severities.includes(f.severity) &&
        sources.includes(f.source) &&
        (!q || [f.excerpt, f.message, f.suggestion, f.category].some((s) => s.toLowerCase().includes(q))),
    )
  }, [report.findings, severities, sources, query])

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-medium">{report.document.title}</h2>
        <p className="text-sm text-muted-foreground">
          {report.document.page_count} pages, {report.document.word_count.toLocaleString("en-US")} words,{" "}
          {counts.total} findings
        </p>
      </div>

      {(report.ai_state === "failed" || report.ai_state === "partial") && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertDescription className="whitespace-pre-wrap">{report.ai_message}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <ToggleGroup multiple variant="outline" value={severities} onValueChange={(v) => setSeverities(v as Severity[])}>
          {(Object.keys(SEVERITY) as Severity[]).map((key) => {
            const { icon: Icon, label, pressed } = SEVERITY[key]
            return (
              <IconTip key={key} label={label}>
                <ToggleGroupItem value={key} className={`${pressed} ${UNPRESSED}`}>
                  <Icon />
                  {counts[key]}
                </ToggleGroupItem>
              </IconTip>
            )
          })}
        </ToggleGroup>
        <ToggleGroup multiple variant="outline" value={sources} onValueChange={(v) => setSources(v as Finding["source"][])}>
          <IconTip label="Findings from the local spelling and grammar checks">
            <ToggleGroupItem value="local" className={`${SOURCE_PRESSED} ${UNPRESSED}`}>
              <ServerCog />
              {counts.local}
            </ToggleGroupItem>
          </IconTip>
          <IconTip label="Findings from the Claude review">
            <ToggleGroupItem value="ai" className={`${SOURCE_PRESSED} ${UNPRESSED}`}>
              <Bot />
              {counts.ai}
            </ToggleGroupItem>
          </IconTip>
        </ToggleGroup>
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search the findings for a word or phrase"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {visible.map((finding, index) => (
          <FindingCard
            key={`${index}-${finding.source}-${finding.id}`}
            finding={finding}
            onRemove={() => onRemove(finding)}
          />
        ))}
        {!visible.length && (
          <p className="py-12 text-center text-sm text-muted-foreground">Nothing matches the current filters.</p>
        )}
      </div>
    </div>
  )
}

function FindingCard({ finding, onRemove }: { finding: Finding; onRemove: () => void }) {
  const { icon: Icon, variant } = SEVERITY[finding.severity]
  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={variant}>
            <Icon />
            {finding.category}
          </Badge>
          {finding.page != null && <Badge variant="outline">Page {finding.page}</Badge>}
          <span className="ml-auto flex items-center gap-1 text-muted-foreground">
            {finding.source === "ai" ? <Bot className="size-4" /> : <ServerCog className="size-4" />}
            <IconTip label="Remove this finding because it is wrong">
              <Button variant="ghost" size="icon-sm" onClick={onRemove}>
                <Trash2 />
              </Button>
            </IconTip>
          </span>
        </div>
        <blockquote className="border-l-2 pl-3 font-serif text-sm italic">{finding.excerpt}</blockquote>
        <p className="text-sm">{finding.message}</p>
        {finding.suggestion && (
          <p className="flex items-center gap-2 text-sm font-medium">
            <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
            {finding.suggestion}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
