"use client"

import { useEffect, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { HugeiconsIcon } from "@hugeicons/react"
import { EyeIcon, CodeIcon, SendHorizontal, File02Icon, Cancel01Icon, SidebarRight01Icon } from "@hugeicons/core-free-icons"
import { cn } from "@/lib/utils"
import { classifyAction } from "@/lib/classify-action"
import type { RiskLevel } from "@/lib/classify-action"

type TraceItem =
  | { type: "reasoning"; text: string; partId?: string }
  | { type: "tool"; name: string; input: Record<string, unknown>; result?: string; is_error?: boolean; partId?: string }

interface Message {
  role: "user" | "assistant"
  content: string
  trace?: TraceItem[]
  cost?: number
  tokens?: number
}

interface Instruction {
  action: string
  params: Record<string, string>
}

interface ReviewSummary {
  corrections: string[]
  warnings: string[]
  riskLevel: RiskLevel
}

type SidePanelTab = "preview" | "code"

interface Step {
  instruction: Instruction
  riskLevel: RiskLevel
  status: "idle" | "executing" | "success" | "error" | "blocked"
  message: string
  review: ReviewSummary | null
}

function LocationBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-background border border-border rounded px-1.5 py-0.5">
      <HugeiconsIcon icon={File02Icon} size={10} />
      File
    </span>
  )
}

function languageFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? ""
  if (ext === "php") return "php"
  if (ext === "css") return "css"
  if (ext === "js" || ext === "mjs" || ext === "cjs") return "javascript"
  if (ext === "ts" || ext === "tsx") return "typescript"
  if (ext === "json") return "json"
  if (ext === "html" || ext === "htm") return "html"
  if (ext === "md") return "markdown"
  return "text"
}

function CodeBlock({ code, lang = "json" }: { code: string; lang?: string }) {
  const [html, setHtml] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/highlight", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, lang }),
    })
      .then((r) => r.json())
      .then((data: { html: string }) => setHtml(data.html))
      .catch(() => {})
  }, [code, lang])

  if (!html) {
    return (
      <pre className="text-xs bg-zinc-900 text-zinc-100 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all">
        {code}
      </pre>
    )
  }

  return (
    <div
      className="text-xs rounded-lg overflow-auto [&>pre]:!m-0 [&>pre]:p-4 [&>pre]:rounded-lg [&>pre]:text-xs"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

function InstructionPreview({ instruction }: { instruction: Instruction }) {
  const { action, params } = instruction

  if (action === "write_file") {
    const path = String(params?.path ?? "")
    const description = String(params?.description ?? "")
    const content = String(params?.content ?? "")
    const lang = languageFromPath(path)

    return (
      <div className="space-y-2">
        <p className="text-sm font-semibold break-all">{path}</p>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
        <CodeBlock code={content} lang={lang} />
      </div>
    )
  }

  if (action === "execute_php") {
    const code = String(params?.code ?? "")
    const description = String(params?.description ?? "")

    return (
      <div className="space-y-2">
        <p className="text-sm font-semibold">Execute PHP</p>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
        <CodeBlock code={code} lang="php" />
      </div>
    )
  }

  return (
    <p className="text-sm font-semibold">Will execute: {action}</p>
  )
}

function StepBadge({ status, riskLevel }: { status: Step["status"], riskLevel: RiskLevel }) {
  if (status === "success") return <span className="text-xs text-green-600 dark:text-green-400">Done</span>
  if (status === "executing") return <span className="text-xs text-muted-foreground">Running...</span>
  if (status === "error") return <span className="text-xs text-destructive">Failed</span>
  if (status === "blocked") return <span className="text-xs text-destructive">Blocked</span>
  if (riskLevel === "high") return <span className="text-xs text-amber-600 dark:text-amber-400">High risk</span>
  return null
}

const PREVIEW_LEN = 400

function TraceBar({ trace, cost, tokens }: { trace: TraceItem[], cost?: number, tokens?: number }) {
  const [open, setOpen] = useState(false)
  const [expandedReasoning, setExpandedReasoning] = useState<Set<number>>(new Set())
  if (trace.length === 0) return null

  const stepCount = trace.length

  return (
    <div className="mt-2 text-xs text-muted-foreground">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 hover:text-foreground transition-colors"
      >
        <span>{open ? "▾" : "▸"}</span>
        <span>{stepCount} {stepCount === 1 ? "step" : "steps"}</span>
        {(cost !== undefined || tokens !== undefined) && !open && (
          <span className="ml-2 opacity-60">
            {cost !== undefined && `$${cost.toFixed(4)}`}
            {cost !== undefined && tokens !== undefined && " · "}
            {tokens !== undefined && `${tokens.toLocaleString()} tokens`}
          </span>
        )}
      </button>

      {open && (
        <div className="mt-1.5 pl-3 border-l border-border space-y-1.5">
          {trace.map((item, i) => {
            if (item.type === "reasoning") {
              const expanded = expandedReasoning.has(i)
              return (
                <div key={i}>
                  <button
                    onClick={() => setExpandedReasoning(prev => {
                      const next = new Set(prev)
                      expanded ? next.delete(i) : next.add(i)
                      return next
                    })}
                    className="flex items-center gap-1 hover:text-foreground transition-colors italic"
                  >
                    <span>{expanded ? "▾" : "▸"}</span>
                    <span>Thinking...</span>
                  </button>
                  {expanded && (
                    <p className="mt-1 pl-3 text-muted-foreground/70 whitespace-pre-wrap">{item.text}</p>
                  )}
                </div>
              )
            }
            const done = item.result !== undefined
            const label = toolLabel(item.name, item.input, done)
            return (
              <div key={i} className="flex items-center gap-1.5">
                {done ? (
                  <span className="text-muted-foreground/50">✓</span>
                ) : (
                  <span className="animate-pulse">·</span>
                )}
                <span className={done ? "" : "animate-pulse"}>{label}</span>
              </div>
            )
          })}
          {(cost !== undefined || tokens !== undefined) && (
            <div className="pt-1 opacity-60">
              {cost !== undefined && `$${cost.toFixed(4)}`}
              {cost !== undefined && tokens !== undefined && " · "}
              {tokens !== undefined && `${tokens.toLocaleString()} tokens`}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

interface Site {
  id: string
  name: string
  url: string
  connected: boolean
}

function toolLabel(name: string, input: Record<string, unknown>, done: boolean): string {
  if (name === "execute_php") {
    const desc = String(input.description ?? "").trim()
    if (desc) return done ? desc : desc + "..."
    return done ? "Ran PHP" : "Running PHP..."
  }
  if (name === "write_file") {
    const filename = String(input.path ?? "").split("/").pop() || "file"
    return done ? `Updated ${filename}` : `Updating ${filename}...`
  }
  if (name === "read_file") {
    const filename = String(input.path ?? "").split("/").pop() || "file"
    return done ? `Read ${filename}` : `Reading ${filename}...`
  }
  if (name === "list_directory") {
    const path = String(input.path ?? "wp-content")
    return done ? `Explored ${path}` : `Exploring ${path}...`
  }
  if (name === "fetch_url") {
    const path = String(input.path ?? "page")
    return done ? `Fetched ${path}` : `Fetching ${path}...`
  }
  return done ? "Completed step" : "Working..."
}

function extractPartResult(part: Record<string, unknown>): string {
  const val = part.result ?? part.output
  if (val === undefined || val === null) return ""
  if (typeof val === "string") return val
  return JSON.stringify(val)
}

export default function ChatPage() {
  const params = useParams()
  const router = useRouter()
  const siteId = params.id as string

  const [sites, setSites] = useState<Site[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [loadingStatus, setLoadingStatus] = useState("Thinking...")
  const [currentTrace, setCurrentTrace] = useState<TraceItem[]>([])
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [steps, setSteps] = useState<Step[]>([])
  const [sidePanelOpen, setSidePanelOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<SidePanelTab>("preview")
  const [isExecuting, setIsExecuting] = useState(false)
  const [highRiskConfirmed, setHighRiskConfirmed] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch("/api/sites")
      .then((r) => r.json())
      .then((data: { sites?: Site[] }) => {
        if (data.sites) setSites(data.sites)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    setMessages([])
    setInput("")
    setSteps([])
    setCurrentTrace([])
    setSidePanelOpen(false)
    setIsExecuting(false)
    setHighRiskConfirmed(false)
    setSessionId(null)
  }, [siteId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, currentTrace])

  const currentSite = sites.find((s) => s.id === siteId)

  async function sendMessage() {
    const text = input.trim()
    if (!text || isLoading) return

    setMessages((prev) => [...prev, { role: "user", content: text }])
    setInput("")
    setIsLoading(true)
    setLoadingStatus("Thinking...")
    setCurrentTrace([])
    setSteps([])
    setHighRiskConfirmed(false)

    const traceItems: TraceItem[] = []

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId, message: text, sessionId }),
      })

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`)
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error("No response body")

      const decoder = new TextDecoder()
      let buffer = ""
      let aiText = ""
      let currentEvent = ""
      let messageCost: number | undefined
      let messageTokens: number | undefined

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() ?? ""

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim()
          } else if (line.startsWith("data: ")) {
            const dataStr = line.slice(6)
            try {
              const parsed = JSON.parse(dataStr) as Record<string, unknown>

              if (currentEvent === "session") {
                setSessionId(parsed.sessionId as string)
              } else if (currentEvent === "part_update") {
                const part = parsed.part as Record<string, unknown>
                const partId = String(part.id ?? "")
                const partType = String(part.type ?? "")

                if (partType === "text") {
                  aiText = String(part.text ?? "")
                } else if (partType === "reasoning") {
                  const text = String(part.text ?? "")
                  const idx = traceItems.findIndex((t) => t.partId === partId)
                  if (idx >= 0) {
                    traceItems[idx] = { type: "reasoning", text, partId }
                  } else {
                    traceItems.push({ type: "reasoning", text, partId })
                  }
                  setCurrentTrace([...traceItems])
                } else if (partType === "tool-invocation" || partType === "tool") {
                  const name = String((part.toolName ?? part.name) ?? "")
                  const state = String(part.state ?? "")
                  const input = ((part.args ?? part.input) ?? {}) as Record<string, unknown>
                  const idx = traceItems.findIndex((t) => t.partId === partId)

                  if (
                    state === "pending" ||
                    state === "running" ||
                    state === "partial-call" ||
                    state === "call"
                  ) {
                    setLoadingStatus(toolLabel(name, input, false))
                    const item: TraceItem = { type: "tool", name, input, partId }
                    if (idx >= 0) {
                      traceItems[idx] = item
                    } else {
                      traceItems.push(item)
                    }
                  } else {
                    const result = extractPartResult(part)
                    const isError = state === "error"
                    const existing =
                      idx >= 0
                        ? (traceItems[idx] as Extract<TraceItem, { type: "tool" }>)
                        : null
                    const item: TraceItem = {
                      type: "tool",
                      name: existing?.name ?? name,
                      input: existing?.input ?? input,
                      result,
                      is_error: isError,
                      partId,
                    }
                    if (idx >= 0) {
                      traceItems[idx] = item
                    } else {
                      traceItems.push(item)
                    }
                  }
                  setCurrentTrace([...traceItems])
                }
              } else if (currentEvent === "cost") {
                const c = parsed.cost as number | undefined
                const t = parsed.tokens as { total?: number } | undefined
                if (c !== undefined) messageCost = c
                if (t?.total !== undefined) messageTokens = t.total
              } else if (currentEvent === "error") {
                throw new Error(String(parsed.message ?? "Unknown error"))
              }
            } catch (e) {
              if (currentEvent === "error" && e instanceof Error) throw e
            }
            currentEvent = ""
          }
        }
      }

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: aiText, trace: [...traceItems], cost: messageCost, tokens: messageTokens },
      ])
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "Sorry, something went wrong. Please try again. " +
            (error instanceof Error ? error.message : ""),
        },
      ])
    } finally {
      setIsLoading(false)
      setCurrentTrace([])
      inputRef.current?.focus()
    }
  }

  async function handleExecuteAll() {
    setIsExecuting(true)
    for (let i = 0; i < steps.length; i++) {
      setSteps((prev) => prev.map((s, idx) => idx === i ? { ...s, status: "executing" } : s))
      try {
        const response = await fetch(`/api/sites/${siteId}/execute`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ instruction: steps[i].instruction }),
        })
        const data = await response.json() as { success?: boolean, error?: string, warnings?: string[], review?: ReviewSummary }
        if (response.ok && data.success) {
          setSteps((prev) => prev.map((s, idx) => idx === i ? { ...s, status: "success", review: data.review ?? null } : s))
        } else if (response.status === 400 && data.error === "Blocked by security reviewer") {
          setSteps((prev) => prev.map((s, idx) => idx === i ? { ...s, status: "blocked", message: data.warnings?.join(", ") ?? "Blocked", review: { corrections: [], warnings: data.warnings ?? [], riskLevel: "high" } } : s))
          break
        } else {
          setSteps((prev) => prev.map((s, idx) => idx === i ? { ...s, status: "error", message: data.error ?? "Failed" } : s))
          break
        }
      } catch (err) {
        setSteps((prev) => prev.map((s, idx) => idx === i ? { ...s, status: "error", message: err instanceof Error ? err.message : "Failed" } : s))
        break
      }
    }
    setIsExecuting(false)
  }

  const hasHighRisk = steps.some((s) => s.riskLevel === "high")
  const allDone = steps.length > 0 && steps.every((s) => ["success", "error", "blocked"].includes(s.status))
  const anyBlocked = steps.some((s) => s.status === "blocked")
  const anyError = steps.some((s) => s.status === "error")

  return (
    <div className="flex h-[calc(100vh-53px)] overflow-hidden">
      <div
        className={cn(
          "flex flex-col transition-all duration-300 min-w-0",
          sidePanelOpen ? "w-1/2" : "w-full"
        )}
      >
        <div className="border-b border-border px-6 py-3 flex items-center gap-3">
          <Link
            href="/dashboard"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            ← Sites
          </Link>
          <span className="text-sm text-muted-foreground">|</span>
          {sites.length > 1 ? (
            <select
              value={siteId}
              onChange={(e) => router.push(`/dashboard/sites/${e.target.value}/chat`)}
              className="text-sm font-medium bg-transparent border-none outline-none cursor-pointer text-foreground"
            >
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-sm font-medium">
              {currentSite?.name ?? "Chat"}
            </span>
          )}
          {currentSite && (
            <span className="text-xs text-muted-foreground truncate hidden sm:block">
              {currentSite.url}
            </span>
          )}
          <div className="ml-auto flex items-center gap-2 shrink-0">
            {currentSite && (
              <span
                className={cn(
                  "inline-block size-2 rounded-full",
                  currentSite.connected ? "bg-green-500" : "bg-muted-foreground/40"
                )}
                title={currentSite.connected ? "Connected" : "Not connected"}
              />
            )}
            {!sidePanelOpen && steps.length > 0 && (
              <button
                onClick={() => setSidePanelOpen(true)}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                title="Open panel"
              >
                <HugeiconsIcon icon={SidebarRight01Icon} size={16} />
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-6">
          <div className={cn("space-y-6 mx-auto px-6", sidePanelOpen ? "max-w-full" : "max-w-2xl")}>
            {messages.length === 0 && !isLoading && (
              <div className="flex flex-col items-center justify-center h-full text-center space-y-2">
                <p className="text-lg font-medium">
                  How can I help with your WordPress site?
                </p>
                <p className="text-sm text-muted-foreground">
                  Try: &ldquo;Create an About page with a brief welcome message&rdquo;
                </p>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className="space-y-2">
                {msg.role === "assistant" && msg.trace && msg.trace.length > 0 && (
                  <TraceBar trace={msg.trace ?? []} cost={msg.cost} tokens={msg.tokens} />
                )}
                <div
                  className={cn(
                    "flex",
                    msg.role === "user" ? "justify-end" : "justify-start"
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm",
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground"
                    )}
                  >
                    <MessageContent content={msg.content} />
                  </div>
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="space-y-2">
                {currentTrace.length > 0 && <TraceBar trace={currentTrace} />}
                <div className="flex justify-start">
                  <div className="bg-muted rounded-2xl px-4 py-2.5 text-sm text-muted-foreground">
                    {loadingStatus}
                    <span className="inline-flex gap-0.5 ml-1">
                      <span className="animate-bounce [animation-delay:0ms]">.</span>
                      <span className="animate-bounce [animation-delay:150ms]">.</span>
                      <span className="animate-bounce [animation-delay:300ms]">.</span>
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        <div className="border-t border-border px-6 py-4">
          <div className={cn("mx-auto", sidePanelOpen ? "max-w-full" : "max-w-2xl")}>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                void sendMessage()
              }}
              className="flex gap-2"
            >
              <Input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask me to manage your WordPress site..."
                disabled={isLoading}
                className="flex-1"
              />
              <Button
                type="submit"
                disabled={isLoading || !input.trim()}
                size="icon"
              >
                <HugeiconsIcon icon={SendHorizontal} size={16} />
              </Button>
            </form>
          </div>
        </div>
      </div>

      <div
        className={cn(
          "border-l border-border flex flex-col transition-all duration-300 overflow-hidden",
          sidePanelOpen ? "w-1/2" : "w-0"
        )}
      >
        {sidePanelOpen && steps.length > 0 && (
          <>
            <div className="border-b border-border px-4 py-2 flex items-center gap-1">
              <button
                onClick={() => setActiveTab("preview")}
                className={cn(
                  "p-2 rounded-lg transition-colors",
                  activeTab === "preview"
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
                title="Preview"
              >
                <HugeiconsIcon icon={EyeIcon} size={16} />
              </button>
              <button
                onClick={() => setActiveTab("code")}
                className={cn(
                  "p-2 rounded-lg transition-colors",
                  activeTab === "code"
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
                title="JSON instruction"
              >
                <HugeiconsIcon icon={CodeIcon} size={16} />
              </button>
              <button
                onClick={() => setSidePanelOpen(false)}
                className="ml-auto p-2 rounded-lg text-muted-foreground hover:text-foreground transition-colors"
                title="Close panel"
              >
                <HugeiconsIcon icon={Cancel01Icon} size={16} />
              </button>
            </div>

            {activeTab === "preview" ? (
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {steps.map((step, i) => (
                  <div key={i} className="border border-border rounded-lg overflow-hidden">
                    <div className="px-3 py-2 bg-muted flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-muted-foreground">
                          Step {i + 1}{steps.length > 1 ? ` of ${steps.length}` : ""}
                        </span>
                        <LocationBadge />
                      </div>
                      <StepBadge status={step.status} riskLevel={step.riskLevel} />
                    </div>
                    <div className="p-3 space-y-2">
                      <InstructionPreview instruction={step.instruction} />
                      {step.status === "error" && <p className="text-xs text-destructive">{step.message}</p>}
                      {step.status === "blocked" && <p className="text-xs text-destructive">{step.message}</p>}
                      {step.review?.corrections.map((c, j) => <p key={j} className="text-xs text-amber-600">Auto-corrected: {c}</p>)}
                      {step.review?.warnings.map((w, j) => <p key={j} className="text-xs text-amber-600">Warning: {w}</p>)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {steps.map((step, i) => (
                  <div key={i}>
                    {steps.length > 1 && <p className="text-xs text-muted-foreground mb-1">Step {i + 1}</p>}
                    <CodeBlock code={JSON.stringify(step.instruction, null, 2)} lang="json" />
                  </div>
                ))}
              </div>
            )}

            <div className="border-t border-border p-4 space-y-3">
              {hasHighRisk && !allDone && (
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" checked={highRiskConfirmed} onChange={() => setHighRiskConfirmed(v => !v)} className="accent-destructive" />
                  <span className="text-xs text-muted-foreground">I understand some steps are high-risk</span>
                </label>
              )}
              <Button
                onClick={() => void handleExecuteAll()}
                disabled={isExecuting || allDone || (hasHighRisk && !highRiskConfirmed)}
                className="w-full"
              >
                {isExecuting ? "Executing..." : allDone ? (anyBlocked ? "Blocked" : anyError ? "Failed — check steps" : "All Done") : `Execute${steps.length > 1 ? ` ${steps.length} Steps` : ""}`}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function MessageContent({ content }: { content: string }) {
  return <span className="whitespace-pre-wrap">{content}</span>
}
