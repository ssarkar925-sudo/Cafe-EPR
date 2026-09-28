import { createClient } from "@/lib/supabase/server";
import type { SaiActor, SaiAutonomyDecision, SaiAutonomyPolicy, SaiCapability, SaiCommand, SaiExecutionMode, SaiRiskLevel } from "./types";

const APPROVAL_RISKS = new Set<SaiRiskLevel>(["high", "critical"]);
const RISK_ORDER: SaiRiskLevel[] = ["read", "low", "medium", "high", "critical"];
const DEFAULT_TIMEZONE = "Asia/Kolkata";

export function saiCommandRequiresApproval(command: SaiCommand, capability?: SaiCapability): boolean {
  return APPROVAL_RISKS.has(command.risk) || Boolean(capability?.requiresApproval);
}

export function validateSaiCommand(command: SaiCommand): void {
  if (!command.commandId || !command.idempotencyKey) throw new Error("SAI command identity is required");
  if (!command.actor.userId || !command.actor.businessId) throw new Error("SAI actor context is required");
  if (!command.capability) throw new Error("SAI capability is required");
  if (command.status !== "planned") throw new Error("New SAI commands must start in planned state");
}

function rowToPolicy(row: Record<string, unknown>, actor: SaiActor): SaiAutonomyPolicy {
  return {
    policyId: String(row.policy_id),
    actor,
    autonomyEnabled: Boolean(row.autonomy_enabled),
    maxAutoRisk: row.max_auto_risk as SaiRiskLevel,
    dailyActionBudget: Number(row.daily_action_budget),
    autonomousActionsUsed: Number(row.autonomous_actions_used),
    budgetDate: String(row.budget_date),
    quietHoursEnabled: Boolean(row.quiet_hours_enabled),
    quietHoursStart: row.quiet_hours_start ? String(row.quiet_hours_start).slice(0, 5) : undefined,
    quietHoursEnd: row.quiet_hours_end ? String(row.quiet_hours_end).slice(0, 5) : undefined,
    quietHoursTimezone: String(row.quiet_hours_timezone || DEFAULT_TIMEZONE),
    criticalInterrupt: Boolean(row.critical_interrupt),
    requireApprovalForMutations: Boolean(row.require_approval_for_mutations),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function getSaiAutonomyPolicy(actor: SaiActor): Promise<SaiAutonomyPolicy | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("sai_autonomy_policies").select("*")
    .eq("business_id", actor.businessId).eq("actor_user_id", actor.userId).maybeSingle();
  if (error) throw new Error("SAI_AUTONOMY_POLICY_READ_FAILED: " + error.message);
  return data ? rowToPolicy(data as Record<string, unknown>, actor) : null;
}

export async function saveSaiAutonomyPolicy(actor: SaiActor, input: Partial<{
  autonomyEnabled: boolean;
  maxAutoRisk: SaiRiskLevel;
  dailyActionBudget: number;
  quietHoursEnabled: boolean;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  quietHoursTimezone: string;
  criticalInterrupt: boolean;
  requireApprovalForMutations: boolean;
}>): Promise<SaiAutonomyPolicy> {
  const maxAutoRisk = input.maxAutoRisk ?? "low";
  if (!RISK_ORDER.includes(maxAutoRisk)) throw new Error("SAI_AUTONOMY_RISK_INVALID");
  const dailyActionBudget = input.dailyActionBudget ?? 20;
  if (!Number.isInteger(dailyActionBudget) || dailyActionBudget < 0 || dailyActionBudget > 1000) {
    throw new Error("SAI_AUTONOMY_BUDGET_INVALID");
  }
  const timezone = input.quietHoursTimezone?.trim() || DEFAULT_TIMEZONE;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: timezone }).format();
  } catch {
    throw new Error("SAI_AUTONOMY_TIMEZONE_INVALID");
  }
  const supabase = await createClient();
  const { data, error } = await supabase.from("sai_autonomy_policies").upsert({
    business_id: actor.businessId,
    actor_user_id: actor.userId,
    autonomy_enabled: input.autonomyEnabled ?? false,
    max_auto_risk: maxAutoRisk,
    daily_action_budget: dailyActionBudget,
    quiet_hours_enabled: input.quietHoursEnabled ?? false,
    quiet_hours_start: input.quietHoursStart || null,
    quiet_hours_end: input.quietHoursEnd || null,
    quiet_hours_timezone: timezone,
    critical_interrupt: input.criticalInterrupt ?? true,
    require_approval_for_mutations: input.requireApprovalForMutations ?? true,
    updated_at: new Date().toISOString(),
  }, { onConflict: "business_id,actor_user_id" }).select("*").single();
  if (error) throw new Error("SAI_AUTONOMY_POLICY_SAVE_FAILED: " + error.message);
  return rowToPolicy(data as Record<string, unknown>, actor);
}

function isQuietHours(policy: SaiAutonomyPolicy, now = new Date()): boolean {
  if (!policy.quietHoursEnabled || !policy.quietHoursStart || !policy.quietHoursEnd) return false;
  const formatted = new Intl.DateTimeFormat("en-GB", {
    timeZone: policy.quietHoursTimezone, hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(now);
  const [hour, minute] = formatted.split(":").map(Number);
  const current = hour * 60 + minute;
  const [startHour, startMinute] = policy.quietHoursStart.split(":").map(Number);
  const [endHour, endMinute] = policy.quietHoursEnd.split(":").map(Number);
  const start = startHour * 60 + startMinute;
  const end = endHour * 60 + endMinute;
  return start === end ? true : start < end ? current >= start && current < end : current >= start || current < end;
}

export async function evaluateSaiAutonomy(input: {
  actor: SaiActor;
  capability: SaiCapability & { mutates?: boolean };
  risk: SaiRiskLevel;
  mode: SaiExecutionMode;
  now?: Date;
}): Promise<SaiAutonomyDecision> {
  if (input.mode === "operator") return { allowed: true, requiresApproval: false, reason: "OPERATOR_MODE" };
  const policy = await getSaiAutonomyPolicy(input.actor);
  if (!policy) return { allowed: false, requiresApproval: false, reason: "AUTONOMY_POLICY_NOT_CONFIGURED" };
  if (!policy.autonomyEnabled) return { allowed: false, requiresApproval: false, reason: "AUTONOMY_DISABLED" };
  if (isQuietHours(policy, input.now)) {
    if (input.risk === "critical" && policy.criticalInterrupt) {
      return { allowed: false, requiresApproval: true, reason: "AUTONOMY_CRITICAL_INTERRUPT" };
    }
    return { allowed: false, requiresApproval: false, reason: "AUTONOMY_QUIET_HOURS" };
  }
  if (RISK_ORDER.indexOf(input.risk) > RISK_ORDER.indexOf(policy.maxAutoRisk)) {
    return { allowed: false, requiresApproval: true, reason: "AUTONOMY_RISK_ABOVE_CEILING" };
  }
  if (input.capability.mutates && policy.requireApprovalForMutations) {
    return { allowed: false, requiresApproval: true, reason: "AUTONOMY_MUTATION_APPROVAL_REQUIRED" };
  }
  return { allowed: true, requiresApproval: false, reason: "OPERATOR_MODE" };
}

export async function consumeSaiAutonomyBudget(actor: SaiActor): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("sai_consume_autonomy_budget", {
    p_business_id: actor.businessId,
    p_actor_user_id: actor.userId,
  });
  if (error) throw new Error("SAI_AUTONOMY_BUDGET_CONSUME_FAILED: " + error.message);
  return Boolean(data);
}