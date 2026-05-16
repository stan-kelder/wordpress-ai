"use client"

import { useEffect, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { HugeiconsIcon } from "@hugeicons/react"
import { EyeIcon, CodeIcon, SendHorizontal } from "@hugeicons/core-free-icons"
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

function parseInstruction(text: string): Instruction | null {
  const match = text.match(/```json\n([\s\S]*?)\n```/)
  if (!match) return null
  try {
    return JSON.parse(match[1]) as Instruction
  } catch {
    return null
  }
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

  function ActionLabel({ label }: { label: string }) {
    return (
      <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
        {label}
      </p>
    )
  }

  if (action === "create_page") {
    return (
      <div className="space-y-3">
        <ActionLabel label="Create Page" />
        <p className="text-sm">
          Will create page:{" "}
          <strong className="text-foreground">
            {String(params?.title ?? "Untitled")}
          </strong>
        </p>
        <StatusRow />
        <ContentPreview />
      </div>
    )
  }

  if (action === "update_page") {
    return (
      <div className="space-y-3">
        <ActionLabel label="Update Page" />
        <p className="text-sm">
          Will update page ID{" "}
          <strong className="text-foreground">{String(params?.id ?? "?")}</strong>
          {params?.title ? (
            <>: <strong className="text-foreground">{String(params.title)}</strong></>
          ) : null}
        </p>
        <StatusRow />
        <ContentPreview />
      </div>
    )
  }

  if (action === "delete_page") {
    return (
      <div className="space-y-3">
        <ActionLabel label="Delete Page" />
        <p className="text-sm text-destructive font-medium">
          Will permanently delete page ID{" "}
          <strong>{String(params?.id ?? "?")}</strong>
        </p>
        <p className="text-xs text-destructive/70">This action cannot be undone.</p>
      </div>
    )
  }

  if (action === "create_post") {
    return (
      <div className="space-y-3">
        <ActionLabel label="Create Post" />
        <p className="text-sm">
          Will create post:{" "}
          <strong className="text-foreground">
            {String(params?.title ?? "Untitled")}
          </strong>
        </p>
        {params?.category && (
          <p className="text-sm text-muted-foreground">
            Category: <span className="text-foreground">{String(params.category)}</span>
          </p>
        )}
        <StatusRow />
        <ContentPreview />
      </div>
    )
  }

  if (action === "update_post") {
    return (
      <div className="space-y-3">
        <ActionLabel label="Update Post" />
        <p className="text-sm">
          Will update post ID{" "}
          <strong className="text-foreground">{String(params?.id ?? "?")}</strong>
          {params?.title ? (
            <>: <strong className="text-foreground">{String(params.title)}</strong></>
          ) : null}
        </p>
        <StatusRow />
        <ContentPreview />
      </div>
    )
  }

  if (action === "delete_post") {
    return (
      <div className="space-y-3">
        <ActionLabel label="Delete Post" />
        <p className="text-sm text-destructive font-medium">
          Will permanently delete post ID{" "}
          <strong>{String(params?.id ?? "?")}</strong>
        </p>
        <p className="text-xs text-destructive/70">This action cannot be undone.</p>
      </div>
    )
  }

  if (action === "add_menu_item") {
    return (
      <div className="space-y-3">
        <ActionLabel label="Add Menu Item" />
        <p className="text-sm">
          Will add{" "}
          <strong className="text-foreground">{String(params?.title ?? "item")}</strong>{" "}
          to menu ID{" "}
          <strong className="text-foreground">{String(params?.menu_id ?? "?")}</strong>
        </p>
        {params?.url && (
          <p className="text-sm text-muted-foreground truncate">
            URL: <span className="text-foreground">{String(params.url)}</span>
          </p>
        )}
      </div>
    )
  }

  if (action === "update_menu_item") {
    return (
      <div className="space-y-3">
        <ActionLabel label="Update Menu Item" />
        <p className="text-sm">
          Will update item ID{" "}
          <strong className="text-foreground">{String(params?.item_id ?? "?")}</strong>{" "}
          in menu ID{" "}
          <strong className="text-foreground">{String(params?.menu_id ?? "?")}</strong>
        </p>
        {params?.title && (
          <p className="text-sm text-muted-foreground">
            New title: <span className="text-foreground">{String(params.title)}</span>
          </p>
        )}
        {params?.url && (
          <p className="text-sm text-muted-foreground truncate">
            New URL: <span className="text-foreground">{String(params.url)}</span>
          </p>
        )}
      </div>
    )
  }

  if (action === "remove_menu_item") {
    return (
      <div className="space-y-3">
        <ActionLabel label="Remove Menu Item" />
        <p className="text-sm">
          Will remove item ID{" "}
          <strong className="text-foreground">{String(params?.item_id ?? "?")}</strong>{" "}
          from menu ID{" "}
          <strong className="text-foreground">{String(params?.menu_id ?? "?")}</strong>
        </p>
      </div>
    )
  }

  if (action === "update_setting") {
    return (
      <div className="space-y-3">
        <ActionLabel label="Update Setting" />
        <p className="text-sm">
          Will update setting:{" "}
          <strong className="text-foreground">{String(params?.option ?? "?")}</strong>
          {" "}→{" "}
          <strong className="text-foreground">{String(params?.value ?? "?")}</strong>
        </p>
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Changing site settings can affect all visitors.
        </p>
      </div>
    )
  }

  if (action === "create_product") {
    return (
      <div className="space-y-3">
        <ActionLabel label="Create Product" />
        <p className="text-sm">
          Will create product:{" "}
          <strong className="text-foreground">{String(params?.name ?? "Untitled")}</strong>
        </p>
        {params?.price && (
          <p className="text-sm text-muted-foreground">
            Price: <span className="text-foreground">{String(params.price)}</span>
          </p>
        )}
        <StatusRow />
      </div>
    )
  }

  if (action === "update_product") {
    return (
      <div className="space-y-3">
        <ActionLabel label="Update Product" />
        <p className="text-sm">
          Will update product ID{" "}
          <strong className="text-foreground">{String(params?.id ?? "?")}</strong>
          {params?.name ? (
            <>: <strong className="text-foreground">{String(params.name)}</strong></>
          ) : null}
        </p>
        {params?.price && (
          <p className="text-sm text-muted-foreground">
            New price: <span className="text-foreground">{String(params.price)}</span>
          </p>
        )}
        <StatusRow />
      </div>
    )
  }

  if (action === "create_user") {
    return (
      <div className="space-y-3">
        <ActionLabel label="Create User" />
        <p className="text-sm">
          Will create user:{" "}
          <strong className="text-foreground">{String(params?.username ?? "?")}</strong>{" "}
          (<span className="text-muted-foreground">{String(params?.email ?? "no email")}</span>)
        </p>
        {params?.role && (
          <p className="text-sm text-muted-foreground">
            Role: <span className="text-foreground">{String(params.role)}</span>
          </p>
        )}
        <p className="text-xs text-amber-600 dark:text-amber-400">
          A new account will be created on your WordPress site.
        </p>
      </div>
    )
  }

  if (action === "update_user_role") {
    return (
      <div className="space-y-3">
        <ActionLabel label="Update User Role" />
        <p className="text-sm">
          Will change role of user ID{" "}
          <strong className="text-foreground">{String(params?.user_id ?? "?")}</strong>{" "}
          to{" "}
          <strong className="text-foreground">{String(params?.role ?? "?")}</strong>
        </p>
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Changing roles affects what this user can do on your site.
        </p>
      </div>
    )
  }

  return (
    <p className="text-sm text-muted-foreground">
      Action: <strong>{action}</strong>
    </p>
  )
}

interface SecuritySummaryProps {
  publishStatus: "idle" | "publishing" | "success" | "error" | "blocked"
  publishMessage: string
  reviewResult: ReviewSummary | null
  isHighRisk: boolean
  highRiskConfirmed: boolean
  onToggleHighRisk: () => void
}

function SecuritySummary({
  publishStatus,
  publishMessage,
  reviewResult,
  isHighRisk,
  highRiskConfirmed,
  onToggleHighRisk,
}: SecuritySummaryProps) {
  // After a blocked response
  if (publishStatus === "blocked") {
    return (
      <div className="space-y-1">
        <p className="text-xs font-medium text-destructive">Blocked by security reviewer</p>
        {reviewResult?.warnings.map((w, i) => (
          <p key={i} className="text-xs text-destructive">
            {w}
          </p>
        ))}
      </div>
    )
  }

  // After a successful publish — show review result
  if (
    (publishStatus === "success" || publishStatus === "error") &&
    reviewResult
  ) {
    const hasIssues =
      reviewResult.corrections.length > 0 || reviewResult.warnings.length > 0

    return (
      <div className="space-y-1">
        {!hasIssues && publishStatus === "success" && (
          <div className="flex items-center gap-2 text-xs text-green-700 dark:text-green-400">
            <span>&#10003;</span>
            <span>No issues found — published cleanly</span>
          </div>
        )}
        {reviewResult.corrections.map((c, i) => (
          <p key={i} className="text-xs text-amber-600 dark:text-amber-400">
            Auto-corrected: {c}
          </p>
        ))}
        {reviewResult.warnings.map((w, i) => (
          <p key={i} className="text-xs text-amber-600 dark:text-amber-400">
            Warning: {w}
          </p>
        ))}
      </div>
    )
  }

  // Pre-publish idle state
  if (isHighRisk) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded-lg px-3 py-2">
          <span>&#9888;</span>
          <span>High-risk action — confirmation required</span>
        </div>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={highRiskConfirmed}
            onChange={onToggleHighRisk}
            className="accent-destructive"
          />
          <span className="text-xs text-muted-foreground">
            I understand this is a high-risk action
          </span>
        </label>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted rounded-lg px-3 py-2">
      <span>&#10003;</span>
      <span>Ready to review and publish</span>
    </div>
  )
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
  const [instruction, setInstruction] = useState<Instruction | null>(null)
  const [sidePanelOpen, setSidePanelOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<SidePanelTab>("preview")
  const [publishStatus, setPublishStatus] = useState<
    "idle" | "publishing" | "success" | "error" | "blocked"
  >("idle")
  const [publishMessage, setPublishMessage] = useState("")
  const [reviewResult, setReviewResult] = useState<ReviewSummary | null>(null)
  const [isHighRisk, setIsHighRisk] = useState(false)
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
    setInstruction(null)
    setSidePanelOpen(false)
    setPublishStatus("idle")
    setPublishMessage("")
    setReviewResult(null)
    setIsHighRisk(false)
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
    setPublishStatus("idle")
    setPublishMessage("")
    setReviewResult(null)
    setIsHighRisk(false)
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
      let aiInstruction: Instruction | null = null

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
                instruction?: Instruction | null
                message?: string
              }

              if (parsed.text !== undefined) {
                aiText = parsed.text
              }
              if (parsed.instruction !== undefined) {
                aiInstruction = parsed.instruction
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

      if (aiInstruction) {
        setInstruction(aiInstruction)
        setSidePanelOpen(true)

        // Classify risk on the client side for gating the Publish button
        const riskLevel = classifyAction(aiInstruction)
        setIsHighRisk(riskLevel === "high")
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

  async function handlePublish() {
    if (!instruction) return
    setPublishStatus("publishing")
    setPublishMessage("")
    setReviewResult(null)

    try {
      const response = await fetch(`/api/sites/${siteId}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction }),
      })

      const data = (await response.json()) as {
        success?: boolean
        post_id?: number
        error?: string
        warnings?: string[]
        review?: ReviewSummary
      }

      if (response.ok && data.success) {
        if (data.review) {
          setReviewResult(data.review)
        }
        setPublishStatus("success")
        setPublishMessage(
          `Published successfully${data.post_id ? ` (post ID: ${data.post_id})` : ""}`
        )
      } else if (response.status === 400 && data.error === "Blocked by security reviewer") {
        // Blocked — surface the warnings from the review
        setReviewResult({
          corrections: [],
          warnings: data.warnings ?? [],
          riskLevel: "high",
        })
        setPublishStatus("blocked")
        setPublishMessage(data.error)
      } else {
        if (data.review) {
          setReviewResult(data.review)
        }
        setPublishStatus("error")
        setPublishMessage(data.error ?? "Failed to publish")
      }
    } catch (error) {
      setPublishStatus("error")
      setPublishMessage(
        error instanceof Error ? error.message : "Failed to publish"
      )
    }
  }

  const publishDisabled =
    publishStatus === "publishing" ||
    publishStatus === "success" ||
    (isHighRisk && !highRiskConfirmed)

  return (
    <div className="flex h-[calc(100vh-53px)] overflow-hidden">
      {/* Chat area */}
      <div
        className={cn(
          "flex flex-col transition-all duration-300",
          sidePanelOpen ? "flex-1" : "w-full"
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
          {currentSite && (
            <span
              className={cn(
                "ml-auto inline-block size-2 rounded-full shrink-0",
                currentSite.connected ? "bg-green-500" : "bg-muted-foreground/40"
              )}
              title={currentSite.connected ? "Connected" : "Not connected"}
            />
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
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

        {/* Input area */}
        <div className="border-t border-border px-6 py-4">
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

      {/* Side panel */}
      <div
        className={cn(
          "border-l border-border flex flex-col transition-all duration-300 overflow-hidden",
          sidePanelOpen ? "w-96" : "w-0"
        )}
      >
        {sidePanelOpen && instruction && (
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
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto p-4">
              {activeTab === "preview" ? (
                <InstructionPreview instruction={instruction} />
              ) : (
                <pre className="text-xs bg-muted rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all">
                  {JSON.stringify(instruction, null, 2)}
                </pre>
              )}
            </div>

            {/* Security summary + publish */}
            <div className="border-t border-border p-4 space-y-3">
              <SecuritySummary
                publishStatus={publishStatus}
                publishMessage={publishMessage}
                reviewResult={reviewResult}
                isHighRisk={isHighRisk}
                highRiskConfirmed={highRiskConfirmed}
                onToggleHighRisk={() => setHighRiskConfirmed((v) => !v)}
              />

              {publishStatus === "success" && (
                <p className="text-xs text-green-600 dark:text-green-400">
                  {publishMessage}
                </p>
              )}
              {publishStatus === "error" && (
                <p className="text-xs text-destructive">{publishMessage}</p>
              )}

              <Button
                onClick={() => void handlePublish()}
                disabled={publishDisabled}
                variant={publishStatus === "blocked" ? "destructive" : "default"}
                className="w-full"
              >
                {publishStatus === "publishing"
                  ? "Publishing..."
                  : publishStatus === "success"
                    ? "Published"
                    : publishStatus === "blocked"
                      ? "Blocked"
                      : "Publish"}
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
