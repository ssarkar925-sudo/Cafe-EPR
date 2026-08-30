import { NormalizedBillResponse } from "./types";
import { getBillerConfig } from "./biller-metadata";

export interface BillProvider {
  fetchBill(params: {
    billerId: string;
    category?: string;
    parameters: Record<string, string>;
  }): Promise<NormalizedBillResponse>;
}

function stripTrailingSlash(value?: string): string {
  if (!value) return "";
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

export class LiveBbpsProvider implements BillProvider {
  private clientId: string;
  private clientSecret: string;
  private agentId: string;
  private bbpsBase: string;
  private tokenBase: string;

  constructor(config: {
    clientId: string;
    clientSecret: string;
    agentId: string;
    bbpsBase?: string;
    tokenBase?: string;
  }) {
    this.clientId = config.clientId.trim();
    this.clientSecret = config.clientSecret.trim();
    this.agentId = config.agentId.trim();
    this.bbpsBase = stripTrailingSlash(config.bbpsBase || process.env.PAYU_BBPS_BASE_URL || "https://bbps-sb.payu.in/payu-nbc/v2/nbc");
    this.tokenBase = stripTrailingSlash(config.tokenBase || process.env.PAYU_TOKEN_BASE_URL || "https://accounts.payu.in");
  }

  private async getToken(): Promise<string> {
    const res = await fetch(`${this.tokenBase}/oauth/token`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        grant_type: "client_credentials",
        scope: "read_bill_details",
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.access_token) {
      throw new Error(data?.error_description || data?.error || "BBPS authentication failed");
    }
    return String(data.access_token);
  }

  async fetchBill(params: {
    billerId: string;
    category?: string;
    parameters: Record<string, string>;
  }): Promise<NormalizedBillResponse> {
    const biller = getBillerConfig(params.billerId);
    const billerName = biller?.billerName || params.billerId;

    try {
      const token = await this.getToken();
      const url = new URL(`${this.bbpsBase}/fetchBill`);
      url.searchParams.set("agentId", this.agentId);
      url.searchParams.set("billerId", params.billerId);
      for (const [k, v] of Object.entries(params.parameters)) {
        if (v) url.searchParams.set(k, v);
      }

      const res = await fetch(url, {
        method: "GET",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        return {
          ok: false,
          configured: true,
          source: "provider_error",
          billerId: params.billerId,
          billerName,
          error: body?.message || "Bill fetch failed at provider.",
          status: "error",
        };
      }

      // Live BBPS Data Normalization
      const payload = body?.payload || body?.data || body;
      const amount = Number(payload?.billAmount || payload?.amount || payload?.dueAmount || 0);

      return {
        ok: true,
        configured: true,
        source: "bbps_live",
        billerId: params.billerId,
        billerName: payload?.billerName || billerName,
        customerName: payload?.customerName || payload?.consumerName || null,
        customerIdentifier: params.parameters.consumerId || null,
        billNumber: payload?.billNumber || payload?.billId || null,
        billingPeriod: payload?.billPeriod || payload?.billingPeriod || null,
        billDate: payload?.billDate || null,
        dueDate: payload?.dueDate || payload?.billDueDate || null,
        amount: amount > 0 ? amount : null,
        minimumAmount: Number(payload?.minAmount || payload?.minimumAmount || 0) || null,
        lateFee: Number(payload?.lateFee || 0) || null,
        fetchReference: payload?.referenceId || payload?.fetchRef || null,
        fetchedAt: new Date().toISOString(),
        status: "verified",
      };
    } catch (err: any) {
      const isTimeout = err?.name === "TimeoutError" || err?.name === "AbortError";
      return {
        ok: false,
        configured: true,
        source: isTimeout ? "timeout" : "provider_error",
        billerId: params.billerId,
        billerName,
        error: isTimeout ? "Bill fetch timed out" : (err instanceof Error ? err.message : "BBPS provider error"),
        status: "error",
      };
    }
  }
}

export class UnconfiguredBillProvider implements BillProvider {
  async fetchBill(params: {
    billerId: string;
    category?: string;
    parameters: Record<string, string>;
  }): Promise<NormalizedBillResponse> {
    const biller = getBillerConfig(params.billerId);
    return {
      ok: false,
      configured: false,
      source: "unconfigured",
      billerId: params.billerId,
      billerName: biller?.billerName || params.billerId,
      customerIdentifier: params.parameters.consumerId || null,
      error: "Live bill fetch unavailable — provider not configured in environment.",
      status: "unverified",
    };
  }
}

export function getBillProvider(): BillProvider {
  const clientId = process.env.BBPS_CLIENT_ID || process.env.PAYU_CLIENT_ID;
  const clientSecret = process.env.BBPS_CLIENT_SECRET || process.env.PAYU_CLIENT_SECRET;
  const agentId = process.env.BBPS_AGENT_ID || process.env.PAYU_AGENT_ID;

  if (clientId && clientSecret && agentId) {
    return new LiveBbpsProvider({ clientId, clientSecret, agentId });
  }

  return new UnconfiguredBillProvider();
}
