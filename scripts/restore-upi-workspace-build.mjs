import fs from "node:fs";
import https from "node:https";

const RAW_URL = "https://raw.githubusercontent.com/ssarkar925-sudo/Cafe-EPR/b1d805a0dc8d8f9a9f80a350dd6d35f06475b1a2/components/business/upi-workspace.tsx";
const path = "components/business/upi-workspace.tsx";

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Failed to restore UPI workspace: HTTP ${res.statusCode}`));
        res.resume();
        return;
      }
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => resolve(data));
    }).on("error", reject);
  });
}

const metricsOld = `        if (t.fee_source === "customer_paid_extra") {\n          totalCashOut += amt;\n        } else {\n          totalCashOut += Math.max(0, amt - fee);\n        }`;
const metricsNew = `        const recordedCashOut = Number((t as any).cash_out) || 0;\n        if (recordedCashOut > 0) {\n          totalCashOut += recordedCashOut;\n        } else if (t.fee_source === "customer_paid_extra") {\n          totalCashOut += amt;\n        } else {\n          totalCashOut += Math.max(0, amt - fee);\n        }`;

const source = await fetchText(RAW_URL);
let repaired = source.replace(/\r\n/g, "\n");

if (repaired.includes(metricsOld)) {
  repaired = repaired.replace(metricsOld, metricsNew);
}

// The restored UI must expose the same fee modes accepted by the server RPC.
// `cut_from_payment` means the service fee reduces the net UPI/payout amount.
repaired = repaired.replace(
  '"cut_from_withdrawal" | "customer_paid_extra"',
  '"cut_from_withdrawal" | "cut_from_payment" | "customer_paid_extra"'
);
repaired = repaired.replace(
  '<option value="cut_from_withdrawal">Cut from payout</option>\n                  <option value="customer_paid_extra">Customer pays extra</option>',
  '<option value="cut_from_withdrawal">Cut from payout</option>\n                  <option value="cut_from_payment">Cut from payment</option>\n                  <option value="customer_paid_extra">Customer pays extra</option>'
);

// The restored UI uses `select(*)` for transactions, which includes cash_out.
// Keep the component complete; this script only restores the known-good source
// and applies the authoritative cash-out and fee-mode repairs above.
fs.writeFileSync(path, repaired);
console.log("Restored UPI workspace and enabled cut-from-payment fee semantics.");
