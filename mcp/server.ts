#!/usr/bin/env npx tsx
import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js"

const WP_URL = process.env.WP_URL
const WP_API_KEY = process.env.WP_API_KEY

if (!WP_URL || !WP_API_KEY) {
  process.stderr.write("Error: WP_URL and WP_API_KEY environment variables are required\n")
  process.exit(1)
}

const authHeader = { Authorization: `Bearer ${WP_API_KEY}` }

async function query(tool: string, params: Record<string, string>): Promise<unknown> {
  const qs = new URLSearchParams({ tool, ...params })
  const res = await fetch(`${WP_URL}/wp-json/wordpress-ai/v1/query?${qs}`, {
    headers: authHeader,
    signal: AbortSignal.timeout(20000),
  })
  return res.json()
}

async function execute(action: string, params: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`${WP_URL}/wp-json/wordpress-ai/v1/execute`, {
    method: "POST",
    headers: { ...authHeader, "Content-Type": "application/json" },
    body: JSON.stringify({ action, params }),
    signal: AbortSignal.timeout(20000),
  })
  return res.json()
}

const server = new Server(
  { name: "wordpress", version: "1.0.0" },
  { capabilities: { tools: {} } }
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "read_file",
      description: "Read any file under wp-content/, or wp-config.php. Returns path, content, and size.",
      inputSchema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "File path relative to WordPress root, e.g. 'wp-content/themes/twentytwentyfour/style.css'",
          },
        },
        required: ["path"],
      },
    },
    {
      name: "fetch_url",
      description: "Fetch any URL on the WordPress site and return rendered HTML. Use to inspect pages, verify changes, detect page builders (elementor-*, et_pb_*, wp-block-* classes).",
      inputSchema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Path like '/' or '/about', or a full URL on the same site",
          },
        },
        required: ["path"],
      },
    },
    {
      name: "execute_php",
      description: "Run PHP code in the WordPress context. Has access to all WordPress functions and $wpdb. Do NOT include <?php or ?> tags. Use return to send back a value.",
      inputSchema: {
        type: "object",
        properties: {
          code: {
            type: "string",
            description: "PHP code without opening/closing tags",
          },
          description: {
            type: "string",
            description: "One-line description of what this code does",
          },
        },
        required: ["code", "description"],
      },
    },
    {
      name: "write_file",
      description: "Write a file under wp-content/. Existing file is automatically backed up before overwrite.",
      inputSchema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "File path, e.g. 'wp-content/mu-plugins/my-customization.php'",
          },
          content: {
            type: "string",
            description: "Full file contents to write",
          },
          description: {
            type: "string",
            description: "One-line description of what this file does",
          },
        },
        required: ["path", "content", "description"],
      },
    },
    {
      name: "list_directory",
      description: "List files and subdirectories inside a wp-content/ directory. Use to discover installed themes, plugins, mu-plugins, uploads.",
      inputSchema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Directory path relative to WordPress root, e.g. 'wp-content/themes' or 'wp-content/plugins'",
          },
        },
        required: ["path"],
      },
    },
  ],
}))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params

  try {
    let result: unknown

    if (name === "read_file") {
      result = await query("read_file", { path: String(args?.path ?? "") })
    } else if (name === "fetch_url") {
      result = await query("fetch_url", { path: String(args?.path ?? "") })
    } else if (name === "execute_php") {
      result = await execute("execute_php", {
        code: String(args?.code ?? ""),
        description: String(args?.description ?? ""),
      })
    } else if (name === "write_file") {
      result = await execute("write_file", {
        path: String(args?.path ?? ""),
        content: String(args?.content ?? ""),
        description: String(args?.description ?? ""),
      })
    } else if (name === "list_directory") {
      const dirPath = String(args?.path ?? "").replace(/^wp-content\/?/, "")
      result = await execute("execute_php", {
        description: `List directory: ${args?.path}`,
        code: `
$dir = WP_CONTENT_DIR . '/' . ltrim('${dirPath.replace(/'/g, "\\'")}', '/');
if (!is_dir($dir)) return json_encode(['error' => 'Not a directory: ' . $dir]);
$items = [];
foreach (scandir($dir) as $name) {
  if ($name === '.' || $name === '..') continue;
  $full = $dir . '/' . $name;
  $items[] = ['name' => $name, 'type' => is_dir($full) ? 'dir' : 'file'];
}
return json_encode($items);
        `.trim(),
      })
    } else {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: `Unknown tool: ${name}` }) }],
        isError: true,
      }
    }

    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
    }
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
        },
      ],
      isError: true,
    }
  }
})

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
})
