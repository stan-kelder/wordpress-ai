import { tool } from "@opencode-ai/plugin"
import { wpExecute } from "../lib/site-routing"

export default tool({
  description:
    "Write a file under wp-content/. Existing file is automatically backed up before overwrite.",
  args: {
    path: tool.schema
      .string()
      .describe("File path, e.g. 'wp-content/mu-plugins/my-customization.php'"),
    content: tool.schema.string().describe("Full file contents to write"),
    description: tool.schema
      .string()
      .describe("One-line description of what this file does"),
  },
  async execute(args, { sessionID }) {
    return wpExecute(sessionID, "write_file", {
      path: args.path,
      content: args.content,
      description: args.description,
    })
  },
})
