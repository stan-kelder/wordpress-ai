import { NextRequest } from "next/server"
import { codeToHtml } from "shiki"

export async function POST(request: NextRequest) {
  const { code, lang } = (await request.json()) as { code: string; lang: string }

  const html = await codeToHtml(code, {
    lang: lang || "json",
    theme: "github-dark",
  })

  return Response.json({ html })
}
