// electron/aeps-network-interceptor.js
// Chrome DevTools Protocol (CDP) Passive Network Interceptor for AEPS
// Captures raw JSON responses in-flight directly from internal banking/portal APIs.
// Zero UI dependencies. Does not alter or inject any network traffic.

/**
 * Common keys used by Indian AEPS gateways and B2B portals (DigiPay, Spice Money, Payworld, RNFI, etc.)
 */
const RRN_KEYS = ["rrn", "bankrrn", "externalref", "refno", "stan", "utr", "txnreference", "externalreference", "bankreference", "operatorref", "billerref", "operatorid", "bbpsref", "ackno"];
const TXN_ID_KEYS = ["txnid", "transactionid", "transid", "orderid", "externalid", "clientrefid", "requestid"];
const AMOUNT_KEYS = ["amount", "txnamount", "transactionamount", "transamount", "withdrawamount", "billamount", "rechargeamount", "transferamount"];
const STATUS_KEYS = ["status", "statuscode", "responsecode", "txnstatus", "result", "msg", "message"];
const BANK_KEYS = ["bank", "bankname", "issuerbank", "remitterbank", "beneficiarybank"];
const BALANCE_KEYS = ["balance", "accountbalance", "customerbalance", "ledgerbalance", "availablebalance", "walletbalance"];
const COMM_KEYS = ["commission", "retailercommission", "margin", "tds", "retailerearning"];
const FEE_KEYS = ["fee", "charge", "servicecharge", "customerfee", "convfee", "conveniencefee"];
const SENDER_MOBILE_KEYS = ["sendermobile", "remittermobile", "customermobile", "mobile", "custmobile", "phone"];
const BENEFICIARY_KEYS = ["beneficiaryname", "beneName", "receivername", "accountnumber", "accountno", "beneaccount", "ifsc", "ifsccode", "upiid", "vpa"];
const CONSUMER_KEYS = ["consumerno", "canumber", "consumernumber", "kno", "accountid", "billerid", "billername", "operator"];

function findValueInObject(obj, targetKeys) {
  if (!obj || typeof obj !== "object") return null;

  if (Array.isArray(obj)) {
    for (const item of obj) {
      const nested = findValueInObject(item, targetKeys);
      if (nested !== null) return nested;
    }
    return null;
  }

  for (const [key, val] of Object.entries(obj)) {
    const cleanKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (targetKeys.includes(cleanKey) && val !== null && val !== undefined && val !== "") {
      return val;
    }
    if (typeof val === "object" && val !== null) {
      const nested = findValueInObject(val, targetKeys);
      if (nested !== null) return nested;
    }
  }
  return null;
}

function parseAepsNetworkPayload(json, url) {
  if (!json || typeof json !== "object") return null;

  // Search recursively for primary financial fields
  const rawRrn = findValueInObject(json, RRN_KEYS);
  const rawTxnId = findValueInObject(json, TXN_ID_KEYS);
  const rawAmount = findValueInObject(json, AMOUNT_KEYS);
  const rawStatus = findValueInObject(json, STATUS_KEYS);
  const rawBank = findValueInObject(json, BANK_KEYS);
  const rawBalance = findValueInObject(json, BALANCE_KEYS);
  const rawCommission = findValueInObject(json, COMM_KEYS);
  const rawFee = findValueInObject(json, FEE_KEYS);
  const rawMobile = findValueInObject(json, SENDER_MOBILE_KEYS);
  const rawBeneficiary = findValueInObject(json, BENEFICIARY_KEYS);
  const rawConsumer = findValueInObject(json, CONSUMER_KEYS);

  // Parse amount strictly as number
  let amount = null;
  if (rawAmount !== null && rawAmount !== undefined) {
    const cleaned = String(rawAmount).replace(/[^0-9.]/g, "");
    const parsed = parseFloat(cleaned);
    if (!isNaN(parsed) && parsed > 0) {
      amount = parsed;
    }
  }

  // Determine stage and serviceType based on URL or payload traits
  const urlLower = String(url || "").toLowerCase();
  let stage = "FINAL";
  if (
    urlLower.includes("passbook") ||
    urlLower.includes("statement") ||
    urlLower.includes("history") ||
    urlLower.includes("report") ||
    urlLower.includes("mini_statement") ||
    urlLower.includes("ledger")
  ) {
    stage = "PASSBOOK";
  }

  let serviceType = "aeps";
  if (urlLower.includes("dmt") || urlLower.includes("remit") || urlLower.includes("payout") || urlLower.includes("moneytransfer")) {
    serviceType = "dmt";
  } else if (urlLower.includes("bbps") || urlLower.includes("bill") || urlLower.includes("utility") || urlLower.includes("electricity")) {
    serviceType = "bbps";
  } else if (urlLower.includes("recharge") || urlLower.includes("dth") || urlLower.includes("prepaid")) {
    serviceType = "recharge";
  }

  // Parse status
  let status = "SUCCESS";
  if (rawStatus !== null && rawStatus !== undefined) {
    const stStr = String(rawStatus).toUpperCase();
    if (
      stStr === "00" ||
      stStr === "SUCCESS" ||
      stStr === "SUCCESSFUL" ||
      stStr === "APPROVED" ||
      stStr === "COMPLETED" ||
      stStr === "1" ||
      stStr === "TRUE"
    ) {
      status = "SUCCESS";
    } else if (
      stStr.includes("FAIL") ||
      stStr.includes("DECLINE") ||
      stStr.includes("ERROR") ||
      stStr === "0" ||
      stStr === "FALSE"
    ) {
      status = "FAILED";
    }
  }

  // If there's neither RRN, Txn ID, nor Amount, it's likely an unrelated API
  if (!rawRrn && !rawTxnId && amount === null) {
    return null;
  }

  const fields = {
    serviceType,
    rrn: rawRrn ? String(rawRrn).trim() : null,
    reference: rawRrn ? String(rawRrn).trim() : rawTxnId ? String(rawTxnId).trim() : null,
    transactionId: rawTxnId ? String(rawTxnId).trim() : null,
    amount,
    bank: rawBank ? String(rawBank).trim() : null,
    accountBalance: rawBalance !== null ? String(rawBalance).trim() : null,
    portalCommission: rawCommission !== null ? Number(rawCommission) || null : null,
    portalFee: rawFee !== null ? Number(rawFee) || null : null,
    customerMobile: rawMobile ? String(rawMobile).trim().replace(/\D/g, "").slice(-10) : null,
    beneficiaryName: rawBeneficiary ? String(rawBeneficiary).trim() : null,
    consumerNumber: rawConsumer ? String(rawConsumer).trim() : null,
    status,
    observedVia: "cdp_network_interception",
  };

  return {
    stage,
    serviceType,
    fields,
  };
}

class AepsNetworkInterceptor {
  constructor(webContents, onObservation) {
    this.webContents = webContents;
    this.onObservation = typeof onObservation === "function" ? onObservation : () => {};
    this.attached = false;
    this.pendingRequests = new Map();
  }

  attach() {
    if (!this.webContents || this.webContents.isDestroyed() || this.attached) return;

    try {
      this.webContents.debugger.attach("1.3");
      this.attached = true;

      this.webContents.debugger.sendCommand("Network.enable");

      this.webContents.debugger.on("message", async (_event, method, params) => {
        if (method === "Network.responseReceived") {
          const { response, requestId } = params;
          const mime = String(response.mimeType || "").toLowerCase();
          const url = String(response.url || "");

          // Only inspect JSON responses or potential API endpoints
          const isJsonMime = mime.includes("json") || mime.includes("javascript") || mime.includes("text/plain");
          const isLikelyApi =
            url.includes("/api/") ||
            url.includes("aeps") ||
            url.includes("dmt") ||
            url.includes("remit") ||
            url.includes("payout") ||
            url.includes("bbps") ||
            url.includes("bill") ||
            url.includes("utility") ||
            url.includes("recharge") ||
            url.includes("transaction") ||
            url.includes("withdraw") ||
            url.includes("passbook") ||
            url.includes("report") ||
            url.includes("statement") ||
            url.includes("balance");

          if (isJsonMime || isLikelyApi) {
            try {
              const bodyResult = await this.webContents.debugger.sendCommand("Network.getResponseBody", { requestId });
              if (bodyResult && bodyResult.body) {
                const text = bodyResult.base64Encoded
                  ? Buffer.from(bodyResult.body, "base64").toString("utf8")
                  : bodyResult.body;

                try {
                  const json = JSON.parse(text);
                  const parsed = parseAepsNetworkPayload(json, url);
                  if (parsed) {
                    this.onObservation({
                      stage: parsed.stage,
                      fields: parsed.fields,
                      evidence: {
                        url,
                        source: "network_interception_cdp",
                        status: response.status,
                        capturedAt: new Date().toISOString(),
                      },
                    });
                  }
                } catch {
                  // Not valid JSON or irrelevant response
                }
              }
            } catch {
              // Network.getResponseBody can fail if response was purged or streaming; safe to ignore
            }
          }
        }
      });

      this.webContents.on("destroyed", () => {
        this.detach();
      });
    } catch (e) {
      // Debugger might already be attached or disallowed by policy
      console.warn("[SAI Network Interceptor] CDP attach skipped:", e.message);
    }
  }

  detach() {
    if (!this.attached) return;
    try {
      if (this.webContents && !this.webContents.isDestroyed() && this.webContents.debugger.isAttached()) {
        this.webContents.debugger.detach();
      }
    } catch {}
    this.attached = false;
  }
}

module.exports = {
  AepsNetworkInterceptor,
  parseAepsNetworkPayload,
  findValueInObject,
};
