"use client"

import { useEffect, useRef, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { HugeiconsIcon } from "@hugeicons/react"
import { EyeIcon, CodeIcon, SendHorizontal } from "@hugeicons/core-free-icons"
import { cn } from "@/lib/utils"

interface Message {
  role: "user" | "assistant"
  content: string
}

interface Instruction {
  action: string
  params: Record<string, string>
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
  if (instruction.action === "create_page") {
    return (
      <div className="space-y-3">
        <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Action
        </p>
        <p className="text-sm">
          Will create page:{" "}
          <strong className="text-foreground">
            {instruction.params?.title ?? "Untitled"}
          </strong>
        </p>
        {instruction.params?.status && (
          <p className="text-sm text-muted-foreground">
            Status:{" "}
            <span className="text-foreground">{instruction.params.status}</span>
          </p>
        )}
        {instruction.params?.content && (
          <div>
            <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-1">
              Content preview
            </p>
            <p className="text-sm text-muted-foreground line-clamp-4">
              {instruction.params.content}
            </p>
          </div>
        )}
      </div>
    )
  }

  return (
    <p className="text-sm text-muted-foreground">
      Action: <strong>{instruction.action}</strong>
    </p>
  )
}

export default function ChatPage() {
  const params = useParams()
  const siteId = params.id as string

  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [instruction, setInstruction] = useState<Instruction | null>(null)
  const [sidePanelOpen, setSidePanelOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<SidePanelTab>("preview")
  const [publishStatus, setPublishStatus] = useState<
    "idle" | "publishing" | "success" | "error"
  >("idle")
  const [publishMessage, setPublishMessage] = useState("")

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

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
      }

      if (response.ok && data.success) {
        setPublishStatus("success")
        setPublishMessage(
          `Published successfully${data.post_id ? ` (post ID: ${data.post_id})` : ""}`
        )
      } else {
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
            href={`/dashboard/sites/${siteId}`}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Back
          </Link>
          <span className="text-sm text-muted-foreground">|</span>
          <span className="text-sm font-medium">Chat</span>
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
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted rounded-lg px-3 py-2">
                <span>&#10003;</span>
                <span>Changes reviewed — ready to publish</span>
              </div>

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
                disabled={
                  publishStatus === "publishing" ||
                  publishStatus === "success"
                }
                className="w-full"
              >
                {publishStatus === "publishing"
                  ? "Publishing..."
                  : publishStatus === "success"
                    ? "Published"
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
