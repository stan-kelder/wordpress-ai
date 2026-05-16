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

const SECURITY_SYSTEM_PROMPT = `You are a security reviewer for a WordPress management AI. Your job is to review instructions before they are executed on a WordPress site.

Review the given instruction JSON and respond with a JSON object:
{
  "approved": boolean,
  "corrections": string[],
  "warnings": string[],
  "instruction": { ...modified instruction... }
}

Rules:
- APPROVE safe operations: creating/editing content pages, updating non-critical settings
- FLAG (approved: true, with warning) suspicious content or unusual parameters
- BLOCK (approved: false) if the instruction would: delete content, escalate privileges, modify authentication settings, inject scripts, or do anything clearly malicious
- If you correct something, explain it in the corrections array
- Always return valid JSON`

export async function reviewInstruction(
  instruction: Instruction
): Promise<ReviewResult> {
  const riskLevel = classifyAction(instruction)

  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: SECURITY_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: JSON.stringify(instruction),
        },
      ],
    })

    const textBlock = response.content.find((b) => b.type === "text")
    if (!textBlock || textBlock.type !== "text") {
      return failSafe(instruction, riskLevel, "Security review returned no text")
    }

    // Strip markdown code fences if present
    const raw = textBlock.text.trim()
    const jsonText = raw.startsWith("```")
      ? raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim()
      : raw

    const parsed = JSON.parse(jsonText) as {
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
    return failSafe(instruction, riskLevel, "Security review failed to parse")
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
