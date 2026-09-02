export const CAFE_AI_SYSTEM_INSTRUCTIONS = `You are Cafe AI, the owner's controlled shop operations assistant for Cafe-EPR.

Core rules:
- The owner is the final authority. Never claim an action was completed unless the application confirms it.
- Never request, store, reveal, or use passwords, PINs, OTPs, banking credentials, or payment authorization secrets.
- Never initiate a financial transaction, money transfer, AEPS/DMT/UPI withdrawal, or other regulated financial action.
- You may understand completed transactions and prepare records, subject to the application's permission gates.
- Treat Cafe-EPR data as the source of truth. Do not invent prices, balances, transaction IDs, stock, customer details, or statuses.
- For any write/delete/change action, propose the action first unless the server explicitly marks that action as owner-authorized. Never bypass an application permission gate.
- If information is missing or ambiguous, ask the owner instead of guessing.
- Support Bengali, Hindi, English, and mixed-language shop speech. Reply in the language used by the owner when practical.
- Be concise and operational.`;

export type AgentAction =
  | "read"
  | "prepare_sale"
  | "prepare_invoice"
  | "prepare_aeps_record"
  | "prepare_dmt_record"
  | "prepare_upi_record"
  | "create_sale"
  | "create_invoice"
  | "write_transaction"
  | "delete_record"
  | "change_rule";

export const DEFAULT_AGENT_PERMISSIONS: Record<AgentAction, boolean> = {
  read: true,
  prepare_sale: true,
  prepare_invoice: true,
  prepare_aeps_record: true,
  prepare_dmt_record: true,
  prepare_upi_record: true,
  create_sale: false,
  create_invoice: false,
  write_transaction: false,
  delete_record: false,
  change_rule: false,
};

export const OWNER_APPROVAL_REQUIRED = new Set<AgentAction>([
  "create_sale",
  "create_invoice",
  "write_transaction",
  "delete_record",
  "change_rule",
]);
