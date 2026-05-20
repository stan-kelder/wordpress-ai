import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { NextRequest } from "next/server"

const OPENCODE_URL = process.env.OPENCODE_URL ?? "http://localhost:4096"
const OPENCODE_PASSWORD = process.env.OPENCODE_SERVER_PASSWORD

function opencodeHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = { ...extra }
  if (OPENCODE_PASSWORD) headers["Authorization"] = `Bearer ${OPENCODE_PASSWORD}`
  return headers
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = (await request.json()) as {
    siteId: string
    message: string
    sessionId?: string
  }
  const { siteId, message, sessionId: existingSessionId } = body

  if (!siteId || !message) {
    return Response.json({ error: "Missing siteId or message" }, { status: 400 })
  }

  const site = await prisma.site.findUnique({ where: { id: siteId } })
  if (!site || site.userId !== session.user.id) {
    return Response.json({ error: "Site not found" }, { status: 404 })
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        )
      }

      try {
        // Create or reuse opencode session
        let sessionId = existingSessionId
        if (!sessionId) {
          const res = await fetch(`${OPENCODE_URL}/session`, {
            method: "POST",
            headers: opencodeHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({}),
            signal: AbortSignal.timeout(10000),
          })
          if (!res.ok) throw new Error(`opencode: failed to create session (${res.status}). Is opencode serve running?`)
          const data = (await res.json()) as { id: string }
          sessionId = data.id

          // Register session → site mapping so the opencode plugin can route tool calls
          await prisma.agentSession.create({
            data: { opencodeSessionId: sessionId, siteId: site.id },
          })
        }
        send("session", { sessionId })

        // Subscribe to event stream
        const abortController = new AbortController()
        const eventResponse = await fetch(`${OPENCODE_URL}/event`, {
          headers: opencodeHeaders(),
          signal: abortController.signal,
        }).catch(() => {
          throw new Error("Could not connect to opencode server. Run: opencode serve")
        })

        // Forward part updates for this session to the browser
        const forwardEvents = async () => {
          const reader = eventResponse.body!.getReader()
          const decoder = new TextDecoder()
          let buffer = ""

          try {
            while (true) {
              const { done, value } = await reader.read()
              if (done) break

              buffer += decoder.decode(value, { stream: true })
              const chunks = buffer.split("\n\n")
              buffer = chunks.pop() ?? ""

              for (const chunk of chunks) {
                if (!chunk.trim()) continue
                let data = ""
                for (const line of chunk.split("\n")) {
                  if (line.startsWith("data: ")) data = line.slice(6)
                }
                if (!data) continue

                let parsed: Record<string, unknown>
                try {
                  parsed = JSON.parse(data) as Record<string, unknown>
                } catch {
                  continue
                }

                if (
                  parsed.type === "message.part.updated" &&
                  typeof parsed.properties === "object" &&
                  parsed.properties !== null
                ) {
                  const d = parsed.properties as Record<string, unknown>
                  if (d.sessionID === sessionId) {
                    send("part_update", { part: d.part })
                  }
                }
              }
            }
          } catch {
            // Aborted — expected when message completes
          }
        }

        const forwardPromise = forwardEvents()

        // Send message to opencode (blocks until agent loop completes)
        const msgRes = await fetch(`${OPENCODE_URL}/session/${sessionId}/message`, {
          method: "POST",
          headers: opencodeHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            parts: [{ type: "text", text: message }],
          }),
          signal: AbortSignal.timeout(600000),
        })

        if (!msgRes.ok) {
          const err = await msgRes.text()
          throw new Error(`opencode message failed: ${err}`)
        }

        // Drain any final events then close
        await new Promise((resolve) => setTimeout(resolve, 300))
        abortController.abort()
        await forwardPromise

        send("done", { sessionId })
      } catch (error) {
        send("error", {
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
