import fs from "node:fs";
import path from "node:path";

const file = path.resolve("components/settings/payment-accounts-panel.tsx");
const source = fs.readFileSync(file, "utf8");
const start = source.indexOf("  const refreshLiveBalances = useCallback(async () => {");
if (start < 0) throw new Error("payment-accounts-panel.tsx: refreshLiveBalances start not found");
const endMarker = "  }, [supabase]);\n\n  useEffect(() => {\n    refreshLiveBalances();";
const end = source.indexOf(endMarker, start);
if (end < 0) throw new Error("payment-accounts-panel.tsx: refreshLiveBalances end marker not found");
const replacement = `const refreshLiveBalances = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const [{ data: insts, error: instError }, poolResult, { data: ces, error: cashError }] = await Promise.all([
        supabase.from("payment_instruments").select("*").order("type").order("name"),
        supabase.rpc("get_pool_balances"),
        supabase
          .from("cash_entries")
          .select("id, instrument_id, direction, amount, created_at, description, ref_type, ref_id")
          .not("instrument_id", "is", null)
          .order("created_at", { ascending: true }),
      ]);

      if (instError) throw instError;
      if (cashError) throw cashError;
      if (!insts) return;

      const rows = insts as InstrumentRow[];
      const pool = (poolResult.data ?? {}) as Record<string, { opening: number; movements: number; current: number }>;
      const activeRows = rows.filter((i) => i.is_active);
      const countPerType: Record<string, number> = {};
      for (const i of activeRows) countPerType[i.type] = (countPerType[i.type] ?? 0) + 1;

      // SINGLE SOURCE OF TRUTH:
      // cash_entries are the canonical movement ledger for each instrument and
      // payment_instruments.current_balance is the persisted live balance. Never
      // add transactions or settlements again here; those operations already post
      // their corresponding cash_entries and doing so double-counts money.
      const entriesByInstrument: Record<string, { inflow: number; outflow: number; net: number; entries: any[] }> = {};
      for (const i of rows) entriesByInstrument[i.id] = { inflow: 0, outflow: 0, net: 0, entries: [] };
      for (const e of (ces ?? []) as any[]) {
        if (!e.instrument_id || !entriesByInstrument[e.instrument_id]) continue;
        const amount = Number(e.amount) || 0;
        const signed = e.direction === "out" ? -amount : amount;
        const bucket = entriesByInstrument[e.instrument_id];
        if (signed >= 0) bucket.inflow += signed;
        else bucket.outflow += -signed;
        bucket.net += signed;
        bucket.entries.push({
          id: e.id,
          number: e.ref_type ? String(e.ref_type).replaceAll("_", " ").toUpperCase() : "CASH ENTRY",
          type: e.direction === "out" ? "Outflow" : "Inflow",
          amount: signed,
          date: e.created_at,
          desc: e.description || "Ledger movement",
        });
      }

      const updated = rows.map((i) => {
        // Debit cards are mirrors of their linked bank account, never a second asset.
        if (i.type === "debit_card") {
          const linkedBankId = i.details?.linked_bank_instrument_id ||
            (rows.filter((b) => b.type === "bank" && b.is_active).length === 1
              ? rows.find((b) => b.type === "bank" && b.is_active)?.id
              : null);
          const linkedBank = linkedBankId ? rows.find((b) => b.id === linkedBankId) : null;
          const bankBalance = Number((linkedBank as (InstrumentRow & { current_balance?: number }) | null)?.current_balance ?? linkedBank?.balance ?? 0);
          return { ...i, balance: bankBalance, opening_balance: Number(linkedBank?.opening_balance ?? 0) };
        }

        // Credit cards display AVAILABLE CREDIT, not a cash balance.
        // current_balance is authoritative; used credit is derived from limit - available.
        if (i.type === "credit_card") {
          const limit = Number(i.details?.credit_limit || 0);
          const available = Math.max(0, Number((i as InstrumentRow & { current_balance?: number }).current_balance ?? limit));
          const used = Math.max(0, limit - available);
          return {
            ...i,
            balance: available,
            opening_balance: Number(i.opening_balance ?? 0),
            details: { ...(i.details ?? {}), used_limit: used },
          };
        }

        // All normal liquidity instruments use their persisted current_balance.
        return { ...i, balance: Number((i as InstrumentRow & { current_balance?: number }).current_balance ?? 0) };
      });
      setInstruments(updated);

      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      const reconMap: Record<string, AccountReconDetail> = {};

      for (const inst of updated) {
        const bucket = entriesByInstrument[inst.id] ?? { inflow: 0, outflow: 0, net: 0, entries: [] };
        const current = inst.type === "debit_card"
          ? Number(inst.balance ?? 0)
          : Number((inst as InstrumentRow & { current_balance?: number }).current_balance ?? inst.balance ?? 0);
        const opening = Number(inst.opening_balance ?? 0);
        const isCredit = inst.type === "credit_card";
        const isDebit = inst.type === "debit_card";
        const limit = isCredit ? Number(inst.details?.credit_limit || 0) : undefined;
        const used = isCredit ? Math.max(0, Number(limit) - current) : undefined;
        const expected = isDebit ? current : isCredit ? current : opening + bucket.net;
        const variance = isCredit || isDebit ? 0 : Math.round((expected - current) * 100) / 100;
        const statusVariant = isDebit ? "linked" : isCredit ? "credit_limit" : Math.abs(variance) < 0.01 ? "reconciled" : "variance";
        const statusLabel = isDebit
          ? "Linked to Bank"
          : isCredit
            ? "Credit Facility"
            : Math.abs(variance) < 0.01
              ? "✓ Reconciled"
              : "⚠ Variance " + inr(variance);

        reconMap[inst.id] = {
          id: inst.id,
          accountName: inst.name,
          accountType: inst.type,
          poolKey: POOL_MAP[inst.type] || "cash",
          currentBalance: current,
          openingBalance: opening,
          credits: bucket.inflow,
          debits: bucket.outflow,
          fees: 0,
          settlements: 0,
          otherMovements: bucket.net,
          calculatedBalance: expected,
          canonicalBalance: current,
          variance,
          isReconciled: Math.abs(variance) < 0.01,
          statusLabel,
          statusVariant: statusVariant as AccountReconDetail["statusVariant"],
          isDebitCard: isDebit,
          isCreditCard: isCredit,
          parentBankName: isDebit ? (rows.find((b) => b.id === (inst.details?.linked_bank_instrument_id || ""))?.name || "Parent Bank Account") : undefined,
          parentBankBalance: isDebit ? current : undefined,
          creditLimit: limit,
          usedLimit: used,
          contributingTxns: bucket.entries,
          lastRefreshedAt: timeStr,
        };
      }

      setAccountReconMap(reconMap);
      const firstUpi = updated.find((i) => i.type === "upi");
      if (firstUpi && reconMap[firstUpi.id]) setUpiRecon(reconMap[firstUpi.id]);
    } catch (err) {
      console.error("Payment account reconciliation refresh error:", err);
    } finally {
      setIsRefreshing(false);
    }
  }, [supabase]);`;
const nextBase = source.slice(0, start) + replacement + "\n\n" + source.slice(end + "  }, [supabase]);".length);
if (!nextBase.includes("SINGLE SOURCE OF TRUTH")) throw new Error("payment accounts root patch did not apply");
const staleCreditMetadata = 'details.used_limit = String(openingOutstanding);';
const derivedCreditMetadata = `details.used_limit = String(
        Math.max(
          0,
          fullLimit - (instModal.mode === "edit" && instModal.row?.type === "credit_card"
            ? Number((instModal.row as InstrumentRow & { current_balance?: number })?.balance ?? (instModal.row as InstrumentRow & { current_balance?: number })?.current_balance ?? fullLimit)
            : Math.max(0, fullLimit - openingOutstanding))
        )
      );`;
const next = nextBase.includes(staleCreditMetadata) ? nextBase.replace(staleCreditMetadata, derivedCreditMetadata) : nextBase;
fs.writeFileSync(file, next);
console.log("Patched payment account balance engine: cash_entries + persisted current_balance only.");
