import { Client } from "pg"

type SiteCredentials = { wpUrl: string; wpApiKey: string }

let client: Client | null = null
const cache = new Map<string, SiteCredentials>()

async function getClient(): Promise<Client> {
  if (client) return client
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error("DATABASE_URL not set — the opencode plugin needs it to look up site credentials")
  }
  const c = new Client({ connectionString })
  await c.connect()
  client = c
  return c
}

export async function getSiteForSession(sessionID: string): Promise<SiteCredentials> {
  const cached = cache.get(sessionID)
  if (cached) return cached

  const c = await getClient()
  const result = await c.query<{ url: string; apiKey: string }>(
    `SELECT s."url", s."apiKey"
       FROM "AgentSession" a
       JOIN "Site" s ON a."siteId" = s."id"
      WHERE a."opencodeSessionId" = $1
      LIMIT 1`,
    [sessionID]
  )
  if (result.rows.length === 0) {
    throw new Error(
      `No site routing registered for opencode session ${sessionID}. ` +
        `The /api/chat route must INSERT into AgentSession before sending a message.`
    )
  }
  const site: SiteCredentials = {
    wpUrl: result.rows[0].url,
    wpApiKey: result.rows[0].apiKey,
  }
  cache.set(sessionID, site)
  return site
}

export async function wpQuery(
  sessionID: string,
  tool: string,
  params: Record<string, string>
): Promise<string> {
  const { wpUrl, wpApiKey } = await getSiteForSession(sessionID)
  const qs = new URLSearchParams({ tool, ...params })
  const res = await fetch(`${wpUrl}/wp-json/wordpress-ai/v1/query?${qs}`, {
    headers: { Authorization: `Bearer ${wpApiKey}` },
    signal: AbortSignal.timeout(20000),
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`WordPress query (${tool}) failed: ${res.status} ${text}`)
  }
  return text
}

export async function wpExecute(
  sessionID: string,
  action: string,
  params: Record<string, unknown>
): Promise<string> {
  const { wpUrl, wpApiKey } = await getSiteForSession(sessionID)
  const res = await fetch(`${wpUrl}/wp-json/wordpress-ai/v1/execute`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${wpApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action, params }),
    signal: AbortSignal.timeout(20000),
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`WordPress execute (${action}) failed: ${res.status} ${text}`)
  }
  return text
}
