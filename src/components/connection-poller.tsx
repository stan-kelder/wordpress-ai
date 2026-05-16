"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

interface ConnectionPollerProps {
  siteId: string
  initialConnected: boolean
}

export function ConnectionPoller({ siteId, initialConnected }: ConnectionPollerProps) {
  const [connected, setConnected] = useState(initialConnected)
  const router = useRouter()

  useEffect(() => {
    // If already connected, nothing to poll
    if (connected) return

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/sites/${siteId}/ping-check`)
        if (res.ok) {
          const data = await res.json() as { connected: boolean }
          if (data.connected) {
            setConnected(true)
            router.refresh()
            clearInterval(interval)
          }
        }
      } catch {
        // Network errors are silent — keep polling
      }
    }, 5000)

    return () => clearInterval(interval)
  }, [siteId, connected, router])

  return (
    <div className="flex items-center gap-2">
      <span
        className={`inline-block size-2.5 rounded-full ${
          connected ? "bg-green-500" : "bg-muted-foreground/40"
        }`}
      />
      <span className={`text-sm font-medium ${connected ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}>
        {connected ? "Connected" : "Not connected"}
      </span>
      {!connected && (
        <span className="text-xs text-muted-foreground">(checking every 5 seconds…)</span>
      )}
    </div>
  )
}
