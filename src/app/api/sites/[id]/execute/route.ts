import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { reviewInstruction } from "@/lib/security-reviewer"
import type { Instruction } from "@/lib/classify-action"
import { NextRequest } from "next/server"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params

  const site = await prisma.site.findUnique({ where: { id } })
  if (!site || site.userId !== session.user.id) {
    return Response.json({ error: "Site not found" }, { status: 404 })
  }

  if (!site.connected) {
    return Response.json({ error: "Site is not connected" }, { status: 400 })
  }

  const body = (await request.json()) as { instruction: unknown }
  const { instruction } = body

  if (!instruction) {
    return Response.json({ error: "Missing instruction" }, { status: 400 })
  }

  // Security review
  const review = await reviewInstruction(instruction as Instruction)

  if (!review.approved) {
    return Response.json(
      {
        error: "Blocked by security reviewer",
        warnings: review.warnings,
      },
      { status: 400 }
    )
  }

  // Auto-backup stub
  try {
    const backupUrl = `${site.url}/wp-json/wordpress-ai/v1/backup`
    await fetch(backupUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${site.apiKey}`,
      },
      signal: AbortSignal.timeout(10000),
    })
    // Backup is best-effort; continue even if it fails
  } catch {
    // Non-fatal — proceed with execute
  }

  // Execute the (potentially modified) instruction
  const executeUrl = `${site.url}/wp-json/wordpress-ai/v1/execute`

  try {
    const wpResponse = await fetch(executeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${site.apiKey}`,
      },
      body: JSON.stringify(review.instruction),
      signal: AbortSignal.timeout(15000),
    })

    const data: unknown = await wpResponse.json()

    if (!wpResponse.ok) {
      return Response.json(
        { error: "WordPress site returned an error", details: data },
        { status: wpResponse.status }
      )
    }

    return Response.json({
      ...(data as Record<string, unknown>),
      review: {
        corrections: review.corrections,
        warnings: review.warnings,
        riskLevel: review.riskLevel,
      },
    })
  } catch (error) {
    return Response.json(
      {
        error: "Failed to reach WordPress site",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 502 }
    )
  }
}
