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

const SECURITY_SYSTEM_PROMPT = `You are a security reviewer for a WordPress management AI. The instruction will always be a write_file action that writes a file under wp-content/.

Review the file path and content for:
- Dangerous PHP functions in the content: exec, shell_exec, system, passthru, proc_open, popen, eval, base64_decode, gzinflate, str_rot13, curl_exec, fsockopen
- Writes to authentication-critical files (wp-config.php is read-only, so any attempt to write it should be blocked)
- Code that would lock the user out of their site (changing siteurl/home via update_option, etc.)

APPROVE if the file content is reasonable WordPress code (themes, plugins, mu-plugins, etc.) using WordPress APIs.

BLOCK if dangerous patterns are detected. Explain in warnings.

Call submit_review with your assessment.`

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
