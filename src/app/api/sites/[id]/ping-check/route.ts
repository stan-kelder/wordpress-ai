import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { NextRequest } from "next/server"

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return Response.json({ connected: false }, { status: 401 })
  }

  const { id } = await params

  const site = await prisma.site.findUnique({ where: { id } })
  if (!site || site.userId !== session.user.id) {
    return Response.json({ connected: false }, { status: 404 })
  }

  // If already marked as connected in DB, return early
  if (site.connected) {
    return Response.json({ connected: true })
  }

  // Attempt to reach the WordPress site's ping endpoint
  const pingUrl = `${site.url}/wp-json/wordpress-ai/v1/ping`

  try {
    const response = await fetch(pingUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${site.apiKey}`,
      },
      // 5-second timeout using AbortController
      signal: AbortSignal.timeout(5000),
    })

    if (response.ok) {
      const data = await response.json() as { status?: string }
      if (data?.status === "connected") {
        await prisma.site.update({
          where: { id: site.id },
          data: { connected: true },
        })
        return Response.json({ connected: true })
      }
    }
  } catch {
    // Unreachable or timed out — not connected yet
  }

  return Response.json({ connected: false })
}
