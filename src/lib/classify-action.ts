export type RiskLevel = "high"

export interface Instruction {
  action: string
  params: Record<string, unknown>
}

export function classifyAction(_instruction: Instruction): RiskLevel {
  return "high"
}
