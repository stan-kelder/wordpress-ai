export type RiskLevel = "low" | "high"

export interface Instruction {
  action: string
  params: Record<string, unknown>
}

const HIGH_RISK_OPTION_KEYS = [
  "admin_email",
  "blogdescription",
  "siteurl",
  "home",
]

export function classifyAction(instruction: Instruction): RiskLevel {
  const { action, params } = instruction
  const actionLower = action.toLowerCase()

  // Safe create_page operations
  if (action === "create_page") {
    const status = params?.status
    if (status === "publish" || status === "draft") {
      return "low"
    }
  }

  // Anything related to deletion
  if (actionLower.includes("delete")) {
    return "high"
  }

  // User, role, or auth related
  if (
    actionLower.includes("user") ||
    actionLower.includes("role") ||
    actionLower.includes("auth")
  ) {
    return "high"
  }

  // Options with sensitive keys
  if (actionLower.includes("option")) {
    const paramKeys = Object.keys(params ?? {})
    const hasHighRiskKey = paramKeys.some((k) =>
      HIGH_RISK_OPTION_KEYS.includes(k.toLowerCase())
    )
    if (hasHighRiskKey) {
      return "high"
    }
  }

  // PHP execution
  if (
    actionLower.includes("php") ||
    actionLower.includes("eval") ||
    actionLower.includes("exec")
  ) {
    return "high"
  }

  // Unknown actions — fail safe
  if (action !== "create_page") {
    return "high"
  }

  // Default for unrecognised create_page variants
  return "high"
}
