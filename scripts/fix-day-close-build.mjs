import fs from "node:fs";

const file = "components/finance/day-close-client.tsx";
let s = fs.readFileSync(file, "utf8");

const oldTotals = `  const totals = useMemo(() => {
    if (!openClose) return null;
    const rows = Array.isArray(openClose.rows) ? openClose.rows : [];
    const opening = rows.reduce((s, r) => s + Number(r.opening || 0), 0);
    const computed = rows.reduce((s, r) => s + Number(r.computed || 0), 0);
    const adjustments = rows.reduce((s, r) => s + Number(r.adjustment || 0), 0);
    const final = rows.reduce((s, r) => s + Number(r.final || 0), 0);
    return { opening, computed, adjustments, final };
  }, [openClose]);`;

const newTotals = `  // Credit-card limit is a financing facility, not operational liquidity.
  // Keep it in the account table, but exclude it from actual-funds totals.
  const LIQUID_POOLS = new Set(["cash", "bank", "wallet", "dmt", "aeps", "upi_qr"]);

  const totals = useMemo(() => {
    if (!openClose) return null;
    const rows = Array.isArray(openClose.rows) ? openClose.rows : [];
    const liquidRows = rows.filter((r) => LIQUID_POOLS.has(r.pool));
    const creditRows = rows.filter((r) => r.pool === "credit_card");
    const sum = (items, key) => items.reduce((total, r) => total + Number(r[key] || 0), 0);
    return {
      opening: sum(liquidRows, "opening"),
      computed: sum(liquidRows, "computed"),
      adjustments: sum(liquidRows, "adjustment"),
      final: sum(liquidRows, "final"),
      creditOpening: sum(creditRows, "opening"),
      creditFinal: sum(creditRows, "final"),
    };
  }, [openClose]);`;

if (s.includes(oldTotals)) s = s.replace(oldTotals, newTotals);

s = s.replace(
  '<td className="px-4 py-2.5">Total</td>',
  '<td className="px-4 py-2.5">Actual Funds Total</td>'
);

const oldFooter = `                  <td className="px-3 py-2.5 text-right text-blue-600 dark:text-blue-400">{inr(totals.final)}</td>\n                  </tr>\n                </tfoot>`;
const newFooter = `                  <td className="px-3 py-2.5 text-right text-blue-600 dark:text-blue-400">{inr(totals.final)}</td>\n                  </tr>\n                  {Math.abs(totals.creditFinal) > 0.005 && (\n                    <tr className="border-t border-slate-100 bg-cyan-50/60 text-xs font-semibold text-slate-600 dark:border-white/10 dark:bg-cyan-500/5 dark:text-slate-300">\n                      <td className="px-4 py-2" colSpan={5}>Credit Facility (excluded from funds total)</td>\n                      <td className="px-3 py-2 text-right text-cyan-700 dark:text-cyan-300">{inr(totals.creditFinal)}</td>\n                    </tr>\n                  )}\n                </tfoot>`;
if (s.includes(oldFooter)) s = s.replace(oldFooter, newFooter);

s = s.replace("Next Day Opening Position", "Next Day Opening Funds");
s = s.replace("Closing balances roll into tomorrow auto", "Liquid closing balances roll into tomorrow auto");

fs.writeFileSync(file, s);
console.log("Day Close build patch applied: credit facility excluded from operational funds totals.");
