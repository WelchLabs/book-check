import { useState } from "react"
import { Check, Copy, ExternalLink } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

const HELPER_FILE_URL = "https://welchlabs.github.io/book-check/book-check-helper.mjs"

type System = "mac" | "windows"
type Service = "claude" | "codex"

interface Step {
  title: string
  detail?: string
  command?: string
  link?: { href: string; label: string }
}

const SERVICES: Record<Service, { name: string; install: Record<System, string>; login: string; choice: string }> = {
  claude: {
    name: "Claude Code",
    install: {
      mac: "curl -fsSL https://claude.ai/install.sh | bash",
      windows: "irm https://claude.ai/install.ps1 | iex",
    },
    login: "claude auth login",
    choice: "Claude CLI",
  },
  codex: {
    name: "Codex CLI",
    install: { mac: "npm install -g @openai/codex", windows: "npm install -g @openai/codex" },
    login: "codex login",
    choice: "Codex CLI",
  },
}

const HELPER_COMMANDS: Record<System, { start: string; next: string }> = {
  mac: {
    start: `curl -fsSL ${HELPER_FILE_URL} --create-dirs -o ~/.book-check/book-check-helper.mjs && node ~/.book-check/book-check-helper.mjs`,
    next: "node ~/.book-check/book-check-helper.mjs",
  },
  windows: {
    start: `curl.exe -fsSL ${HELPER_FILE_URL} --create-dirs -o $HOME\\.book-check\\book-check-helper.mjs; node $HOME\\.book-check\\book-check-helper.mjs`,
    next: "node $HOME\\.book-check\\book-check-helper.mjs",
  },
}

function setupSteps(system: System, service: Service): Step[] {
  const chosen = SERVICES[service]
  const terminal = system === "mac" ? "Terminal" : "PowerShell"
  return [
    {
      title: `Open ${terminal}`,
      detail: system === "mac" ? "Press Cmd and Space, type Terminal, and press Return." : "Press the Windows key, type PowerShell, and press Enter.",
    },
    {
      title: "Install Node.js",
      detail: "Download the LTS version and open the installer.",
      link: { href: "https://nodejs.org/en/download", label: "Open nodejs.org" },
    },
    { title: `Install ${chosen.name}`, command: chosen.install[system] },
    { title: `Sign in to ${chosen.name}`, detail: `If the command is not found, reopen ${terminal} and retry.`, command: chosen.login },
    {
      title: "Start the helper",
      detail: `Keep this ${terminal} window open while you use the site.`,
      command: HELPER_COMMANDS[system].start,
    },
    { title: "Come back to this page", detail: `Choose ${chosen.choice} from the review menu.` },
  ]
}

function CommandLine({ command }: { command: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex min-w-0 items-start gap-2 rounded-lg bg-muted py-1 pr-1 pl-3">
      <code className="min-w-0 flex-1 py-1.5 font-mono text-xs break-all whitespace-pre-wrap">{command}</code>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Copy the command"
        onClick={() => {
          navigator.clipboard.writeText(command).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          })
        }}
      >
        {copied ? <Check /> : <Copy />}
      </Button>
    </div>
  )
}

function StepList({ system, service }: { system: System; service: Service }) {
  const steps = setupSteps(system, service)
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <ol className="flex flex-col gap-4">
        {steps.map((step, index) => (
          <li key={step.title} className="flex gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
              {index + 1}
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span className="text-sm font-medium">{step.title}</span>
              {step.detail && <span className="text-sm text-muted-foreground">{step.detail}</span>}
              {step.command && <CommandLine command={step.command} />}
              {step.link && (
                <a
                  href={step.link.href}
                  target="_blank"
                  rel="noreferrer"
                  className="flex w-fit items-center gap-1.5 text-sm font-medium underline underline-offset-4"
                >
                  {step.link.label}
                  <ExternalLink className="size-3.5" />
                </a>
              )}
            </div>
          </li>
        ))}
      </ol>
      <div className="flex flex-col gap-1.5 border-t pt-4">
        <span className="text-sm text-muted-foreground">
          After the first setup, run this command whenever you want {service === "codex" ? "Codex" : "Claude"} to review a book.
        </span>
        <CommandLine command={HELPER_COMMANDS[system].next} />
      </div>
    </div>
  )
}

export function SetupGuide({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const defaultSystem: System = navigator.userAgent.includes("Windows") ? "windows" : "mac"
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto p-6 sm:max-w-xl! [&>*]:min-w-0">
        <DialogHeader>
          <DialogTitle>Set up AI reviews</DialogTitle>
          <DialogDescription>
            Follow these steps to review your book with your Claude or Codex account.
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue={`claude-${defaultSystem}`}>
          <TabsList className="grid h-auto w-full grid-cols-2 sm:grid-cols-4">
            <TabsTrigger value="claude-mac">Claude · Mac</TabsTrigger>
            <TabsTrigger value="claude-windows">Claude · Windows</TabsTrigger>
            <TabsTrigger value="codex-mac">Codex · Mac</TabsTrigger>
            <TabsTrigger value="codex-windows">Codex · Windows</TabsTrigger>
          </TabsList>
          <TabsContent value="claude-mac" className="pt-4">
            <StepList system="mac" service="claude" />
          </TabsContent>
          <TabsContent value="claude-windows" className="pt-4">
            <StepList system="windows" service="claude" />
          </TabsContent>
          <TabsContent value="codex-mac" className="pt-4">
            <StepList system="mac" service="codex" />
          </TabsContent>
          <TabsContent value="codex-windows" className="pt-4">
            <StepList system="windows" service="codex" />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
