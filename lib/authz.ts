import { createClient } from "@/lib/supabase/server";

export async function getUserRole(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error || !user) return null;

    const { data } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    return (data?.role as string | null) ?? null;
  } catch {
    return null;
  }
}

export function hasRole(role: string | null, allowed: string[]): boolean {
  return role !== null && allowed.includes(role);
}
