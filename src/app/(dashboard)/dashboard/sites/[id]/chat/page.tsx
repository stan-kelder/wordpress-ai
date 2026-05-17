"use client"

import { useEffect, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { HugeiconsIcon } from "@hugeicons/react"
import { EyeIcon, CodeIcon, SendHorizontal, Globe02Icon, Cancel01Icon, SidebarRight01Icon } from "@hugeicons/core-free-icons"
import { cn } from "@/lib/utils"
import { classifyAction } from "@/lib/classify-action"
import type { RiskLevel } from "@/lib/classify-action"

interface Message {
  role: "user" | "assistant"
  content: string
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

const WP_ADMIN_ACTIONS = new Set([
  "write_persistent_code",
  "execute_php",
  "create_user",
  "update_user_role",
  "update_setting",
])

const HTML_CONTENT_ACTIONS = new Set([
  "create_page",
  "update_page",
  "create_post",
  "update_post",
  "create_product",
  "update_product",
])

function WpIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zM3.5 12c0-1.232.264-2.403.734-3.461l4.04 11.07A8.5 8.5 0 013.5 12zM12 20.5a8.46 8.46 0 01-2.4-.347l2.549-7.405 2.61 7.152.03.057A8.46 8.46 0 0112 20.5zm1.17-12.27c.51-.026.97-.08.97-.08.456-.054.402-.724-.054-.697 0 0-1.372.107-2.258.107-.832 0-2.231-.107-2.231-.107-.456-.027-.51.67-.054.697 0 0 .432.054.889.08l1.32 3.617-1.854 5.558-3.08-9.175c.51-.026.97-.08.97-.08.456-.054.402-.724-.054-.697 0 0-1.372.107-2.258.107-.159 0-.347-.004-.545-.01A8.506 8.506 0 0112 3.5c2.224 0 4.254.856 5.778 2.254a2.35 2.35 0 00-.152-.005c-.832 0-1.422.724-1.422 1.504 0 .697.402 1.288.832 1.986.322.564.697 1.288.697 2.333 0 .724-.278 1.558-.64 2.734l-.839 2.806-3.116-9.282zm2.854 11.18l2.604-7.522c.485-1.22.647-2.188.647-3.054a5.62 5.62 0 00-.057-.877A8.507 8.507 0 0120.5 12a8.49 8.49 0 01-4.476 7.41z" />
    </svg>
  )
}

function LocationBadge({ action }: { action: string }) {
  const isAdmin = WP_ADMIN_ACTIONS.has(action)
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-background border border-border rounded px-1.5 py-0.5">
      {isAdmin ? <WpIcon /> : <HugeiconsIcon icon={Globe02Icon} size={10} />}
      {isAdmin ? "WP Admin" : "Your Website"}
    </span>
  )
}

function HtmlPreview({ html }: { html: string }) {
  const doc = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;line-height:1.7;color:#333;padding:16px;margin:0;font-size:14px;}h1,h2,h3,h4{color:#111;margin:0 0 .5em;}p{margin:0 0 1em;}img{max-width:100%;}a{color:#0073aa;}ul,ol{margin:0 0 1em;padding-left:1.5em;}</style></head><body>${html}</body></html>`
  return (
    <iframe
      srcDoc={doc}
      sandbox="allow-same-origin"
      className="w-full rounded border border-border bg-white mt-2"
      style={{ height: "180px" }}
      title="Content preview"
    />
  )
}

function CodeBlock({ code }: { code: string }) {
  const [html, setHtml] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/highlight", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, lang: "json" }),
    })
      .then((r) => r.json())
      .then((data: { html: string }) => setHtml(data.html))
      .catch(() => {})
  }, [code])

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

  // Shared section for status + content preview
  function StatusRow() {
    if (!params?.status) return null
    return (
      <p className="text-sm text-muted-foreground">
        Status: <span className="text-foreground">{String(params.status)}</span>
      </p>
    )
  }

  function ContentPreview() {
    if (!params?.content) return null
    const isHtmlAction = HTML_CONTENT_ACTIONS.has(action)
    if (isHtmlAction) {
      return <HtmlPreview html={String(params.content)} />
    }
    return (
      <div>
        <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-1">
          Content preview
        </p>
        <p className="text-sm text-muted-foreground line-clamp-4">
          {String(params.content)}
        </p>
      </div>
    )
  }

  if (action === "create_page") {
    return (
      <div className="space-y-2">
        <p className="text-sm font-semibold">Will create page: {String(params?.title ?? "Untitled")}</p>
        <StatusRow />
        <ContentPreview />
      </div>
    )
  }

  if (action === "update_page") {
    return (
      <div className="space-y-2">
        <p className="text-sm font-semibold">
          Will update page{params?.title ? `: ${String(params.title)}` : ` ID ${String(params?.id ?? "?")}`}
        </p>
        <StatusRow />
        <ContentPreview />
      </div>
    )
  }

  if (action === "delete_page") {
    return (
      <div className="space-y-2">
        <p className="text-sm font-semibold text-destructive">Will permanently delete page ID {String(params?.id ?? "?")}</p>
        <p className="text-xs text-destructive/70">This action cannot be undone.</p>
      </div>
    )
  }

  if (action === "create_post") {
    return (
      <div className="space-y-2">
        <p className="text-sm font-semibold">Will create post: {String(params?.title ?? "Untitled")}</p>
        {params?.category && (
          <p className="text-sm text-muted-foreground">Category: <span className="text-foreground">{String(params.category)}</span></p>
        )}
        <StatusRow />
        <ContentPreview />
      </div>
    )
  }

  if (action === "update_post") {
    return (
      <div className="space-y-2">
        <p className="text-sm font-semibold">
          Will update post{params?.title ? `: ${String(params.title)}` : ` ID ${String(params?.id ?? "?")}`}
        </p>
        <StatusRow />
        <ContentPreview />
      </div>
    )
  }

  if (action === "delete_post") {
    return (
      <div className="space-y-2">
        <p className="text-sm font-semibold text-destructive">Will permanently delete post ID {String(params?.id ?? "?")}</p>
        <p className="text-xs text-destructive/70">This action cannot be undone.</p>
      </div>
    )
  }

  if (action === "add_menu_item") {
    return (
      <div className="space-y-2">
        <p className="text-sm font-semibold">Will add "{String(params?.title ?? "item")}" to the menu</p>
        {params?.url && (
          <p className="text-sm text-muted-foreground truncate">URL: <span className="text-foreground">{String(params.url)}</span></p>
        )}
      </div>
    )
  }

  if (action === "update_menu_item") {
    return (
      <div className="space-y-2">
        <p className="text-sm font-semibold">
          Will update menu item{params?.title ? `: "${String(params.title)}"` : ` ID ${String(params?.item_id ?? "?")}`}
        </p>
        {params?.url && (
          <p className="text-sm text-muted-foreground truncate">New URL: <span className="text-foreground">{String(params.url)}</span></p>
        )}
      </div>
    )
  }

  if (action === "remove_menu_item") {
    return (
      <div className="space-y-2">
        <p className="text-sm font-semibold text-destructive">Will remove menu item ID {String(params?.item_id ?? "?")}</p>
      </div>
    )
  }

  if (action === "update_setting") {
    return (
      <div className="space-y-2">
        <p className="text-sm font-semibold">
          Will update {String(params?.option ?? "setting")}: <span className="text-muted-foreground line-through">{String(params?.option ?? "")}</span> → {String(params?.value ?? "?")}
        </p>
        <p className="text-xs text-amber-600 dark:text-amber-400">Changing site settings affects all visitors.</p>
      </div>
    )
  }

  if (action === "create_product") {
    return (
      <div className="space-y-2">
        <p className="text-sm font-semibold">Will create product: {String(params?.name ?? "Untitled")}</p>
        {params?.price && <p className="text-sm text-muted-foreground">Price: <span className="text-foreground">{String(params.price)}</span></p>}
        <StatusRow />
        <ContentPreview />
      </div>
    )
  }

  if (action === "update_product") {
    return (
      <div className="space-y-2">
        <p className="text-sm font-semibold">
          Will update product{params?.name ? `: ${String(params.name)}` : ` ID ${String(params?.id ?? "?")}`}
        </p>
        {params?.price && <p className="text-sm text-muted-foreground">New price: <span className="text-foreground">{String(params.price)}</span></p>}
        <StatusRow />
        <ContentPreview />
      </div>
    )
  }

  if (action === "create_user") {
    return (
      <div className="space-y-2">
        <p className="text-sm font-semibold">Will create user: {String(params?.username ?? "?")} ({String(params?.email ?? "no email")})</p>
        {params?.role && <p className="text-sm text-muted-foreground">Role: <span className="text-foreground">{String(params.role)}</span></p>}
        <p className="text-xs text-amber-600 dark:text-amber-400">A new account will be created on your site.</p>
      </div>
    )
  }

  if (action === "update_user_role") {
    return (
      <div className="space-y-2">
        <p className="text-sm font-semibold">Will change user ID {String(params?.user_id ?? "?")} role to {String(params?.role ?? "?")}</p>
        <p className="text-xs text-amber-600 dark:text-amber-400">Changing roles affects what this user can do.</p>
      </div>
    )
  }

  if (action === "execute_php") {
    return (
      <div className="space-y-2">
        <p className="text-sm font-semibold">{String(params?.description ?? "Will execute PHP on your site")}</p>
        <pre className="text-xs bg-muted rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-words font-mono">
          {String(params?.code ?? "")}
        </pre>
        <p className="text-xs text-amber-600 dark:text-amber-400">Review the code carefully before executing.</p>
      </div>
    )
  }

  if (action === "write_persistent_code") {
    return (
      <div className="space-y-2">
        <p className="text-sm font-semibold">{String(params?.description ?? "Will add persistent code to your site")}</p>
        <p className="text-xs text-muted-foreground">Slug: <code className="bg-muted px-1 rounded">{String(params?.slug ?? "")}</code></p>
        <pre className="text-xs bg-muted rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-words font-mono">
          {String(params?.code ?? "")}
        </pre>
        <p className="text-xs text-amber-600 dark:text-amber-400">This writes PHP to mu-plugins/ and runs permanently.</p>
      </div>
    )
  }

  return (
    <p className="text-sm font-semibold">Will execute: {action}</p>
  )
}

function StepBadge({ status, riskLevel }: { status: Step["status"], riskLevel: RiskLevel }) {
  if (status === "success") return <span className="text-xs text-green-600 dark:text-green-400">✓ Done</span>
  if (status === "executing") return <span className="text-xs text-muted-foreground">Running...</span>
  if (status === "error") return <span className="text-xs text-destructive">✗ Failed</span>
  if (status === "blocked") return <span className="text-xs text-destructive">⊘ Blocked</span>
  if (riskLevel === "high") return <span className="text-xs text-amber-600 dark:text-amber-400">⚠ High risk</span>
  return null
}

interface Site {
  id: string
  name: string
  url: string
  connected: boolean
}

export default function ChatPage() {
  const params = useParams()
  const router = useRouter()
  const siteId = params.id as string

  const [sites, setSites] = useState<Site[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [steps, setSteps] = useState<Step[]>([])
  const [sidePanelOpen, setSidePanelOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<SidePanelTab>("preview")
  const [isExecuting, setIsExecuting] = useState(false)
  const [highRiskConfirmed, setHighRiskConfirmed] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Fetch all sites for the switcher once on mount
  useEffect(() => {
    fetch("/api/sites")
      .then((r) => r.json())
      .then((data: { sites?: Site[] }) => {
        if (data.sites) setSites(data.sites)
      })
      .catch(() => {})
  }, [])

  // Reset chat state when switching sites
  useEffect(() => {
    setMessages([])
    setInput("")
    setSteps([])
    setSidePanelOpen(false)
    setIsExecuting(false)
    setHighRiskConfirmed(false)
  }, [siteId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const currentSite = sites.find((s) => s.id === siteId)

  async function sendMessage() {
    const text = input.trim()
    if (!text || isLoading) return

    const newMessages: Message[] = [
      ...messages,
      { role: "user", content: text },
    ]
    setMessages(newMessages)
    setInput("")
    setIsLoading(true)
    setSteps([])
    setHighRiskConfirmed(false)

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId, messages: newMessages }),
      })

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`)
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error("No response body")

      const decoder = new TextDecoder()
      let buffer = ""
      let aiText = ""
      let aiSteps: Step[] = []

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        const lines = buffer.split("\n")
        buffer = lines.pop() ?? ""

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            // handled below with data line
          } else if (line.startsWith("data: ")) {
            const dataStr = line.slice(6)
            try {
              const parsed = JSON.parse(dataStr) as {
                text?: string
                instructions?: Instruction[]
                message?: string
              }

              if (parsed.text !== undefined) {
                aiText = parsed.text
              }
              if (parsed.instructions !== undefined) {
                const incomingInstructions = parsed.instructions as Instruction[]
                aiSteps = incomingInstructions.map((inst) => ({
                  instruction: inst,
                  riskLevel: classifyAction(inst),
                  status: "idle" as const,
                  message: "",
                  review: null,
                }))
              }
            } catch {
              // Ignore parse errors
            }
          }
        }
      }

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: aiText },
      ])

      if (aiSteps.length > 0) {
        setSteps(aiSteps)
        setSidePanelOpen(true)
      }
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
          break // stop on block
        } else {
          setSteps((prev) => prev.map((s, idx) => idx === i ? { ...s, status: "error", message: data.error ?? "Failed" } : s))
          break // stop on error
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
      {/* Chat area */}
      <div
        className={cn(
          "flex flex-col transition-all duration-300 min-w-0",
          sidePanelOpen ? "w-1/2" : "w-full"
        )}
      >
        {/* Chat header */}
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

        {/* Messages */}
        <div className="flex-1 overflow-y-auto py-6">
        <div className={cn("space-y-4 mx-auto px-6", sidePanelOpen ? "max-w-full" : "max-w-2xl")}>
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-2">
              <p className="text-lg font-medium">
                How can I help with your WordPress site?
              </p>
              <p className="text-sm text-muted-foreground">
                Try: &ldquo;Create an About page with a brief welcome
                message&rdquo;
              </p>
            </div>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
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
          ))}

          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-2xl px-4 py-2.5 text-sm text-muted-foreground">
                Thinking
                <span className="inline-flex gap-0.5 ml-1">
                  <span className="animate-bounce [animation-delay:0ms]">.</span>
                  <span className="animate-bounce [animation-delay:150ms]">.</span>
                  <span className="animate-bounce [animation-delay:300ms]">.</span>
                </span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
        </div>

        {/* Input area */}
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

      {/* Side panel */}
      <div
        className={cn(
          "border-l border-border flex flex-col transition-all duration-300 overflow-hidden",
          sidePanelOpen ? "w-1/2" : "w-0"
        )}
      >
        {sidePanelOpen && steps.length > 0 && (
          <>
            {/* Tab bar */}
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

            {/* Tab content */}
            {activeTab === "preview" ? (
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {steps.map((step, i) => (
                  <div key={i} className="border border-border rounded-lg overflow-hidden">
                    <div className="px-3 py-2 bg-muted flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-muted-foreground">
                          Step {i + 1}{steps.length > 1 ? ` of ${steps.length}` : ""}
                        </span>
                        <LocationBadge action={step.instruction.action} />
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
                    <CodeBlock code={JSON.stringify(step.instruction, null, 2)} />
                  </div>
                ))}
              </div>
            )}

            {/* Footer */}
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
  // Strip JSON code blocks from assistant messages for cleaner display
  const cleaned = content
    .replace(/```json\n[\s\S]*?\n```/g, "")
    .trim()

  return <span className="whitespace-pre-wrap">{cleaned || content}</span>
}
