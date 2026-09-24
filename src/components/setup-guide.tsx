import { useState } from "react"
import { Check, Copy, ExternalLink } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

const HELPER_FILE_URL = "https://welchlabs.github.io/book-check/claude-helper.mjs"

type System = "mac" | "windows"

interface Step {
  title: string
  detail?: string
  command?: string
  link?: { href: string; label: string }
}

const STEPS: Record<System, Step[]> = {
  mac: [
    { title: "Open Terminal", detail: "Press Cmd and Space, type Terminal, and press Return." },
    { title: "Install Claude Code", command: "curl -fsSL https://claude.ai/install.sh | bash" },
    {
      title: "Sign in to Claude",
      detail: "If the command is not found, close Terminal, open it again, and retry.",
      command: "claude auth login",
    },
    {
      title: "Install Node.js",
      detail: "Download the LTS version and open the installer.",
      link: { href: "https://nodejs.org/en/download", label: "Open nodejs.org" },
    },
    {
      title: "Start the helper",
      detail: "This saves the helper in a hidden .book-check folder in your home folder. Keep this Terminal window open while you use the site.",
      command: `curl -fsSL ${HELPER_FILE_URL} --create-dirs -o ~/.book-check/claude-helper.mjs && node ~/.book-check/claude-helper.mjs`,
    },
    { title: "Come back to this page", detail: "The start page now shows a switch to review with Claude." },
  ],
  windows: [
    { title: "Open PowerShell", detail: "Press the Windows key, type PowerShell, and press Enter." },
    { title: "Install Claude Code", command: "irm https://claude.ai/install.ps1 | iex" },
    {
      title: "Sign in to Claude",
      detail: "If the command is not found, close PowerShell, open it again, and retry.",
      command: "claude auth login",
    },
    {
      title: "Install Node.js",
      detail: "Download the LTS version and open the installer.",
      link: { href: "https://nodejs.org/en/download", label: "Open nodejs.org" },
    },
    {
      title: "Start the helper",
      detail: "This saves the helper in a hidden .book-check folder in your home folder. Keep this PowerShell window open while you use the site.",
      command: `curl.exe -fsSL ${HELPER_FILE_URL} --create-dirs -o $HOME\\.book-check\\claude-helper.mjs; node $HOME\\.book-check\\claude-helper.mjs`,
    },
    { title: "Come back to this page", detail: "The start page now shows a switch to review with Claude." },
  ],
}

const NEXT_TIME: Record<System, string> = {
  mac: "node ~/.book-check/claude-helper.mjs",
  windows: "node $HOME\\.book-check\\claude-helper.mjs",
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

function StepList({ system }: { system: System }) {
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <ol className="flex flex-col gap-4">
        {STEPS[system].map((step, index) => (
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
          After the first setup, run this command whenever you want Claude to review a book.
        </span>
        <CommandLine command={NEXT_TIME[system]} />
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
          <DialogTitle>Set up Claude reviews</DialogTitle>
          <DialogDescription>
            Follow these steps to let this site review your book with your own Claude account.
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue={defaultSystem}>
          <TabsList>
            <TabsTrigger value="mac">Mac</TabsTrigger>
            <TabsTrigger value="windows">Windows</TabsTrigger>
          </TabsList>
          <TabsContent value="mac" className="pt-4">
            <StepList system="mac" />
          </TabsContent>
          <TabsContent value="windows" className="pt-4">
            <StepList system="windows" />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
