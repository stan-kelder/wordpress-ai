export type RiskLevel = "low" | "high"

export interface Instruction {
  action: string
  params: Record<string, unknown>
}

const LOW_RISK_ACTIONS = new Set([
  "create_page",
  "update_page",
  "create_post",
  "update_post",
  "add_menu_item",
  "update_menu_item",
  "remove_menu_item",
  "update_product",
  "create_product",
])

const HIGH_RISK_ACTIONS = new Set([
  "delete_page",
  "delete_post",
  "create_user",
  "update_user_role",
  "update_setting",
  "execute_php",
])

export function classifyAction(instruction: Instruction): RiskLevel {
  const { action } = instruction
  const actionLower = action.toLowerCase()

  // Explicitly low-risk actions
  if (LOW_RISK_ACTIONS.has(action)) {
    return "low"
  }

  // Explicitly high-risk actions
  if (HIGH_RISK_ACTIONS.has(action)) {
    return "high"
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

  // Settings / options
  if (
    actionLower.includes("setting") ||
    actionLower.includes("option")
  ) {
    return "high"
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
  return "high"
}
