import { compileSaiPlan } from "./plan-compiler";
import type { SaiPlan, SaiRiskLevel, SaiWorldState } from "@/lib/sai/core/types";
import { getSaiCapability } from "@/lib/sai/core/capabilities";
import "@/lib/sai/capabilities/business-observe";
import "@/lib/sai/capabilities/pos-observe";
import "@/lib/sai/capabilities/customer-intelligence";
import "@/lib/sai/capabilities/aeps-intelligence";
import "@/lib/sai/capabilities/portal-watcher-observe";
import "@/lib/sai/capabilities/service-intelligence";
import "@/lib/sai/capabilities/finance-intelligence";

const READ_PATTERNS = [
  /what is/i, /show/i, /check/i, /status/i, /how much/i, /who/i, /recent/i, /latest/i,
  /customer/i, /khata/i, /due/i, /balance/i, /ledger/i,
  /aeps/i, /aadhaar/i, /withdrawal/i, /payment collection/i, /commission/i, /fee/i,
  /portal/i, /watcher/i, /source/i, /collection run/i, /verification/i,
  /cash/i, /bank/i, /float/i, /settlement/i, /reconcil/i, /mismatch/i, /accounting entr/i, /what needs my attention/i, /unsettled/i,
  /কত/, /দেখাও/, /কি আছে/, /কে/, /গ্রাহক/, /খাতা/, /বকেয়া/, /লেনদেন/, /পোর্টাল/, /ওয়াচার/,
  /क्या/, /बताओ/, /ग्राहक/, /खाता/, /बकाया/, /लेनदेन/, /पोर्टल/,
];

function resolveReadCapability(text: string): { id: string; input: Record<string, unknown> } {
  const lower = text.toLowerCase();

  if (/(what needs (my )?attention|needs attention|what should i focus on|business health|কী মনোযোগ|ध्यान देने योग्य)/i.test(text)) {
    return { id: "finance.observe_attention", input: {} };
  }

  if (/(reconcil|mismatch|missing accounting|duplicate (journal|accounting)|unbalanced (entry|journal)|অমিল|मिलान में)/i.test(text)) {
    return { id: "finance.reconcile", input: {} };
  }

  if (/(settlement|unsettled|settled|सेटलमेंट|নিষ্পত্তি)/i.test(text)) {
    return { id: "finance.observe_settlements", input: {} };
  }

  if (/(cash|cash-in-hand|cash in hand|cash book|customer due|customer dues|receivable|ক্যাশ|নগদ|ग्राहक बकाया)/i.test(text)) {
    return { id: "finance.observe_cash", input: {} };
  }

  if (/(bank balance|bank account|bank accounts|float|wallet balance|service balance|low bank|কম ব্যালেন্স)/i.test(text)) {
    return { id: "finance.observe_float", input: {} };
  }

  if (/(portal|watcher|source|collection run|verification|পোর্টাল|ওয়াচার)/i.test(text)) {
    return { id: "aeps.observe_watcher", input: {} };
  }

  if (/(dmt|remittance|money transfer|মনি ট্রান্সফার|ডিএমটি|धन हस्तांतरण|मनी ट्रांसफर)/i.test(text)) {
    return { id: "dmt.observe_transactions", input: {} };
  }

  if (/(upi|qr payment|upi collection|ইউপিআই|কিউআর|यूपीआई|क्यूआर)/i.test(text)) {
    return { id: "upi.observe_transactions", input: {} };
  }

  if (/(recharge|mobile recharge|রিচার্জ|মোবাইল রিচার্জ|रिचार्ज|मोबाइल रिचार्ज)/i.test(text)) {
    if (/(plan|price|rate|catalog|operator|provider|প্ল্যান|দাম|অপারেটর|রেট|प्लान|कीमत|ऑपरेटर)/i.test(text)) {
      return { id: "recharge.observe_context", input: {} };
    }
    return { id: "recharge.observe_transactions", input: {} };
  }

  if (/(bbps|bill payment|utility bill|electricity bill|gas bill|water bill|fastag|বিল পেমেন্ট|বিল|बिल भुगतान|यूटिलिटी)/i.test(text)) {
    if (/(commission|fee|rule|config|কমিশন|ফি|নিয়ম|कमीशन|फीस|नियम)/i.test(text)) {
      return { id: "bbps.observe_context", input: {} };
    }
    return { id: "bbps.observe_transactions", input: {} };
  }

  if (/(customer|khata|due|receivable|ledger|balance|গ্রাহক|খাতা|বকেয়া|ग्राहक|खाता|बकाया)/i.test(text)) {
    const customerMatch = text.match(/(?:for|of|from|customer|গ্রাহক|के लिए|का|की)\\s+(.+)$/i);
    return { id: /\\b(?:khata|ledger|due|receivable|balance)\\b|খাতা|বকেয়া|खाता|बकाया/i.test(text) ? "customer.ledger" : "customer.search",
      input: { query: customerMatch?.[1]?.trim() || text } };
  }

  if (/(aeps|aadhaar|withdrawal|payment collection|commission|fee|transaction|লেনদেন|পেমেন্ট|आधार|लेनदेन)/i.test(text)) {
    if (/(fee|commission|rule|portal setup|pricing|কমিশন|ফি|नियम|कमीशन|फीस)/i.test(text)) {
      return { id: "aeps.observe_context", input: {} };
    }
    if (/(pending|review|import|mobile|sms|মোবাইল|রিভিউ|आयात|मोबाइल|एसएमएस)/i.test(text)) {
      return { id: "aeps.observe_import_queue", input: {} };
    }
    return { id: "aeps.observe_transactions", input: {} };
  }

  return { id: "business.observe", input: { instruction: text } };
}

export function planSaiInstruction(input: { instruction: string; world: SaiWorldState }): SaiPlan {
  const text = input.instruction.trim();
  if (!text) throw new Error("SAI_INSTRUCTION_REQUIRED");

  const isRead = READ_PATTERNS.some((pattern) => pattern.test(text));
  if (isRead) {
    const selected = resolveReadCapability(text);
    const capability = getSaiCapability(selected.id);
    return compileSaiPlan({
      source: "instruction",
      goal: text,
      steps: capability
        ? [{ capability: capability.id, input: selected.input, risk: capability.risk }]
        : [],
    });
  }

  return compileSaiPlan({
    source: "instruction",
    goal: text,
    steps: [],
    requiresApproval: true,
  });
}

export function planRisk(plan: SaiPlan): SaiRiskLevel {
  return plan.steps.reduce<SaiRiskLevel>((risk, step) => {
    const order: SaiRiskLevel[] = ["read", "low", "medium", "high", "critical"];
    return order.indexOf(step.risk) > order.indexOf(risk) ? step.risk : risk;
  }, "read");
}
