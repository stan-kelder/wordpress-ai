import { tool } from "@opencode-ai/plugin"
import { wpExecute } from "../lib/site-routing"

export default tool({
  description:
    "List files and subdirectories inside a wp-content/ directory. Use to discover installed themes, plugins, mu-plugins, uploads.",
  args: {
    path: tool.schema
      .string()
      .describe(
        "Directory path relative to WordPress root, e.g. 'wp-content/themes' or 'wp-content/plugins'"
      ),
  },
  async execute(args, { sessionID }) {
    const subPath = args.path.replace(/^wp-content\/?/, "").replace(/'/g, "\\'")
    const code = `
$dir = WP_CONTENT_DIR . '/' . ltrim('${subPath}', '/');
if (!is_dir($dir)) return json_encode(['error' => 'Not a directory: ' . $dir]);
$items = [];
foreach (scandir($dir) as $name) {
  if ($name === '.' || $name === '..') continue;
  $full = $dir . '/' . $name;
  $items[] = ['name' => $name, 'type' => is_dir($full) ? 'dir' : 'file'];
}
return json_encode($items);
`.trim()
    return wpExecute(sessionID, "execute_php", {
      code,
      description: `List directory: ${args.path}`,
    })
  },
})
