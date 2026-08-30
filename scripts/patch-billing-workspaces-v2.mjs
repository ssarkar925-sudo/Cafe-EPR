import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const MARKER = "// BILLING_WORKSPACE_PATCH_V2";

function apply(file, edits) {
  const full = path.join(root, file);
  let source = fs.readFileSync(full, "utf8");
  if (source.includes(MARKER)) return;
  for (const [from, to] of edits) {
    if (!source.includes(from)) throw new Error(`Billing patch anchor missing in ${file}: ${from.slice(0, 120)}`);
    source = source.replace(from, to);
  }
  source = `${MARKER}\n${source}`;
  fs.writeFileSync(full, source);
}

apply("components/business/recharge-workspace.tsx", [
  [
    `  // Valid Funding Instruments (Active Cash, Bank, UPI, Wallet accounts - Excludes pure debit mirrors and credit limits)\n  const validFundingInstruments = useMemo(() => {\n    return instruments.filter(\n      (i) => i.is_active && ["cash", "bank", "upi", "wallet", "dmt_portal", "aeps_portal"].includes(i.type)\n    );\n  }, [instruments]);`,
    `  // Valid Funding Instruments. Credit cards are supported as a real provider/gateway funding source.\n  const validFundingInstruments = useMemo(() => {\n    return instruments.filter(\n      (i) => i.is_active && ["cash", "bank", "upi", "wallet", "dmt_portal", "aeps_portal", "credit_card"].includes(i.type)\n    );\n  }, [instruments]);`,
  ],
  [
    `export type PlanItem = {\n  id: string;`,
    `export type PlanItem = {\n  id: string;\n  provider_id?: string | null;`,
  ],
  [
    `  const [slabs, setSlabs] = useState<RechargeSlab[]>(initialRechargeSlabs);\n  const [instruments, setInstruments] = useState<PaymentInstrument[]>(initialPaymentInstruments);`,
    `  const [slabs, setSlabs] = useState<RechargeSlab[]>(initialRechargeSlabs);\n  const [instruments, setInstruments] = useState<PaymentInstrument[]>(initialPaymentInstruments);\n  const [catalogPlans, setCatalogPlans] = useState<PlanItem[]>(SAMPLE_PLANS);`,
  ],
  [
    `  useRealtime([\n    "transactions",\n    "recharge_providers",\n    "recharge_commission_slabs",\n    "customers",\n    "cash_entries",\n    "payment_instruments",\n  ]);`,
    `  useRealtime([\n    "transactions",\n    "recharge_providers",\n    "recharge_commission_slabs",\n    "recharge_plan_catalog",\n    "customers",\n    "cash_entries",\n    "payment_instruments",\n  ]);\n\n  useEffect(() => {\n    let cancelled = false;\n    (async () => {\n      const { data } = await supabase.from("recharge_plan_catalog").select("id,provider_id,category,amount,validity,data,voice,sms,description,badge").eq("is_active", true).order("sort_order").order("amount");\n      if (!cancelled && data && data.length > 0) setCatalogPlans(data as PlanItem[]);\n    })();\n    return () => { cancelled = true; };\n  }, []);`,
  ],
  [
    `    // Standard baseline margin if no DB slab configured (e.g. 1.5% - 2.5%)\n    if (pct === 0) {\n      if (selectedOperatorCode === "jio") pct = 1.8;\n      else if (selectedOperatorCode === "airtel") pct = 1.5;\n      else if (selectedOperatorCode === "vi") pct = 2.5;\n      else if (selectedOperatorCode === "bsnl") pct = 3.0;\n      else pct = 2.0;\n    }\n\n`,
    ``,
  ],
  [
    `              ))}\n            </div>\n\n            {/* Plan Cards Slider */}`,
    `              ))}\n            </div>\n\n            <div className="flex flex-wrap items-center gap-1.5">\n              {[10, 20, 49, 99, 149, 199, 249, 299, 349, 399, 499, 599, 719, 799, 859, 999, 1499, 1999, 2999, 3599].map((preset) => (\n                <button key={preset} type="button" onClick={() => { setAmount(String(preset)); setSelectedPlan(null); }} disabled={submitting} className={`rounded-lg border px-2.5 py-1.5 text-[10px] font-black transition ${Number(amount) === preset ? "border-indigo-600 bg-indigo-50 text-indigo-700 dark:border-indigo-500 dark:bg-indigo-950/40 dark:text-indigo-300" : "border-slate-200 bg-white text-slate-600 hover:border-indigo-300 dark:border-white/10 dark:bg-slate-800 dark:text-slate-300"}`}>₹{preset}</button>\n              ))}\n              <a href="/business/bill-payment/mobile-recharge/plans" className="rounded-lg border border-dashed border-indigo-300 px-2.5 py-1.5 text-[10px] font-black text-indigo-600 hover:bg-indigo-50 dark:border-indigo-500/40 dark:text-indigo-300">⚙ Customize</a>\n            </div>\n\n            {/* Plan Cards Slider */}`,
  ],
  [
    `{SAMPLE_PLANS.filter((p) => p.category === planCategory).map((plan) => {`,
    `{catalogPlans.filter((p) => {\n                if (p.category !== planCategory) return false;\n                if (!p.provider_id) return true;\n                const selected = providers.find((x) => x.id === selectedOperatorCode || x.name.toLowerCase() === (allOperators.find((o) => o.code === selectedOperatorCode)?.name || "").toLowerCase());\n                return !!selected && p.provider_id === selected.id;\n              }).map((plan) => {`,
  ],
  [
    `inst.type === "cash" ? "💵" : inst.type === "bank" ? "🏦" : inst.type === "upi" ? "📱" : "👛"`,
    `inst.type === "cash" ? "💵" : inst.type === "bank" ? "🏦" : inst.type === "upi" ? "📱" : inst.type === "credit_card" ? "💳" : "👛"`,
  ],
  [
    `method: selectedFundingAccount.type === "cash" ? "cash" : selectedFundingAccount.type === "bank" ? "bank" : "upi",`,
    `method: selectedFundingAccount.type === "cash" ? "cash" : selectedFundingAccount.type === "bank" ? "bank" : selectedFundingAccount.type === "credit_card" ? "credit_card" : selectedFundingAccount.type === "wallet" ? "wallet" : "upi",`,
  ],
]);

apply("components/business/utility-bill-workspace.tsx", [
  [
    `  // Valid Funding Instruments (Active Cash, Bank, UPI, Wallet)\n  const validFundingInstruments = useMemo(() => {\n    return instruments.filter(\n      (i) => i.is_active && ["cash", "bank", "upi", "wallet", "dmt_portal", "aeps_portal"].includes(i.type)\n    );\n  }, [instruments]);`,
    `  // Valid Funding Instruments. Credit cards are supported as a real biller funding source.\n  const validFundingInstruments = useMemo(() => {\n    return instruments.filter(\n      (i) => i.is_active && ["cash", "bank", "upi", "wallet", "dmt_portal", "aeps_portal", "credit_card"].includes(i.type)\n    );\n  }, [instruments]);`,
  ],
  [
    `inst.type === "cash" ? "💵" : inst.type === "bank" ? "🏦" : inst.type === "upi" ? "📱" : "👛"`,
    `inst.type === "cash" ? "💵" : inst.type === "bank" ? "🏦" : inst.type === "upi" ? "📱" : inst.type === "credit_card" ? "💳" : "👛"`,
  ],
  [
    `method: selectedFundingAccount.type === "cash" ? "cash" : selectedFundingAccount.type === "bank" ? "bank" : "upi",`,
    `method: selectedFundingAccount.type === "cash" ? "cash" : selectedFundingAccount.type === "bank" ? "bank" : selectedFundingAccount.type === "credit_card" ? "credit_card" : selectedFundingAccount.type === "wallet" ? "wallet" : "upi",`,
  ],
]);
