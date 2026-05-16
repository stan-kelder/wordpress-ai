"use client"

import { useActionState, useState } from "react"
import { createSite } from "@/app/actions/sites"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"

export function AddSiteForm() {
  const [open, setOpen] = useState(false)
  const [state, action, pending] = useActionState(createSite, undefined)

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        Add site
      </Button>
    )
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Add a WordPress site</CardTitle>
      </CardHeader>
      <form action={action}>
        <CardContent className="space-y-4">
          {state?.error && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}
          <div className="space-y-2">
            <Label htmlFor="name">Site name</Label>
            <Input
              id="name"
              name="name"
              type="text"
              placeholder="My Blog"
              required
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="url">Site URL</Label>
            <Input
              id="url"
              name="url"
              type="url"
              placeholder="https://example.com"
              required
            />
          </div>
        </CardContent>
        <CardFooter className="flex gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Adding…" : "Add site"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            Cancel
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}
