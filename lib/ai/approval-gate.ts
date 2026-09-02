import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";
import { OWNER_APPROVAL_REQUIRED, type AgentAction } from "@/lib/ai/agent-policy";

export type ApprovalRequest = {
  id: string;
  action: AgentAction;
  status: "pending" | "approved" | "rejected" | "expired" | "executed" | "cancelled";
  request_payload: Record<string, unknown>;
  created_at: string;
  expires_at: string;
};

const EXECUTABLE_ACTIONS = new Set<AgentAction>([
  "create_sale",
  "create_invoice",
  "write_transaction",
  "delete_record",
  "change_rule",
]);

export function isApprovalRequired(action: AgentAction) {
  return OWNER_APPROVAL_REQUIRED.has(action);
}

export function isExecutableAction(action: AgentAction) {
  return EXECUTABLE_ACTIONS.has(action);
}

export async function requireOwnerApproval(action: AgentAction, payload: Record<string, unknown>) {
  if (!isExecutableAction(action) || !isApprovalRequired(action)) {
    throw new Error("This action is not executable through the approval gate.");
  }

  const role = await getUserRole();
  if (!hasRole(role, ["admin", "staff"])) throw new Error("Unauthorized");

  const supabase = await createClient();
  const { data: userResult } = await supabase.auth.getUser();
  if (!userResult.user) throw new Error("Unauthorized");

  const { data, error } = await supabase
    .from("ai_action_approvals")
    .insert({
      requested_by: userResult.user.id,
      action,
      status: "pending",
      request_payload: payload,
    })
    .select("id, action, status, request_payload, created_at, expires_at")
    .single();

  if (error) throw new Error(error.message);
  return data as ApprovalRequest;
}

export async function approveAction(approvalId: string, note?: string) {
  const role = await getUserRole();
  if (role !== "admin") throw new Error("Owner approval is required.");

  const supabase = await createClient();
  const { data: userResult } = await supabase.auth.getUser();
  if (!userResult.user) throw new Error("Unauthorized");

  const { data, error } = await supabase
    .from("ai_action_approvals")
    .update({
      status: "approved",
      approved_by: userResult.user.id,
      approved_at: new Date().toISOString(),
      decision_note: note?.trim() || null,
    })
    .eq("id", approvalId)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .select("id, action, status, request_payload, created_at, expires_at, approved_at")
    .single();

  if (error) throw new Error(error.message);
  return data;
}
