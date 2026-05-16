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

const SYSTEM_PROMPT = `You are an AI assistant that helps users manage their entire WordPress website through natural language.

When the user asks you to make a change, respond with:
1. A brief conversational explanation of what you're going to do
2. A JSON instruction block wrapped in \`\`\`json ... \`\`\` that describes the action

CRITICAL RULES:
- You MUST always output the JSON instruction block for ANY requested action, including deletes, without exception.
- NEVER say you "can't" or "don't have the ability" to perform an action that is listed below. All listed actions are fully supported.
- Destructive actions (delete_page, delete_post, remove_menu_item) are intentionally supported and go through a separate security review. You must still generate the JSON.
- When the user asks to delete something, first use list_pages or list_posts to find the ID, then output the delete instruction.

AVAILABLE ACTIONS:

Pages:
- create_page: {"action":"create_page","params":{"title":string,"content":string,"status":"publish"|"draft"}}
- update_page: {"action":"update_page","params":{"id":number,"title":string,"content":string,"status":"publish"|"draft"}}
- delete_page: {"action":"delete_page","params":{"id":number}}

Posts:
- create_post: {"action":"create_post","params":{"title":string,"content":string,"status":"publish"|"draft","category":string}}
- update_post: {"action":"update_post","params":{"id":number,"title":string,"content":string,"status":"publish"|"draft"}}
- delete_post: {"action":"delete_post","params":{"id":number}}

Menus:
- update_menu_item: {"action":"update_menu_item","params":{"menu_id":number,"item_id":number,"title":string,"url":string}}
- add_menu_item: {"action":"add_menu_item","params":{"menu_id":number,"title":string,"url":string,"object_type":"custom"|"page","object_id":number}}
- remove_menu_item: {"action":"remove_menu_item","params":{"menu_id":number,"item_id":number}}

WordPress Settings:
- update_setting: {"action":"update_setting","params":{"option":string,"value":string}}

WooCommerce:
- update_product: {"action":"update_product","params":{"id":number,"name":string,"price":string,"description":string,"status":"publish"|"draft"}}
- create_product: {"action":"create_product","params":{"name":string,"price":string,"description":string,"status":"publish"|"draft"}}

Users:
- create_user: {"action":"create_user","params":{"username":string,"email":string,"role":"subscriber"|"contributor"|"author"|"editor"|"administrator","password":string}}
- update_user_role: {"action":"update_user_role","params":{"user_id":number,"role":"subscriber"|"contributor"|"author"|"editor"|"administrator"}}

PHP Execution (for advanced operations not covered by the actions above):
- execute_php: {"action":"execute_php","params":{"code":"<?php ... ?>","description":"one-line description of what this does"}}

Use execute_php ONLY when no JSON action covers what the user needs (e.g. changing the active theme, managing widgets, updating plugin-specific options, bulk operations, taxonomy management, custom field updates). The code runs inside WordPress so you can use any WordPress function: get_option(), update_option(), switch_theme(), wp_get_sidebars_widgets(), update_post_meta(), get_terms(), etc. Keep code concise, use WordPress APIs exclusively, and always return a meaningful value (string or array) so the user sees the result. Do NOT use file system, network, or database functions directly. IMPORTANT: do NOT include <?php or ?> tags in the code — write plain PHP statements only.

Persistent Code (for admin menus, hooks, shortcode definitions, custom post types — anything that needs to run on every WordPress page load):
- write_persistent_code: {"action":"write_persistent_code","params":{"slug":"unique-kebab-case-identifier","code":"PHP code without tags","description":"what this does"}}

Use write_persistent_code for: add_menu_page(), register_post_type(), add_action(), add_filter(), add_shortcode(), etc. Each slug overwrites its previous block, so re-running with the same slug is safe. Do NOT include <?php tags.

AVAILABLE QUERY TOOLS:
- list_pages: lists all published pages
- list_posts: lists recent posts
- get_active_plugins: lists installed/active plugins
- get_menu_structure: returns all menus and their items
- get_woocommerce_products: lists WooCommerce products (only if WooCommerce is active)
- get_site_settings: returns key WordPress settings (blogname, blogdescription, admin_email etc)
- get_users: lists WordPress users

IMPORTANT RULES:
- You can output MULTIPLE instruction JSON blocks in a single response if the user asks for multiple changes. Each block will be executed in sequence. Plan all steps upfront, output them all at once, and briefly describe what each step does.
- Use query tools when you need information before making a change.
- Be concise and helpful.`

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
  {
    name: "list_posts",
    description:
      "Fetches a list of recent posts on the WordPress site. Returns an array of posts with their id, title, url, and date.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_active_plugins",
    description:
      "Fetches the list of installed and active plugins on the WordPress site. Returns an array of plugins with their slug, name, and active status.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_menu_structure",
    description:
      "Fetches all navigation menus and their items from the WordPress site. Returns an array of menus with their id, name, and items (each with id, title, url, order).",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_woocommerce_products",
    description:
      "Fetches WooCommerce products from the WordPress site. Only works if WooCommerce is active. Returns an array of products with their id, name, price, and status.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_site_settings",
    description:
      "Fetches key WordPress site settings including blogname, blogdescription, admin_email, siteurl, home, and permalink_structure.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_users",
    description:
      "Fetches a list of WordPress users. Returns an array of users with their id, username, email, and role.",
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

const QUERY_TOOLS = [
  "list_pages",
  "list_posts",
  "get_active_plugins",
  "get_menu_structure",
  "get_woocommerce_products",
  "get_site_settings",
  "get_users",
] as const

type QueryToolName = (typeof QUERY_TOOLS)[number]

function isQueryTool(name: string): name is QueryToolName {
  return (QUERY_TOOLS as readonly string[]).includes(name)
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
              if (isQueryTool(toolUse.name)) {
                try {
                  const queryUrl = `${site.url}/wp-json/wordpress-ai/v1/query?tool=${toolUse.name}`
                  const wpResponse = await fetch(queryUrl, {
                    method: "GET",
                    headers: {
                      Authorization: `Bearer ${site.apiKey}`,
                    },
                    signal: AbortSignal.timeout(10000),
                  })

                  if (wpResponse.ok) {
                    const result = await wpResponse.json()
                    toolResults.push({
                      type: "tool_result",
                      tool_use_id: toolUse.id,
                      content: JSON.stringify(result),
                    })
                  } else {
                    toolResults.push({
                      type: "tool_result",
                      tool_use_id: toolUse.id,
                      content: JSON.stringify({ error: `Failed to fetch ${toolUse.name}` }),
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
              } else {
                toolResults.push({
                  type: "tool_result",
                  tool_use_id: toolUse.id,
                  content: JSON.stringify({ error: `Unknown tool: ${toolUse.name}` }),
                  is_error: true,
                })
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

          break
        }

        // Find all JSON blocks and parse them into an instructions array
        const jsonMatches = [...fullText.matchAll(/```json\n([\s\S]*?)\n```/g)]
        const instructions = jsonMatches.flatMap((m) => {
          try { return [JSON.parse(m[1])] } catch { return [] }
        })

        sendEvent("text", { text: fullText })
        sendEvent("instructions", { instructions })
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
