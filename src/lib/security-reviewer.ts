import Anthropic from "@anthropic-ai/sdk"
import { classifyAction, type Instruction, type RiskLevel } from "./classify-action"

export interface ReviewResult {
  approved: boolean
  riskLevel: RiskLevel
  corrections: string[]
  warnings: string[]
  instruction: Instruction
}

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const SECURITY_SYSTEM_PROMPT = `You are a security reviewer for a WordPress management AI. Review the given instruction JSON and call the submit_review tool with your assessment.

Rules:
- APPROVE safe operations: creating/editing content, updating settings, deleting pages/posts, managing menus and users
- FLAG (approved: true, with warning) suspicious content or unusual parameters
- BLOCK (approved: false) ONLY if the instruction would: escalate privileges to administrator, modify authentication settings, inject scripts or executable code into content, or do anything clearly malicious
- Routine deletions (delete_page, delete_post, remove_menu_item) are APPROVED — the user has already confirmed these through a separate high-risk gate

For execute_php instructions specifically:
- APPROVE if the code uses only WordPress API functions (wp_*, get_*, update_*, switch_theme, etc.) and returns a value
- BLOCK if the code uses: exec, shell_exec, system, passthru, file_put_contents, file_get_contents, fopen, curl_exec, fsockopen, base64_decode, eval, or any obfuscated/encoded strings
- BLOCK if the code attempts to read/write files, make network requests, or bypass WordPress APIs with direct $wpdb->query() using raw SQL
- FLAG with a warning if the code modifies critical options like siteurl, home, or active_plugins

For write_persistent_code instructions specifically:
- write_persistent_code follows the same rules as execute_php — block dangerous functions, approve WordPress API usage.
- APPROVE if the code uses only WordPress API functions (wp_*, get_*, update_*, add_action, add_filter, add_shortcode, register_post_type, etc.)
- BLOCK if the code uses: exec, shell_exec, system, passthru, file_put_contents, file_get_contents, fopen, curl_exec, fsockopen, base64_decode, eval, or any obfuscated/encoded strings

- If you auto-correct something, explain it in the corrections array
- Return the original instruction unchanged unless you are correcting something`

export async function reviewInstruction(
  instruction: Instruction
): Promise<ReviewResult> {
  const riskLevel = classifyAction(instruction)

  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: SECURITY_SYSTEM_PROMPT,
      tools: [
        {
          name: "submit_review",
          description: "Submit the security review result for this instruction",
          input_schema: {
            type: "object" as const,
            properties: {
              approved: {
                type: "boolean",
                description: "Whether the instruction is safe to execute",
              },
              corrections: {
                type: "array",
                items: { type: "string" },
                description: "List of things auto-corrected in the instruction",
              },
              warnings: {
                type: "array",
                items: { type: "string" },
                description: "List of warnings for the user",
              },
              instruction: {
                type: "object",
                description: "The (possibly corrected) instruction to execute",
              },
            },
            required: ["approved", "corrections", "warnings", "instruction"],
          },
        },
      ],
      tool_choice: { type: "tool", name: "submit_review" },
      messages: [
        {
          role: "user",
          content: JSON.stringify(instruction),
        },
      ],
    })

    const toolUse = response.content.find((b) => b.type === "tool_use")
    if (!toolUse || toolUse.type !== "tool_use") {
      return failSafe(instruction, riskLevel, "Security review returned no result")
    }

    const parsed = toolUse.input as {
      approved: boolean
      corrections: string[]
      warnings: string[]
      instruction: Instruction
    }

    return {
      approved: Boolean(parsed.approved),
      riskLevel,
      corrections: Array.isArray(parsed.corrections) ? parsed.corrections : [],
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
      instruction:
        parsed.instruction && typeof parsed.instruction === "object"
          ? (parsed.instruction as Instruction)
          : instruction,
    }
  } catch {
    return failSafe(instruction, riskLevel, "Security review failed")
  }
}

function failSafe(
  instruction: Instruction,
  riskLevel: RiskLevel,
  reason: string
): ReviewResult {
  return {
    approved: false,
    riskLevel,
    corrections: [],
    warnings: [reason],
    instruction,
  }
}
