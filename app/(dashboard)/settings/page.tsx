import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";
import SystemSettingsClient from "@/components/settings/system-settings-client";

export const dynamic = "force-dynamic";

async function safeQuery<T>(fn: () => PromiseLike<{ data: T | null }>, fallback: T): Promise<T> {
  try {
    const res = await fn();
    return res.data ?? fallback;
  } catch {
    return fallback;
  }
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; section?: string }>;
}) {
  const role = await getUserRole();
  if (!hasRole(role, ["admin"])) redirect("/dashboard");

  const resolvedSearchParams = await searchParams;
  const initialTab = resolvedSearchParams?.tab;
  const initialSection = resolvedSearchParams?.section;
  const supabase = await createClient();

  const [{ data: initial }, { data: initialServices }, { data: initialPaymentMethods }] = await Promise.all([
    safeQuery(async () => supabase.from("settings").select("*").limit(1).maybeSingle(), null),
    safeQuery(async () => supabase.from("service_favorites").select("*"), []),
    safeQuery(async () => supabase.from("payment_methods").select("*").order("sort_order"), []),
  ]);

  return (
    <SystemSettingsClient
      initial={initial as any}
      initialServices={(initialServices ?? []) as any}
      initialPaymentMethods={(initialPaymentMethods ?? []) as any}
      initialTab={initialTab}
      initialSection={initialSection}
    />
  );
}
