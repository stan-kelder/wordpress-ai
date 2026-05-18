import { tool } from "@opencode-ai/plugin"
import { wpQuery } from "../lib/site-routing"

export default tool({
  description:
    "Fetch any URL on the WordPress site and return rendered HTML. Use to inspect pages, verify changes, detect page builders (elementor-*, et_pb_*, wp-block-* classes).",
  args: {
    path: tool.schema
      .string()
      .describe("Path like '/' or '/about', or a full URL on the same site"),
  },
  async execute(args, { sessionID }) {
    return wpQuery(sessionID, "fetch_url", { path: args.path })
  },
})
