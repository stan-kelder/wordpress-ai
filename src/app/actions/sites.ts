"use server"

import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"

type ActionState = { error: string } | undefined

export async function createSite(
  prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await auth()
  if (!session?.user?.id) {
    return { error: "Not authenticated" }
  }

  const name = (formData.get("name") as string)?.trim()
  const url = (formData.get("url") as string)?.trim()

  if (!name) {
    return { error: "Site name is required" }
  }
  if (!url) {
    return { error: "Site URL is required" }
  }

  // Normalise URL — strip trailing slash
  const normalisedUrl = url.replace(/\/+$/, "")

  const site = await prisma.site.create({
    data: {
      userId: session.user.id,
      name,
      url: normalisedUrl,
    },
  })

  redirect(`/dashboard/sites/${site.id}`)
}
