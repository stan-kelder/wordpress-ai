import { auth } from "@/lib/auth"

export default async function DashboardPage() {
  const session = await auth()

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold mb-1">
        Welcome{session?.user?.name ? `, ${session.user.name}` : ""}
      </h1>
      <p className="text-muted-foreground text-sm">
        Your WordPress sites will appear here once you connect one.
      </p>
    </div>
  )
}
