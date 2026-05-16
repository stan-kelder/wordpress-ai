import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ConnectionPoller } from "@/components/connection-poller"

interface SitePageProps {
  params: Promise<{ id: string }>
}

export default async function SitePage({ params }: SitePageProps) {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const { id } = await params

  const site = await prisma.site.findUnique({ where: { id } })
  if (!site || site.userId !== session.user.id) notFound()

  return (
    <div className="p-8 max-w-2xl mx-auto space-y-8">
      {/* Back link */}
      <Link
        href="/dashboard"
        className="text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        ← Back to dashboard
      </Link>

      {/* Site header */}
      <div>
        <h1 className="text-2xl font-semibold mb-1">{site.name}</h1>
        <a
          href={site.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors underline underline-offset-4"
        >
          {site.url}
        </a>
      </div>

      {/* Open Chat */}
      <Link href={`/dashboard/sites/${site.id}/chat`}>
        <Button size="lg" className="w-full sm:w-auto">
          Open Chat
        </Button>
      </Link>

      {/* Connection status */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Connection status</CardTitle>
        </CardHeader>
        <CardContent>
          <ConnectionPoller siteId={site.id} initialConnected={site.connected} />
        </CardContent>
      </Card>

      {/* Download section */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Connector plugin</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Download and install the connector plugin on your WordPress site to enable AI management.
          </p>
          <a href={`/api/sites/${site.id}/download`} download>
            <Button>Download Connector Plugin</Button>
          </a>
        </CardContent>
      </Card>

      {/* Installation instructions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Installation instructions</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3 text-sm">
            <li className="flex gap-3">
              <span className="flex-shrink-0 flex items-center justify-center size-6 rounded-full bg-primary text-primary-foreground text-xs font-semibold">
                1
              </span>
              <span className="pt-0.5">
                Click <strong>Download Connector Plugin</strong> above.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 flex items-center justify-center size-6 rounded-full bg-primary text-primary-foreground text-xs font-semibold">
                2
              </span>
              <span className="pt-0.5">
                Log in to your WordPress admin at{" "}
                <a
                  href={`${site.url}/wp-admin`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-4 hover:text-foreground"
                >
                  {site.url}/wp-admin
                </a>
                .
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 flex items-center justify-center size-6 rounded-full bg-primary text-primary-foreground text-xs font-semibold">
                3
              </span>
              <span className="pt-0.5">
                Go to <strong>Plugins → Add New → Upload Plugin</strong>.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 flex items-center justify-center size-6 rounded-full bg-primary text-primary-foreground text-xs font-semibold">
                4
              </span>
              <span className="pt-0.5">
                Choose the downloaded <code className="bg-muted px-1 py-0.5 rounded text-xs">wordpress-ai-connector.zip</code> file and click <strong>Install Now</strong>.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 flex items-center justify-center size-6 rounded-full bg-primary text-primary-foreground text-xs font-semibold">
                5
              </span>
              <span className="pt-0.5">
                Click <strong>Activate Plugin</strong>.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 flex items-center justify-center size-6 rounded-full bg-primary text-primary-foreground text-xs font-semibold">
                6
              </span>
              <span className="pt-0.5">
                Your site will automatically connect — this page will update when connected.
              </span>
            </li>
          </ol>
        </CardContent>
      </Card>
    </div>
  )
}
