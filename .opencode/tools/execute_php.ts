import { tool } from "@opencode-ai/plugin"
import { wpExecute } from "../lib/site-routing"

export default tool({
  description:
    "Run PHP code in the WordPress context. Has access to all WordPress functions and $wpdb. Do NOT include <?php or ?> tags. Use return to send back a value.",
  args: {
    code: tool.schema
      .string()
      .describe("PHP code without opening/closing tags"),
    description: tool.schema
      .string()
      .describe("One-line description of what this code does"),
  },
  async execute(args, { sessionID }) {
    return wpExecute(sessionID, "execute_php", {
      code: args.code,
      description: args.description,
    })
  },
})
