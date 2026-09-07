import { createBrowserClient } from "@supabase/ssr";

let browserClient: ReturnType<typeof createBrowserClient> | null = null;
let rejectionListenerInstalled = false;

const FINANCIAL_IDEMPOTENT_RPCS = new Set([
  "create_sale",
  "record_quick_sale",
  "create_business_txn",
  "create_recharge",
  "record_invoice_payment",
  "record_invoice_multi_payment",
  "cancel_invoice",
  "cancel_quick_sale",
  "reverse_business_txn",
  "edit_bill_payment",
  "update_recharge",
  "edit_invoice",
  "update_business_txn",
  "record_advance",
  "return_advance",
  "process_return",
  "cancel_expense",
  "set_opening_balance",
  "record_customer_multi_payment",
]);

const idempotencyKeys = new Map<string, string>();

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;

  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(object[key])}`)
    .join(",")}}`;
}

function fingerprint(value: unknown): string {
  const input = stableSerialize(value);
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}

function getFinancialIdempotencyKey(operation: string, args: Record<string, unknown>): { cacheKey: string; key: string } {
  const payload = { ...args };
  delete payload.p_idempotency_key;
  const cacheKey = `cafeerp:idempotency:${operation}:${fingerprint(payload)}`;

  let key = idempotencyKeys.get(cacheKey);
  if (!key && typeof sessionStorage !== "undefined") {
    try {
      key = sessionStorage.getItem(cacheKey) || undefined;
    } catch {
      // Browser privacy/storage restrictions: fall back to module memory.
    }
  }

  if (!key) {
    key = newIdempotencyKey();
    idempotencyKeys.set(cacheKey, key);
    if (typeof sessionStorage !== "undefined") {
      try {
        sessionStorage.setItem(cacheKey, key);
      } catch {
        // Best-effort persistence. The in-memory cache still covers same-page retries.
      }
    }
  }

  return { cacheKey, key };
}

function clearFinancialIdempotencyKey(cacheKey: string) {
  idempotencyKeys.delete(cacheKey);
  if (typeof sessionStorage !== "undefined") {
    try {
      sessionStorage.removeItem(cacheKey);
    } catch {
      // Ignore storage cleanup failures.
    }
  }
}

function wrapFinancialMutationClient(client: ReturnType<typeof createBrowserClient>) {
  if (typeof window === "undefined") return client;

  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop !== "rpc") return Reflect.get(target, prop, receiver);

      return (functionName: string, args?: Record<string, unknown>, ...rest: unknown[]) => {
        const directRpc = (target as any).rpc.bind(target);
        if (!FINANCIAL_IDEMPOTENT_RPCS.has(functionName)) {
          return directRpc(functionName, args, ...rest);
        }

        const requestArgs: Record<string, unknown> = { ...(args ?? {}) };
        let cacheKey: string | null = null;

        const explicitKey = typeof requestArgs.p_idempotency_key === "string"
          ? requestArgs.p_idempotency_key.trim()
          : "";

        if (!explicitKey) {
          const generated = getFinancialIdempotencyKey(functionName, requestArgs);
          cacheKey = generated.cacheKey;
          requestArgs.p_idempotency_key = generated.key;
        }

        return Promise.resolve(directRpc(functionName, requestArgs, ...rest)).then((result: any) => {
          if (!result?.error && cacheKey) clearFinancialIdempotencyKey(cacheKey);
          return result;
        });
      };
    },
  }) as ReturnType<typeof createBrowserClient>;
}

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
      toRemove.forEach((key) => localStorage.removeItem(key));
    }
  } catch {
    /* ignore localStorage cleanup failures */
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

    const financialClient = wrapFinancialMutationClient(rawClient);
    browserClient = wrapReconciliationClient(financialClient);
    setupBrowserAuthErrorHandlers(browserClient);
  }

  return browserClient;
}
