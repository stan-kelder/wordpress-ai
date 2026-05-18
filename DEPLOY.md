# Deploy checklist

End-to-end deployment of the multi-tenant opencode + Next.js setup.

## Architecture

- **Vercel** — Next.js app (UI, auth, DB writes)
- **Railway** — opencode serve + custom WordPress tools, in a Docker container
- **Neon** — Postgres database, shared between Vercel and Railway (already exists)
- **Your WordPress site** — exposed via Local's Live Link for now

The opencode container loads custom tools from `.opencode/tools/`. Each tool's `execute` function gets the `sessionID` from opencode and looks up the site's credentials from the `AgentSession` + `Site` tables in Neon.

## One-time setup

### 1. GitHub repo

Already done — pushed to `github.com/stan-kelder/wordpress-ai`. Whenever you change code locally, `git push` and Railway will redeploy.

### 2. Create a Railway project

1. Go to https://railway.app/new
2. Pick **"Deploy from GitHub repo"**, select `wordpress-ai`
3. Railway detects the `Dockerfile` and `railway.json` automatically
4. **Choose region: `eu-west` or `eu-central`** to match your Neon DB (which is in `eu-central-1`)
5. After the first deploy fails (it will, because secrets aren't set yet), click on the service → Variables

### 3. Set Railway secrets

In the Railway service's Variables tab, add:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Same as your Vercel `DATABASE_URL` (the Neon connection string) |
| `ANTHROPIC_API_KEY` | Your Anthropic API key (from console.anthropic.com) |
| `OPENCODE_SERVER_PASSWORD` | Generate a long random string — `openssl rand -hex 32` |

Railway will redeploy automatically when you save.

### 4. Get the public Railway URL

In the Railway service → Settings → Networking → "Generate Domain". You'll get something like `wordpress-ai-production.up.railway.app`.

### 5. Set Vercel env vars

In your Vercel project → Settings → Environment Variables, add:

| Variable | Value |
|---|---|
| `OPENCODE_URL` | `https://wordpress-ai-production.up.railway.app` (from step 4) |
| `OPENCODE_SERVER_PASSWORD` | Same value you set on Railway |

Redeploy Vercel (push a commit, or trigger manually).

### 6. Enable Live Link on your local WordPress

1. Open the **Local** app on your Mac
2. Select `wordpressaisite`
3. Click **"Live Link"** in the bottom toolbar → enable
4. Copy the public URL (e.g. `https://something.loca.lt`)

### 7. Update the site row in Neon

Open your Vercel-deployed app, log in, and edit the WordPress site's URL to point at the Live Link URL from step 6.

(Or update directly via SQL: `UPDATE "Site" SET url = 'https://<your-live-link>.loca.lt' WHERE id = '<your-site-id>';`)

## Verifying it works

1. Open your Vercel app
2. Open the chat for your WordPress site
3. Send: *"List the themes in wp-content/themes"*
4. Expected flow:
   - Vercel `/api/chat` creates an opencode session on Railway
   - Vercel inserts a row in `AgentSession` linking that session to your site
   - Railway opencode calls the `list_directory` tool
   - The tool reads `AgentSession` from Neon, finds the site, gets the Live Link URL + API key
   - Tool makes an HTTP call to your local Mac via Live Link
   - Result streams back to your browser

## Local development

```bash
# In wordpress-ai/
cd /Users/stankelder/Claude/wordpress-ai

# Start opencode (it auto-loads .opencode/tools/)
# Important: DATABASE_URL must be set so tools can query the routing table
export $(grep -v '^#' .env | xargs)
opencode serve

# In another terminal
npm run dev
```

For local dev, leave `OPENCODE_URL` unset (defaults to `localhost:4096`) and `OPENCODE_SERVER_PASSWORD` unset (no auth header sent).

## Troubleshooting

- **`UnknownError` from opencode** — usually means the model ID is wrong or `ANTHROPIC_API_KEY` is missing. Check Railway logs.
- **`No site routing registered for opencode session …`** — `/api/chat` failed to INSERT into `AgentSession` before sending the message, or the row was deleted. Check the `AgentSession` table.
- **WordPress calls fail with "not found" or hang** — Live Link URL changed, or Local app is not running. Re-enable Live Link and update the site row.
- **Tool calls hit the wrong WordPress site** — routing bug. Check that `AgentSession.opencodeSessionId` matches what's in the SSE `session` event in the browser.
