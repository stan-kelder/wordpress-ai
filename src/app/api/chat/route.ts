import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import Anthropic from "@anthropic-ai/sdk"
import type {
  MessageParam,
  Tool,
  ToolResultBlockParam,
} from "@anthropic-ai/sdk/resources/messages/messages.js"
import { NextRequest } from "next/server"

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const SYSTEM_PROMPT = `You are an AI assistant that helps users manage their WordPress website through natural language.

When the user asks you to make a change, you MUST respond with:
1. A brief conversational explanation of what you're going to do
2. A JSON instruction block wrapped in \`\`\`json ... \`\`\` that describes the action

Available actions:
- create_page: { "action": "create_page", "params": { "title": string, "content": string, "status": "publish"|"draft" } }

You have access to a tool called list_pages to see existing pages on the site.

Always be helpful and concise. If you're unsure what the user wants, ask for clarification.`

const TOOLS: Tool[] = [
  {
    name: "list_pages",
    description:
      "Fetches a list of existing pages on the WordPress site. Returns an array of pages with their id, title, and url.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
]

interface ChatMessage {
  role: "user" | "assistant"
  content: string
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = (await request.json()) as {
    siteId: string
    messages: ChatMessage[]
  }
  const { siteId, messages } = body

  if (!siteId || !messages) {
    return Response.json({ error: "Missing siteId or messages" }, { status: 400 })
  }

  const site = await prisma.site.findUnique({ where: { id: siteId } })
  if (!site || site.userId !== session.user.id) {
    return Response.json({ error: "Site not found" }, { status: 404 })
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event: string, data: unknown) => {
        const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
        controller.enqueue(encoder.encode(payload))
      }

      try {
        // Agentic loop: allow the AI to use tools
        const anthropicMessages: MessageParam[] = messages.map((m) => ({
          role: m.role,
          content: m.content,
        }))

        let fullText = ""
        let instruction: unknown = null

        // Agentic loop — handle tool calls
        while (true) {
          const response = await anthropic.messages.create({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 1024,
            system: SYSTEM_PROMPT,
            tools: TOOLS,
            messages: anthropicMessages,
          })

          // Collect text and tool uses from the response
          let assistantText = ""
          const toolUses: Array<{
            id: string
            name: string
            input: Record<string, unknown>
          }> = []

          for (const block of response.content) {
            if (block.type === "text") {
              assistantText += block.text
            } else if (block.type === "tool_use") {
              toolUses.push({
                id: block.id,
                name: block.name,
                input: block.input as Record<string, unknown>,
              })
            }
          }

          // If there are tool uses, execute them and continue the loop
          if (toolUses.length > 0) {
            // Add the assistant's response to the message history
            anthropicMessages.push({
              role: "assistant",
              content: response.content,
            })

            // Execute each tool and collect results
            const toolResults: ToolResultBlockParam[] = []

            for (const toolUse of toolUses) {
              if (toolUse.name === "list_pages") {
                try {
                  const queryUrl = `${site.url}/wp-json/wordpress-ai/v1/query?tool=list_pages`
                  const wpResponse = await fetch(queryUrl, {
                    method: "GET",
                    headers: {
                      Authorization: `Bearer ${site.apiKey}`,
                    },
                    signal: AbortSignal.timeout(10000),
                  })

                  if (wpResponse.ok) {
                    const pages = await wpResponse.json()
                    toolResults.push({
                      type: "tool_result",
                      tool_use_id: toolUse.id,
                      content: JSON.stringify(pages),
                    })
                  } else {
                    toolResults.push({
                      type: "tool_result",
                      tool_use_id: toolUse.id,
                      content: JSON.stringify({ error: "Failed to fetch pages" }),
                      is_error: true,
                    })
                  }
                } catch {
                  toolResults.push({
                    type: "tool_result",
                    tool_use_id: toolUse.id,
                    content: JSON.stringify({
                      error: "Site unreachable or timed out",
                    }),
                    is_error: true,
                  })
                }
              }
            }

            // Add tool results to message history
            anthropicMessages.push({
              role: "user",
              content: toolResults,
            })

            // Continue the loop
            continue
          }

          // No more tool calls — we have the final response
          fullText = assistantText

          // Parse JSON instruction from the response
          const jsonMatch = fullText.match(/```json\n([\s\S]*?)\n```/)
          if (jsonMatch) {
            try {
              instruction = JSON.parse(jsonMatch[1])
            } catch {
              // Ignore parse errors
            }
          }

          break
        }

        sendEvent("text", { text: fullText })
        sendEvent("instruction", { instruction })
        sendEvent("done", {})
      } catch (error) {
        sendEvent("error", {
          message: error instanceof Error ? error.message : "Unknown error",
        })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  })
}
