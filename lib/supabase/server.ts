import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("Supabase environment is not configured");
  }

  return { url, key };
}

export async function createClient() {
  const cookieStore = await cookies();
  const { url, key } = getSupabaseConfig();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, {
              ...options,
              path: "/",
              sameSite: "none",
              secure: true,
            })
          );
        } catch {
          // Called from a Server Component; middleware refreshes sessions.
        }
      },
    },
  });
}

export async function getSafeUser(supabaseClient?: Awaited<ReturnType<typeof createClient>>) {
  try {
    const supabase = supabaseClient ?? (await createClient());
    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user) return null;
    return data.user;
  } catch {
    return null;
  }
}

