import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { reviewInstruction } from "@/lib/security-reviewer"
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

const SYSTEM_PROMPT = `You are a WordPress management assistant with tools to read from and modify a user's WordPress site. Operate like a developer exploring an unfamiliar codebase — explore first, then act.

Your tools:
- read_file: read any file under wp-content/, plus wp-config.php
- fetch_url: GET any URL and see the rendered HTML
- execute_php: run PHP in the WordPress context — query DB, call WordPress functions
- write_file: write a file under wp-content/ (auto-backed up before overwrite)

Explore before acting: fetch the page, inspect the HTML, check the active theme. Every WordPress site is different — themes, page builders, plugins all vary.

Never ask clarifying questions. Make a reasonable assumption and proceed.

When you receive {"staged": true} from execute_php or write_file, the change is queued for user approval. Do not say it is done — tell the user what is staged and awaiting their approval in the panel.

Be concise. No bullet lists. One sentence before acting.

WordPress knowledge:
- Gutenberg pages: post_content holds serialized block markup. Use wp_update_post() to edit it. Valid core block types: wp:paragraph, wp:heading, wp:html, wp:shortcode, wp:group, wp:columns, wp:buttons, wp:button, wp:image, wp:separator, wp:spacer, wp:list, wp:list-item. NEVER use wp:form, wp:form-wrapper, wp:form-field, wp:form-submit-button — these do not exist in WordPress core and will break the page. For a contact form: use <!-- wp:html --> containing a raw <form> tag with <input> and <button> elements. Do not trust block types found in existing post_content — that content may already contain invalid blocks from previous edits.
- Elementor pages: layout stored in _elementor_data post meta as JSON. Use update_post_meta() to edit.
- Detect the builder from fetched HTML: elementor-* classes = Elementor, et_pb_* = Divi, wp-block-* = Gutenberg.
- execute_php that writes to the database (wp_update_post, update_post_meta, update_option, wp_insert_post, etc.) is staged for approval just like write_file — you will receive {"staged": true}.
- To list active plugins, run execute_php with: return implode(", ", array_keys(get_option("active_plugins", [])));`

const TOOLS: Tool[] = [
  {
    name: "read_file",
    description:
      "Reads a file from the WordPress installation. Scope: any file under wp-content/, plus read-only access to wp-config.php. Returns the file's path, content, and size. Use this to inspect theme files, plugin code, mu-plugins, uploaded files.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: { type: "string", description: "File path relative to the WordPress root, e.g. 'wp-content/themes/twentytwentyfour/front-page.php'" },
      },
      required: ["path"],
    },
  },
  {
    name: "fetch_url",
    description:
      "Fetches a URL from the WordPress site and returns the rendered HTML. Use this to see what visitors actually see, to verify changes worked, to inspect the markup of pages built with page builders (look for elementor-*, et_pb_*, wp-block-* classes to identify the builder).",
    input_schema: {
      type: "object" as const,
      properties: {
        path: { type: "string", description: "Path on the site, e.g. '/' or '/about', or a full URL on the same site" },
      },
      required: ["path"],
    },
  },
  {
    name: "execute_php",
    description:
      "Executes PHP code inside the WordPress context. Has access to all WordPress functions (get_posts, get_option, update_option, get_post_meta, wp_insert_post, $wpdb, etc.). The code should return a value that will be shown to you as the result. Do NOT include <?php or ?> tags.",
    input_schema: {
      type: "object" as const,
      properties: {
        code: { type: "string", description: "PHP code without opening/closing tags. Use return to send back a value." },
        description: { type: "string", description: "One-line description of what this code does" },
      },
      required: ["code", "description"],
    },
  },
  {
    name: "write_file",
    description:
      "Writes a file under wp-content/. The existing file (if any) is automatically backed up before overwrite. Stages the change for user approval — you receive {staged: true} as confirmation.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: { type: "string", description: "File path, e.g. 'wp-content/mu-plugins/my-customization.php'" },
        content: { type: "string", description: "Full file contents to write" },
        description: { type: "string", description: "One-line description of what this file does and why we're writing it" },
      },
      required: ["path", "content", "description"],
    },
  },
]

const READ_TOOLS = new Set(["read_file", "fetch_url"])
const WRITE_TOOLS = new Set(["write_file"])

const WRITE_PHP_PATTERNS = [
  /\bwp_update_post\s*\(/i,
  /\bwp_insert_post\s*\(/i,
  /\bwp_delete_post\s*\(/i,
  /\bwp_trash_post\s*\(/i,
  /\bupdate_option\s*\(/i,
  /\bdelete_option\s*\(/i,
  /\bupdate_post_meta\s*\(/i,
  /\badd_post_meta\s*\(/i,
  /\bdelete_post_meta\s*\(/i,
  /\$wpdb\s*->\s*(insert|update|delete|query)\s*\(/i,
]

function isWritePhp(code: string): boolean {
  return WRITE_PHP_PATTERNS.some((p) => p.test(code))
}

function statusTextForTool(name: string): string {
  switch (name) {
    case "read_file": return "Reading file..."
    case "fetch_url": return "Fetching URL..."
    case "execute_php": return "Running PHP..."
    case "write_file": return "Staging file write..."
    default: return `Calling ${name}...`
  }
}

interface ChatMessage {
  role: "user" | "assistant"
  content: string
}

interface StagedInstruction {
  action: string
  params: Record<string, unknown>
}

const TOOL_RESULT_MAX_CHARS = 15000

function truncateContent(content: string): string {
  if (content.length <= TOOL_RESULT_MAX_CHARS) return content
  return content.slice(0, TOOL_RESULT_MAX_CHARS) + "\n...[truncated]"
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
        const anthropicMessages: MessageParam[] = messages.map((m) => ({
          role: m.role,
          content: m.content,
        }))

        let fullText = ""
        const stagedInstructions: StagedInstruction[] = []

        while (true) {
          sendEvent("context", { messages: anthropicMessages })

          const response = await anthropic.messages.create({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 4096,
            system: SYSTEM_PROMPT,
            tools: TOOLS,
            messages: anthropicMessages,
          })

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

          if (toolUses.length > 0) {
            if (assistantText) sendEvent("reasoning", { text: assistantText })

            anthropicMessages.push({
              role: "assistant",
              content: response.content,
            })

            const toolResults: ToolResultBlockParam[] = []

            for (const toolUse of toolUses) {
              sendEvent("status", { text: statusTextForTool(toolUse.name) })
              sendEvent("tool_call", { name: toolUse.name, input: toolUse.input })

              const pushResult = (content: string, is_error = false) => {
                toolResults.push({
                  type: "tool_result",
                  tool_use_id: toolUse.id,
                  content,
                  is_error,
                })
                sendEvent("tool_result", {
                  name: toolUse.name,
                  content: content.slice(0, 3000),
                  is_error,
                })
              }

              if (toolUse.name === "execute_php") {
                const review = await reviewInstruction({
                  action: "execute_php",
                  params: toolUse.input,
                })

                if (!review.approved) {
                  pushResult(
                    JSON.stringify({ error: `Blocked by reviewer: ${review.warnings.join(", ") || "no reason given"}` }),
                    true
                  )
                  continue
                }

                const code = String((review.instruction.params as Record<string, unknown>).code ?? "")

                if (isWritePhp(code)) {
                  stagedInstructions.push({ action: "execute_php", params: review.instruction.params as Record<string, unknown> })
                  pushResult(JSON.stringify({ staged: true }))
                  continue
                }

                try {
                  const executeUrl = `${site.url}/wp-json/wordpress-ai/v1/execute`
                  const wpResponse = await fetch(executeUrl, {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      Authorization: `Bearer ${site.apiKey}`,
                    },
                    body: JSON.stringify({
                      action: "execute_php",
                      params: review.instruction.params,
                    }),
                    signal: AbortSignal.timeout(20000),
                  })
                  const data: unknown = await wpResponse.json()
                  pushResult(truncateContent(JSON.stringify(data)), !wpResponse.ok)
                } catch {
                  pushResult(JSON.stringify({ error: "Site unreachable or timed out" }), true)
                }
              } else if (READ_TOOLS.has(toolUse.name)) {
                try {
                  const queryParams = new URLSearchParams({ tool: toolUse.name })
                  for (const [k, v] of Object.entries(toolUse.input)) {
                    queryParams.set(k, String(v))
                  }
                  const queryUrl = `${site.url}/wp-json/wordpress-ai/v1/query?${queryParams.toString()}`
                  const wpResponse = await fetch(queryUrl, {
                    method: "GET",
                    headers: { Authorization: `Bearer ${site.apiKey}` },
                    signal: AbortSignal.timeout(20000),
                  })

                  if (wpResponse.ok) {
                    const result = await wpResponse.json()
                    pushResult(truncateContent(JSON.stringify(result)))
                  } else {
                    const errBody = await wpResponse.text()
                    pushResult(JSON.stringify({ error: `Failed: ${errBody}` }), true)
                  }
                } catch {
                  pushResult(JSON.stringify({ error: "Site unreachable or timed out" }), true)
                }
              } else if (WRITE_TOOLS.has(toolUse.name)) {
                stagedInstructions.push({ action: toolUse.name, params: toolUse.input })
                pushResult(JSON.stringify({ staged: true }))
              } else {
                pushResult(JSON.stringify({ error: `Unknown tool: ${toolUse.name}` }), true)
              }
            }

            anthropicMessages.push({
              role: "user",
              content: toolResults,
            })

            continue
          }

          fullText = assistantText
          break
        }

        sendEvent("text", { text: fullText })
        sendEvent("instructions", { instructions: stagedInstructions })
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
