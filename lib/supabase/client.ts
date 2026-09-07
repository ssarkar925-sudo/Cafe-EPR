import { createBrowserClient } from "@supabase/ssr";

let browserClient: ReturnType<typeof createBrowserClient> | null = null;
let rejectionListenerInstalled = false;

export function clearClientAuthCookies() {
  if (typeof document === "undefined") return;
  try {
    const cookies = document.cookie.split(";");
    for (const cookie of cookies) {
      const eqPos = cookie.indexOf("=");
      const name = eqPos > -1 ? cookie.slice(0, eqPos).trim() : cookie.trim();
      if (
        name.startsWith("sb-") ||
        name.includes("auth-token") ||
        name.includes("supabase") ||
        name.includes("refresh-token") ||
        name.includes("access-token")
      ) {
        document.cookie = `${name}=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=None; Secure`;
        document.cookie = `${name}=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
      }
    }
  } catch {
    /* ignore cookie clearing errors */
  }

  try {
    if (typeof localStorage !== "undefined") {
      const toRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (
          key &&
          (key.startsWith("sb-") ||
            key.includes("supabase") ||
            key.includes("auth-token") ||
            key.includes("refresh-token"))
        ) {
          toRemove.push(key);
        }
      }
      toRemove.forEach((k) => localStorage.removeItem(k));
    }
  } catch {
    /* ignore localStorage errors */
  }
}

function setupBrowserAuthErrorHandlers(client: ReturnType<typeof createBrowserClient>) {
  if (typeof window === "undefined") return;

  client.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT" || (event === "TOKEN_REFRESHED" && !session)) {
      clearClientAuthCookies();
    }
  });

  if (!rejectionListenerInstalled) {
    rejectionListenerInstalled = true;
    window.addEventListener("unhandledrejection", (event) => {
      const reason = event?.reason;
      const msg = reason?.message || String(reason || "");
      const isAuthError =
        reason?.__isAuthError === true ||
        reason?.name === "AuthApiError" ||
        msg.includes("Invalid Refresh Token") ||
        msg.includes("Refresh Token Not Found");

      if (isAuthError && (msg.includes("Refresh Token") || msg.includes("refresh_token") || reason?.__isAuthError)) {
        event.preventDefault();
        clearClientAuthCookies();
        if (window.location.pathname !== "/login" && !window.location.pathname.startsWith("/login")) {
          window.location.href = "/logout?reason=expired";
        }
      }
    });
  }
}

function wrapReconciliationClient(client: ReturnType<typeof createBrowserClient>) {
  if (typeof window === "undefined" || window.location.pathname !== "/finance/reconciliation") return client;

  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop !== "from") return Reflect.get(target, prop, receiver);

      return (table: string) => {
        const builder = (target as any).from(table);
        if (table !== "cash_entries") return builder;

        return new Proxy(builder, {
          get(query, queryProp, queryReceiver) {
            if (queryProp !== "select") return Reflect.get(query, queryProp, queryReceiver);

            return (columns?: string, ...rest: any[]) => {
              const rewrittenColumns =
                typeof columns === "string"
                  ? columns
                      .split(",")
                      .map((column) => (column.trim() === "remarks" ? "description" : column.trim()))
                      .join(",")
                  : columns;

              // Settlement rows are represented by the dedicated settlements stream.
              // Keeping them out of cash_entries prevents the same UPI settlement from
              // being counted once as a settlement and again as a cashbook movement.
              return (query as any)
                .select(rewrittenColumns, ...rest)
                .neq("ref_type", "settlement");
            };
          },
        });
      };
    },
  }) as ReturnType<typeof createBrowserClient>;
}

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key";

  if (typeof window === "undefined") {
    return createBrowserClient(url, anonKey, {
      cookieOptions: {
        path: "/",
        sameSite: "none",
        secure: true,
      },
    });
  }

  if (!browserClient) {
    const rawClient = createBrowserClient(url, anonKey, {
      cookieOptions: {
        path: "/",
        sameSite: "none",
        secure: true,
      },
    });

    browserClient = wrapReconciliationClient(rawClient);
    setupBrowserAuthErrorHandlers(browserClient);
  }

  return browserClient;
}

