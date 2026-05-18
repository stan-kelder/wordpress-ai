import { tool } from "@opencode-ai/plugin"
import { wpQuery } from "../lib/site-routing"

export default tool({
  description:
    "Read any file under wp-content/, or wp-config.php. Returns path, content, and size.",
  args: {
    path: tool.schema
      .string()
      .describe(
        "File path relative to WordPress root, e.g. 'wp-content/themes/twentytwentyfour/style.css'"
      ),
  },
  async execute(args, { sessionID }) {
    return wpQuery(sessionID, "read_file", { path: args.path })
  },
})
