import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { AddSiteForm } from "@/components/add-site-form"

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const sites = await prisma.site.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
  })

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-semibold mb-1">
          Welcome{session.user.name ? `, ${session.user.name}` : ""}
        </h1>
        <p className="text-muted-foreground text-sm">
          Manage your WordPress sites with natural language AI.
        </p>
      </div>

      {sites.length === 0 ? (
        <div className="space-y-4">
          <p className="text-muted-foreground text-sm">
            No sites connected yet. Add your first WordPress site to get started.
          </p>
          <AddSiteForm />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            {sites.map((site) => (
              <Link key={site.id} href={`/dashboard/sites/${site.id}`}>
                <Card className="hover:border-foreground/20 transition-colors cursor-pointer">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{site.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1">
                    <p className="text-sm text-muted-foreground truncate">{site.url}</p>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`inline-block size-2 rounded-full ${
                          site.connected ? "bg-green-500" : "bg-muted-foreground/40"
                        }`}
                      />
                      <span className="text-xs text-muted-foreground">
                        {site.connected ? "Connected" : "Not connected"}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
          <AddSiteForm />
        </div>
      )}
    </div>
  )
}
