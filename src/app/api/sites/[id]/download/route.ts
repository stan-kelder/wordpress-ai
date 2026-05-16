import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { NextRequest } from "next/server"
import { zipSync, strToU8 } from "fflate"
import { readFile } from "fs/promises"
import path from "path"

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 })
  }

  const { id } = await params

  const site = await prisma.site.findUnique({ where: { id } })
  if (!site || site.userId !== session.user.id) {
    return new Response("Not found", { status: 404 })
  }

  const cloudUrl =
    process.env.NEXTAUTH_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "http://localhost:3000"

  const templatePath = path.join(process.cwd(), "connector-plugin", "wordpress-ai-connector.php")
  const template = await readFile(templatePath, "utf-8")

  const pluginContent = template
    .replace(/\{\{API_KEY\}\}/g, site.apiKey)
    .replace(/\{\{CLOUD_URL\}\}/g, cloudUrl)

  const zipped = zipSync({
    "wordpress-ai-connector/wordpress-ai-connector.php": strToU8(pluginContent),
  })

  return new Response(zipped, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="wordpress-ai-connector.zip"',
      "Content-Length": String(zipped.byteLength),
    },
  })
}
