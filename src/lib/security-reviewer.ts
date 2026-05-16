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
- APPROVE safe operations: creating/editing content pages, updating non-critical settings
- FLAG (approved: true, with warning) suspicious content or unusual parameters
- BLOCK (approved: false) if the instruction would: delete content, escalate privileges, modify authentication settings, inject scripts, or do anything clearly malicious
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
