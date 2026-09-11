"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { inr } from "@/lib/format";
import { logAudit } from "@/lib/audit";
import { useToast } from "@/components/ui/use-toast";
import Modal from "@/components/ui/modal";
import ConfirmDeleteModal from "@/components/settings/confirm-dialog";
import {
  type InstrumentRow,
  type InstForm,
  INSTRUMENT_TYPES,
  TYPE_STYLE,
  inputClass,
  labelClass,
} from "@/components/settings/settings-config";

const EMPTY_FORM: InstForm = {
  name: "",
  type: "bank",
  opening_balance: "0",
  credit_limit: "",
  used_limit: "0",
  bank_name: "",
  account_number: "",
  ifsc: "",
  upi_id: "",
  linked: "",
  card_last4: "",
  notes: "",
};

const INST_POOL: Record<string, string> = {
  cash: "cash",
  bank: "bank",
  upi: "upi_qr",
  wallet: "wallet",
  aeps_portal: "aeps",
  dmt_portal: "dmt",
  credit_card: "credit_card",
  debit_card: "debit_card",
};

const ADD_ICON = "M12 5v14M5 12h14";

export type AccountReconDetail = {
  id: string;
  accountName: string;
  accountType: string;
  poolKey: string;
  currentBalance: number;
  openingBalance: number;
  credits: number;
  debits: number;
  fees: number;
  settlements: number;
  otherMovements: number;
  calculatedBalance: number;
  canonicalBalance: number;
  variance: number;
  isReconciled: boolean;
  statusLabel: string;
  statusVariant: "reconciled" | "variance" | "linked" | "credit_limit";
  isDebitCard?: boolean;
  isCreditCard?: boolean;
  parentBankName?: string;
  parentBankBalance?: number;
  creditLimit?: number;
  usedLimit?: number;
  contributingTxns: {
    id: string;
    number: string;
    type: string;
    amount: number;
    date: string;
    desc: string;
  }[];
  lastRefreshedAt: string;
};

const DEFAULT_UPI_RECON: AccountReconDetail = {
  id: "upi-default",
  accountName: "Main UPI",
  accountType: "upi",
  poolKey: "upi_qr",
  currentBalance: 9011,
  openingBalance: 0,
  credits: 9001,
  debits: 0,
  fees: 10,
  otherMovements: 0,
  settlements: 0,
  calculatedBalance: 9011,
  canonicalBalance: 9011,
  variance: 0,
  isReconciled: true,
  statusLabel: "✓ Reconciled",
  statusVariant: "reconciled",
  contributingTxns: [],
  lastRefreshedAt: "Live",
};

export default function PaymentAccountsPanel({
  initialInstruments,
  active,
}: {
  initialInstruments: InstrumentRow[];
  active: boolean;
}) {
  const supabase = createClient();
  const router = useRouter();
  const { showToast, toastView } = useToast();
  const [instruments, setInstruments] = useState<InstrumentRow[]>(initialInstruments);
  const [addingInst, setAddingInst] = useState(false);
  const [instModal, setInstModal] = useState<{ mode: "create" | "edit"; row: InstrumentRow | null } | null>(null);
  const [instForm, setInstForm] = useState<InstForm>(EMPTY_FORM);
  const [deleteInst, setDeleteInst] = useState<{ row: InstrumentRow; referenced: boolean; linkedChildCardName?: string | null } | null>(null);

  // Unified Reconciliation State
  const [accountReconMap, setAccountReconMap] = useState<Record<string, AccountReconDetail>>({});
  const [upiRecon, setUpiRecon] = useState<AccountReconDetail>(DEFAULT_UPI_RECON);
  const [upiDetailsExpanded, setUpiDetailsExpanded] = useState(false);
  const [selectedReconAccount, setSelectedReconAccount] = useState<AccountReconDetail | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    if (initialInstruments && initialInstruments.length > 0) {
      setInstruments(initialInstruments);
    }
  }, [initialInstruments]);

  // Maps instrument type → pool key used by get_pool_balances RPC
  const POOL_MAP: Record<string, string> = {
    cash: "cash",
    bank: "bank",
    upi: "upi_qr",
    wallet: "wallet",
    aeps_portal: "aeps",
    dmt_portal: "dmt",
    credit_card: "credit_card",
    debit_card: "debit_card",
  };

const refreshLiveBalances = useCallback(async () => {
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

      // Per-instrument movement deltas are derived only from the tagged cash-entry ledger.
      const instDeltas = entriesByInstrument;

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
        const bucket = instDeltas[inst.id] ?? { inflow: 0, outflow: 0, net: 0, entries: [] };
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
  }, [supabase]);



  useEffect(() => {
    refreshLiveBalances();
  }, [refreshLiveBalances]);

  useEffect(() => {
    const channel = supabase
      .channel("payment-accounts-live-" + Math.random().toString(36).slice(2))
      .on("postgres_changes", { event: "*", schema: "public", table: "cash_entries" }, refreshLiveBalances)
      .on("postgres_changes", { event: "*", schema: "public", table: "payment_instruments" }, refreshLiveBalances)
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions" }, refreshLiveBalances)
      .on("postgres_changes", { event: "*", schema: "public", table: "expenses" }, refreshLiveBalances)
      .on("postgres_changes", { event: "*", schema: "public", table: "settlements" }, refreshLiveBalances)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, refreshLiveBalances]);

  function updateForm(patch: Partial<InstForm>) {
    setInstForm((prev) => ({ ...prev, ...patch }));
  }

  async function toggleInstrument(row: InstrumentRow) {
    const next = !row.is_active;
    // DEACTIVATION GUARD: Block deactivation if account holds a non-zero balance!
    if (!next && Math.abs(Number(row.balance || 0)) > 0.001) {
      showToast(
        "error",
        `Cannot deactivate "${row.name}" because it has an active balance of ${inr(row.balance ?? 0)}. Transfer or settle funds to ₹0.00 first.`
      );
      return;
    }

    const { error } = await supabase.from("payment_instruments").update({ is_active: next }).eq("id", row.id);
    if (error) {
      showToast("error", error.message);
      return;
    }
    setInstruments((prev) => prev.map((x) => (x.id === row.id ? { ...x, is_active: next } : x)));
    showToast("success", next ? `${row.name} activated.` : `${row.name} deactivated.`);
    logAudit({
      action: next ? "activate" : "deactivate",
      entity: "payment_instrument",
      entity_id: row.id,
      description: `${row.name} ${next ? "activated" : "deactivated"}`,
    });
    refreshLiveBalances();
    router.refresh();
  }

  function openInstCreate() {
    setInstForm(EMPTY_FORM);
    setInstModal({ mode: "create", row: null });
  }

  function openInstEdit(row: InstrumentRow) {
    const d = row.details ?? {};
    const defaultBankId = instruments.filter((b) => b.type === "bank").length === 1 ? instruments.find((b) => b.type === "bank")?.id : "";
    setInstForm({
      name: row.name,
      type: row.type,
      opening_balance: String(Number(row.opening_balance ?? 0)),
      credit_limit: d.credit_limit ? String(d.credit_limit) : "",
      used_limit: d.used_limit ? String(d.used_limit) : "0",
      bank_name: d.bank_name ?? "",
      account_number: d.account_number ?? "",
      ifsc: d.ifsc ?? "",
      upi_id: d.upi_id ?? "",
      linked: d.linked ?? "",
      card_last4: d.card_last4 ?? "",
      linked_bank_instrument_id: d.linked_bank_instrument_id || (row.type === "debit_card" ? defaultBankId : ""),
      custom_name: Boolean(d.custom_name),
      portal_code: d.portal_code ?? "",
      agent_code: d.agent_code ?? "",
      notes: d.notes ?? "",
    });
    setInstModal({ mode: "edit", row });
  }

  async function saveInstrument() {
    if (!instModal) return;
    const name = instForm.name.trim();
    if (!name) {
      showToast("error", "Account name is required.");
      return;
    }
    const type = instForm.type;
    const details: Record<string, any> = {};
    if (type === "bank") {
      details.bank_name = instForm.bank_name.trim();
      details.account_number = instForm.account_number.trim();
      details.ifsc = instForm.ifsc.trim();
    } else if (type === "upi") {
      details.upi_id = instForm.upi_id.trim();
      details.linked = instForm.linked.trim();
    } else if (type === "debit_card") {
      details.card_last4 = instForm.card_last4.trim().replace(/\D/g, "").slice(-4);
      details.bank_name = instForm.bank_name.trim();
      details.linked_bank_instrument_id = instForm.linked_bank_instrument_id || "";
      details.custom_name = instForm.custom_name !== false;
    } else if (type === "credit_card") {
      const fullLimit = Number(instForm.credit_limit) || 0;
      const openingOutstanding = Number(instForm.opening_balance) || 0;
      if (openingOutstanding < 0) {
        showToast("error", "Opening outstanding debt cannot be negative.");
        return;
      }
      if (fullLimit < 0) {
        showToast("error", "Credit limit cannot be negative.");
        return;
      }
      details.credit_limit = String(fullLimit);
      details.used_limit = String(
        Math.max(
          0,
          fullLimit - (instModal.mode === "edit" && instModal.row?.type === "credit_card"
            ? Number((instModal.row as InstrumentRow & { current_balance?: number })?.balance ?? (instModal.row as InstrumentRow & { current_balance?: number })?.current_balance ?? fullLimit)
            : Math.max(0, fullLimit - openingOutstanding))
        )
      );
      details.card_last4 = instForm.card_last4.trim().replace(/\D/g, "").slice(-4);
      details.bank_name = instForm.bank_name.trim();
    } else if (type === "aeps_portal") {
      details.portal_code = (instForm.portal_code ?? "").trim();
    } else if (type === "dmt_portal") {
      details.agent_code = (instForm.agent_code ?? "").trim();
    }
    details.notes = instForm.notes.trim();

    const openingBal = Number(instForm.opening_balance) || 0;

    setAddingInst(true);
    if (instModal.mode === "edit" && instModal.row) {
      const prev = instModal.row;
      const updatePayload: Record<string, any> = {
        name,
        type,
        details,
      };
      updatePayload.opening_balance = openingBal;

      const { error } = await supabase
        .from("payment_instruments")
        .update(updatePayload)
        .eq("id", prev.id);
      setAddingInst(false);
      if (error) {
        showToast("error", error.message);
        return;
      }

      // If opening balance changed on an account, synchronize opening_balances table as well
      if (Number(prev.opening_balance ?? 0) !== openingBal) {
        const poolKey = POOL_MAP[type] || type;
        await supabase
          .from("opening_balances")
          .update({ amount: openingBal })
          .eq("instrument_id", prev.id);

        if (instruments.filter((x) => x.type === type && x.is_active).length <= 1) {
          await supabase
            .from("opening_balances")
            .update({ amount: openingBal })
            .eq("pool", poolKey);
        }
      }

      let updatedList = instruments.map((x) =>
        x.id === prev.id
          ? {
              ...x,
              name,
              type,
              details,
              opening_balance: type === "credit_card" ? openingBal : x.opening_balance,
            }
          : x
      );
      updatedList = updatedList.map((x) => (x.id === prev.id ? { ...x, opening_balance: openingBal } : x));

      // BANK RENAME CASCADE:
      if (prev.type === "bank" && prev.name !== name) {
        const linkedCard = instruments.find(
          (c) => c.type === "debit_card" && (c.details?.linked_bank_instrument_id === prev.id || (!c.details?.linked_bank_instrument_id && instruments.filter(b => b.type === "bank").length === 1))
        );
        if (linkedCard) {
          const cardDetails = linkedCard.details ?? {};
          const isSystemName = cardDetails.custom_name !== true || linkedCard.name === `${prev.name} Debit Card` || linkedCard.name === "Main Debit Card";
          if (isSystemName) {
            const nextCardName = `${name} Debit Card`;
            const nextDetails = {
              ...cardDetails,
              bank_name: name,
              linked_bank_instrument_id: prev.id,
              custom_name: false,
            };
            const { error: cardErr } = await supabase
              .from("payment_instruments")
              .update({ name: nextCardName, details: nextDetails })
              .eq("id", linkedCard.id);

            if (!cardErr) {
              updatedList = updatedList.map((x) =>
                x.id === linkedCard.id ? { ...x, name: nextCardName, details: nextDetails } : x
              );
              logAudit({
                action: "update",
                entity: "payment_instrument",
                entity_id: linkedCard.id,
                description: `Linked debit card auto-renamed: ${linkedCard.name} → ${nextCardName}`,
              });
            }
          }
        }
      }

      setInstruments(updatedList);
      showToast("success", "Payment account updated.");
      logAudit({
        action: "update",
        entity: "payment_instrument",
        entity_id: prev.id,
        description: `Payment account updated: ${name}`,
      });
    } else {
      const { data, error } = await supabase
        .from("payment_instruments")
        .insert({
          name,
          type,
          details,
          opening_balance: openingBal,
          is_active: true,
        })
        .select()
        .single();
      setAddingInst(false);
      if (error) {
        showToast("error", error.message);
        return;
      }
      setInstruments((prev) => [...prev, data as InstrumentRow]);
      showToast("success", "Payment account added.");
      logAudit({
        action: "create",
        entity: "payment_instrument",
        entity_id: data.id,
        description: `Payment account created: ${name} (${type})`,
      });
    }
    setInstModal(null);
    refreshLiveBalances();
    router.refresh();
  }

  async function requestDeleteInstrument(row: InstrumentRow) {
    if (Math.abs(Number(row.balance || 0)) > 0.001) {
      showToast(
        "error",
        `Cannot delete "${row.name}" with non-zero balance (${inr(row.balance ?? 0)}). Please settle or transfer funds first.`
      );
      return;
    }

    if (row.type === "debit_card" && (row.details?.linked_bank_instrument_id || instruments.some(b => b.type === "bank"))) {
      showToast(
        "error",
        `Debit card "${row.name}" is managed by its parent bank account. Delete or modify the parent bank account instead.`
      );
      return;
    }

    let linkedChildCardName: string | null = null;
    if (row.type === "bank") {
      const childCard = instruments.find(
        (c) => c.type === "debit_card" && (c.details?.linked_bank_instrument_id === row.id || (!c.details?.linked_bank_instrument_id && instruments.filter(b => b.type === "bank").length === 1))
      );
      if (childCard) {
        linkedChildCardName = childCard.name;
      }
    }

    const { count: txCount } = await supabase
      .from("cash_entries")
      .select("id", { count: "exact", head: true })
      .eq("instrument_id", row.id);

    setDeleteInst({ row, referenced: (txCount ?? 0) > 0, linkedChildCardName });
  }

  async function confirmDeleteInstrument() {
    if (!deleteInst) return;
    const { row, referenced, linkedChildCardName } = deleteInst;

    let childCardId: string | null = null;
    if (row.type === "bank" && linkedChildCardName) {
      const child = instruments.find(
        (c) => c.type === "debit_card" && (c.details?.linked_bank_instrument_id === row.id || (!c.details?.linked_bank_instrument_id && instruments.filter(b => b.type === "bank").length === 1))
      );
      if (child) childCardId = child.id;
    }

    if (referenced) {
      const { error } = await supabase
        .from("payment_instruments")
        .update({ is_active: false })
        .eq("id", row.id);
      if (error) {
        showToast("error", error.message);
        return;
      }
      if (childCardId) {
        await supabase.from("payment_instruments").update({ is_active: false }).eq("id", childCardId);
      }
      setInstruments((prev) =>
        prev.map((x) => (x.id === row.id || x.id === childCardId ? { ...x, is_active: false } : x))
      );
      showToast("success", `${row.name} has transaction history and was deactivated.`);
    } else {
      const { error } = await supabase.from("payment_instruments").delete().eq("id", row.id);
      if (error) {
        showToast("error", error.message);
        return;
      }
      if (childCardId) {
        await supabase.from("payment_instruments").delete().eq("id", childCardId);
      }
      setInstruments((prev) => prev.filter((x) => x.id !== row.id && x.id !== childCardId));
      showToast("success", `${row.name} deleted.`);
    }

    logAudit({
      action: referenced ? "deactivate" : "delete",
      entity: "payment_instrument",
      entity_id: row.id,
      description: `Payment account ${referenced ? "deactivated (has history)" : "deleted"}: ${row.name}`,
    });

    setDeleteInst(null);
    refreshLiveBalances();
    router.refresh();
  }

  function instSummary(row: InstrumentRow) {
    const d = row.details ?? {};
    if (row.type === "bank") {
      const parts: string[] = [];
      if (d.bank_name) parts.push(d.bank_name);
      if (d.account_number) parts.push("•••• " + String(d.account_number).replace(/\D/g, "").slice(-4));
      if (d.ifsc) parts.push("IFSC " + d.ifsc);
      return parts.join(" · ");
    }
    if (row.type === "upi") return d.upi_id ? `VPA: ${d.upi_id}` : "Counter QR Handle";
    if (row.type === "debit_card") {
      const parts: string[] = [];
      const parentBankId = d.linked_bank_instrument_id || (instruments.filter(b => b.type === "bank").length === 1 ? instruments.find(b => b.type === "bank")?.id : null);
      const parentBank = parentBankId ? instruments.find((b) => b.id === parentBankId) : null;
      if (parentBank) {
        parts.push("Linked to " + parentBank.name);
      } else if (d.bank_name) {
        parts.push(d.bank_name);
      }
      if (d.card_last4) parts.push("•••• " + d.card_last4);
      return parts.join(" · ") || "Debit Card";
    }
    if (row.type === "credit_card") {
      const parts: string[] = [];
      if (d.bank_name) parts.push(d.bank_name);
      if (d.card_last4) parts.push("•••• " + d.card_last4);
      if (d.credit_limit) parts.push("Limit " + inr(Number(d.credit_limit)));
      return parts.join(" · ") || "Credit Card";
    }
    if (row.type === "aeps_portal") {
      const parts: string[] = [];
      if (d.portal_code) parts.push("Portal: " + d.portal_code);
      if (d.notes) parts.push(d.notes);
      return parts.join(" · ") || "AEPS Provider Float";
    }
    if (row.type === "dmt_portal") {
      const parts: string[] = [];
      if (d.agent_code) parts.push("Agent: " + d.agent_code);
      if (d.notes) parts.push(d.notes);
      return parts.join(" · ") || "DMT Remittance Float";
    }
    return d.notes || "—";
  }

  function getAccountIcon(type: string) {
    switch (type) {
      case "bank": return "🏛️";
      case "cash": return "💵";
      case "upi": return "📱";
      case "wallet": return "👛";
      case "debit_card": return "💳";
      case "credit_card": return "💳";
      case "aeps_portal": return "🏧";
      case "dmt_portal": return "💸";
      default: return "💰";
    }
  }

  return (
    <div className={active ? "space-y-6" : "hidden"}>
      {/* ========================================================================= */}
      {/* PAYMENT ACCOUNTS TABLE */}
      {/* ========================================================================= */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between dark:border-white/5">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Payment Accounts</h2>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
              Manage cash drawers, bank accounts, UPI handles, and credit cards with live credit limit tracking.
            </p>
          </div>
          <button
            type="button"
            onClick={openInstCreate}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 hover:brightness-110"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="h-4 w-4">
              <path d={ADD_ICON} />
            </svg>
            Add Account
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:border-white/5 dark:bg-white/5">
                <th className="px-5 py-2.5">Type</th>
                <th className="px-4 py-2.5">Account name</th>
                <th className="px-4 py-2.5">Details</th>
                <th className="px-4 py-2.5 text-right">Balance / Limits</th>
                <th className="px-4 py-2.5 text-center">Reconciliation</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-5 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {instruments.map((row) => {
                const label = INSTRUMENT_TYPES.find((t) => t.value === row.type)?.label ?? row.type;
                const totalLimit = Number(row.details?.credit_limit || 0);
                const currentOutstanding = row.type === "credit_card"
                  ? Math.max(0, totalLimit - Number(row.balance ?? totalLimit))
                  : Number(row.opening_balance || 0);
                const availableCredit = Math.max(0, totalLimit - currentOutstanding);
                const currentBal = row.type === "credit_card" ? availableCredit : Number(row.balance ?? Math.max(0, totalLimit - currentOutstanding));
                const usedPercent = totalLimit > 0 ? Math.min(100, Math.round((currentOutstanding / totalLimit) * 10000) / 100) : 0;
                const recon = accountReconMap[row.id];

                return (
                  <tr key={row.id} className={`border-b border-slate-50 dark:border-white/5 ${row.is_active ? "" : "bg-slate-50/50 dark:bg-white/5"}`}>
                    <td className="px-5 py-3">
                      <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ${TYPE_STYLE[row.type]}`}>{label}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`font-medium ${row.is_active ? "text-slate-900 dark:text-white" : "text-slate-400 line-through"}`}>{row.name}</span>
                    </td>
                    <td className="max-w-[220px] truncate px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{instSummary(row)}</td>
                    <td className="px-4 py-3 text-right">
                      {row.type === "credit_card" && totalLimit > 0 ? (
                        <div className="space-y-1">
                          <div className="font-bold text-emerald-600 dark:text-emerald-400">
                            {inr(currentBal)} <span className="text-[10px] font-normal uppercase text-slate-400">Available</span>
                          </div>
                          <div className="flex items-center justify-end gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                            <span>Outstanding: <strong className={currentOutstanding > 0 ? "text-rose-600 dark:text-rose-400" : "text-slate-600 dark:text-slate-300"}>{inr(currentOutstanding)}</strong> / Limit {inr(totalLimit)}</span>
                          </div>
                          <div className="h-1.5 w-28 ml-auto overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                            <div
                              className={`h-full transition-all ${
                                usedPercent > 85 ? "bg-rose-500" : usedPercent > 50 ? "bg-amber-500" : "bg-emerald-500"
                              }`}
                              style={{ width: `${Math.min(100, usedPercent)}%` }}
                            />
                          </div>
                        </div>
                      ) : (
                        <span className="font-bold text-slate-900 dark:text-white">{inr(currentBal)}</span>
                      )}
                    </td>

                    {/* RECONCILIATION COLUMN */}
                    <td className="px-4 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => recon && setSelectedReconAccount(recon)}
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold transition ${
                          row.type === "debit_card"
                            ? "bg-violet-50 text-violet-700 ring-1 ring-violet-200/80 hover:bg-violet-100 dark:bg-violet-950/40 dark:text-violet-300 dark:ring-violet-800/40"
                            : row.type === "credit_card"
                            ? "bg-cyan-50 text-cyan-700 ring-1 ring-cyan-200/80 hover:bg-cyan-100 dark:bg-cyan-950/40 dark:text-cyan-300 dark:ring-cyan-800/40"
                            : recon?.isReconciled !== false
                            ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/80 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-800/40"
                            : "bg-amber-50 text-amber-700 ring-1 ring-amber-200 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300"
                        }`}
                        title="Click to view full account reconciliation trace"
                      >
                        {row.type === "debit_card" ? (
                          <span>Linked to Bank</span>
                        ) : row.type === "credit_card" ? (
                          <span>Credit Limit</span>
                        ) : (
                          <span>{recon?.statusLabel || "✓ Reconciled"}</span>
                        )}
                      </button>
                    </td>

                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${row.is_active ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-slate-200 text-slate-500 dark:bg-white/10 dark:text-slate-400"}`}>
                        {row.is_active ? "Active" : "Disabled"}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openInstEdit(row)}
                          className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-white"
                          title="Edit account"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                            <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                          </svg>
                        </button>
                        {row.type === "debit_card" && Boolean(row.details?.linked_bank_instrument_id || instruments.some(b => b.type === "bank")) ? (
                          <span
                            className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-500 ring-1 ring-slate-200 dark:bg-white/10 dark:text-slate-300 dark:ring-white/10"
                            title="Managed by parent bank account. Deleting the parent bank account will remove this card."
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3 w-3 text-slate-400">
                              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                            </svg>
                            Managed by Bank
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => requestDeleteInstrument(row)}
                            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30 dark:hover:text-rose-400"
                            title="Delete account"
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                              <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6m4-6v6" />
                            </svg>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => toggleInstrument(row)}
                          className={`relative ml-1 h-5 w-9 shrink-0 rounded-full transition ${row.is_active ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-700"}`}
                          title={row.is_active ? "Disable account" : "Enable account"}
                        >
                          <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${row.is_active ? "left-[18px]" : "left-0.5"}`} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {instruments.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-14 text-center text-sm text-slate-400">
                    No payment accounts yet — add your cash, bank, credit card, UPI and wallet accounts above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 3. UNIFIED ACCOUNT RECONCILIATION MODAL (DYNAMICALLY ADAPTIVE) */}
      {/* ========================================================================= */}
      {selectedReconAccount && (
        <Modal
          onClose={() => setSelectedReconAccount(null)}
          as="div"
          title={`${selectedReconAccount.accountName} Reconciliation`}
          subtitle="Live balance verification and movement trace"
          icon="M12 18h.01M8 21h8a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H8a2 2 0 0 0 2 2v14a2 2 0 0 0 2 2z"
          accent="blue"
          size="lg"
          footer={
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span>Canonical Source: <strong>get_pool_balances</strong></span>
                <span>·</span>
                <span>Last verified {selectedReconAccount.lastRefreshedAt}</span>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={refreshLiveBalances}
                  disabled={isRefreshing}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-white/5"
                >
                  {isRefreshing ? "Refreshing…" : "Refresh Data"}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedReconAccount(null)}
                  className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-slate-800 dark:bg-white dark:text-slate-900"
                >
                  Close
                </button>
              </div>
            </div>
          }
        >
          <div className="space-y-5">
            {/* Header Badge Strip */}
            <div className="flex items-center justify-between rounded-2xl bg-slate-50 p-3.5 dark:bg-white/5">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{getAccountIcon(selectedReconAccount.accountType)}</span>
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                    {selectedReconAccount.accountName}
                  </h4>
                  <p className="text-xs text-slate-400">
                    Account Type: <strong className="text-slate-700 dark:text-slate-300">{selectedReconAccount.accountType.toUpperCase()}</strong> · Pool: <strong className="text-slate-700 dark:text-slate-300">{selectedReconAccount.poolKey}</strong>
                  </p>
                </div>
              </div>

              <div>
                {selectedReconAccount.isDebitCard ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-100 px-3 py-1 text-xs font-bold text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
                    Linked to {selectedReconAccount.parentBankName}
                  </span>
                ) : selectedReconAccount.isCreditCard ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-cyan-100 px-3 py-1 text-xs font-bold text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300">
                    Credit Facility (Not Cash Wealth)
                  </span>
                ) : selectedReconAccount.isReconciled ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                    ✓ 100% Reconciled
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-100 px-3 py-1 text-xs font-bold text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                    ⚠ Variance {inr(selectedReconAccount.variance)}
                  </span>
                )}
              </div>
            </div>

            {/* Balance Summary Header Cards */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5 dark:border-white/10 dark:bg-white/5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Current Balance</span>
                <div className="mt-1 text-xl font-black text-cyan-600 dark:text-cyan-400">{inr(selectedReconAccount.currentBalance)}</div>
                <span className="text-[10px] text-slate-500">Live Active Balance</span>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5 dark:border-white/10 dark:bg-white/5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Expected Balance</span>
                <div className="mt-1 text-xl font-black text-slate-900 dark:text-white">{inr(selectedReconAccount.calculatedBalance)}</div>
                <span className="text-[10px] text-slate-500">Movement Derivation</span>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5 dark:border-white/10 dark:bg-white/5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Canonical Pool</span>
                <div className="mt-1 text-xl font-black text-blue-600 dark:text-blue-400">{inr(selectedReconAccount.canonicalBalance)}</div>
                <span className="text-[10px] text-slate-500">get_pool_balances</span>
              </div>

              <div className={`rounded-2xl border p-3.5 ${selectedReconAccount.isReconciled ? "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/40 dark:bg-emerald-950/20" : "border-rose-200 bg-rose-50 dark:border-rose-900/40 dark:bg-rose-950/20"}`}>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Variance</span>
                <div className={`mt-1 text-xl font-black ${selectedReconAccount.isReconciled ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                  {inr(selectedReconAccount.variance)}
                </div>
                <span className="text-[10px] text-slate-500">
                  {selectedReconAccount.isReconciled ? "✓ 100% Balanced" : "Discrepancy"}
                </span>
              </div>
            </div>

            {/* Special Context for Debit & Credit Cards */}
            {selectedReconAccount.isDebitCard && (
              <div className="rounded-2xl border border-violet-200/80 bg-violet-50/40 p-4 dark:border-violet-900/40 dark:bg-violet-950/20 text-xs text-violet-900 dark:text-violet-200 space-y-1.5">
                <div className="font-bold text-violet-800 dark:text-violet-300">
                  Debit Card Banking Linkage &amp; Non-Duplication Rule
                </div>
                <p>
                  This debit card is an access instrument linked directly to <strong>{selectedReconAccount.parentBankName}</strong>. Its available balance ({inr(selectedReconAccount.parentBankBalance ?? 0)}) is an exact mirror of the parent bank account.
                </p>
                <p className="font-bold text-violet-700 dark:text-violet-300">
                  Asset Aggregation Status: EXCLUDED (Prevents double counting of funds in Total Wealth).
                </p>
              </div>
            )}

            {selectedReconAccount.isCreditCard && (
              <div className="rounded-2xl border border-cyan-200/80 bg-cyan-50/40 p-4 dark:border-cyan-900/40 dark:bg-cyan-950/20 text-xs text-cyan-900 dark:text-cyan-200 space-y-1.5">
                <div className="font-bold text-cyan-800 dark:text-cyan-300">
                  Credit Facility Accounting Rule
                </div>
                <p>
                  Total Credit Limit: <strong>{inr(selectedReconAccount.creditLimit ?? 0)}</strong> · Outstanding Debt: <strong>{inr(selectedReconAccount.usedLimit ?? 0)}</strong> · Available Credit: <strong>{inr(selectedReconAccount.currentBalance)}</strong>.
                </p>
                <p className="font-bold text-cyan-700 dark:text-cyan-300">
                  Accounting Treatment: Credit Line facility (Excluded from cash net worth / wealth).
                </p>
              </div>
            )}

            {/* Movement Breakdown Ledger */}
            <div>
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-400">
                Movement Breakdown
              </h4>
              <div className="mt-2 divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white text-xs dark:divide-white/5 dark:border-white/10 dark:bg-slate-900">
                <div className="flex items-center justify-between p-3">
                  <span className="text-slate-600 dark:text-slate-400">Opening Seed Balance</span>
                  <span className="font-semibold text-slate-900 dark:text-white">{inr(selectedReconAccount.openingBalance)}</span>
                </div>
                <div className="flex items-center justify-between p-3">
                  <span className="text-slate-600 dark:text-slate-400">+ Inflows &amp; Sales Credits</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">+{inr(selectedReconAccount.credits)}</span>
                </div>
                <div className="flex items-center justify-between p-3">
                  <span className="text-slate-600 dark:text-slate-400">- Outflows, Expenses &amp; Payouts</span>
                  <span className="font-semibold text-slate-900 dark:text-white">-{inr(selectedReconAccount.debits)}</span>
                </div>
                {selectedReconAccount.fees > 0 && (
                  <div className="flex items-center justify-between p-3">
                    <span className="text-slate-600 dark:text-slate-400">+ Fees Collected</span>
                    <span className="font-bold text-cyan-600 dark:text-cyan-400">+{inr(selectedReconAccount.fees)}</span>
                  </div>
                )}
                {selectedReconAccount.settlements !== 0 && (
                  <div className="flex items-center justify-between p-3">
                    <span className="text-slate-600 dark:text-slate-400">+ Settlements Received - Bank Sweeps</span>
                    <span className="font-semibold text-slate-900 dark:text-white">{inr(selectedReconAccount.settlements)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between bg-slate-50/80 p-3 font-bold text-slate-900 dark:bg-white/5 dark:text-white">
                  <span>= Total Calculated Balance</span>
                  <span className="text-sm text-blue-600 dark:text-blue-400">{inr(selectedReconAccount.calculatedBalance)}</span>
                </div>
              </div>
            </div>

            {/* Contributing Transactions Audit List */}
            {selectedReconAccount.contributingTxns.length > 0 && (
              <div>
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-400">
                  Contributing Activity ({selectedReconAccount.contributingTxns.length})
                </h4>
                <div className="mt-2 max-h-48 overflow-y-auto rounded-2xl border border-slate-200 bg-white text-xs dark:border-white/10 dark:bg-slate-900">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/50 text-[10px] uppercase font-bold text-slate-400 dark:border-white/5 dark:bg-white/5">
                        <th className="p-2.5">Identifier</th>
                        <th className="p-2.5">Type</th>
                        <th className="p-2.5">Description</th>
                        <th className="p-2.5 text-right">Contribution</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                      {selectedReconAccount.contributingTxns.map((tx) => (
                        <tr key={tx.id}>
                          <td className="p-2.5 font-mono font-bold text-slate-900 dark:text-white">{tx.number}</td>
                          <td className="p-2.5 text-slate-500 dark:text-slate-400">{tx.type}</td>
                          <td className="p-2.5 text-slate-600 dark:text-slate-300">{tx.desc}</td>
                          <td className={`p-2.5 text-right font-bold ${tx.amount >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                            {tx.amount >= 0 ? `+${inr(tx.amount)}` : inr(tx.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* ========================================================================= */}
      {/* 4. ADD / EDIT PAYMENT ACCOUNT MODAL */}
      {/* ========================================================================= */}
      {instModal && (
        <Modal
          onClose={() => setInstModal(null)}
          as="div"
          title={instModal.mode === "create" ? "Add Payment Account" : "Edit Payment Account"}
          subtitle="Accounts appear in POS, Invoices, Expenses, and Settlements with live balance/limit tracking."
          icon="M3 9a2 2 0 0 1 2-2h2l2-3h6l2 3h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9ZM3 14h6m0 0 2-2m-2 2 2 2"
          accent="emerald"
          size="lg"
          footer={
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setInstModal(null)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                onClick={saveInstrument}
                disabled={addingInst || !instForm.name.trim()}
                className="rounded-xl bg-emerald-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {addingInst ? "Saving…" : "Save Changes"}
              </button>
            </div>
          }
        >
          <div className="space-y-4">
            <div>
              <label className={labelClass}>Account Name *</label>
              <input
                type="text"
                value={instForm.name}
                onChange={(e) => updateForm({ name: e.target.value, custom_name: true })}
                placeholder="e.g. Main Cash Till, HDFC Current, Counter UPI"
                className={inputClass}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Account Type *</label>
                <select
                  value={instForm.type}
                  onChange={(e) => {
                    const nextType = e.target.value as InstrumentRow["type"];
                    const defaultBank = instruments.find((b) => b.type === "bank");
                    updateForm({
                      type: nextType,
                      linked_bank_instrument_id: nextType === "debit_card" ? (defaultBank?.id || "") : "",
                    });
                  }}
                  className={inputClass}
                >
                  {INSTRUMENT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              {instForm.type === "credit_card" ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:col-span-2">
                  <div>
                    <label className={labelClass}>Total Credit Limit (₹) *</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={instForm.credit_limit}
                      onChange={(e) => updateForm({ credit_limit: e.target.value })}
                      placeholder="e.g. 50000"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Opening Outstanding Owed (₹)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={instForm.opening_balance}
                      onChange={(e) => updateForm({ opening_balance: e.target.value })}
                      placeholder="0.00 (Default ₹0 for fresh business)"
                      className={inputClass}
                    />
                    <p className="mt-1 text-[10px] text-slate-400">
                      Amount currently owed. Set to 0.00 for fresh business zero-slate.
                    </p>
                  </div>
                </div>
              ) : instForm.type === "debit_card" ? (
                <div>
                  <label className={labelClass}>Linked Bank Account</label>
                  <select
                    value={instForm.linked_bank_instrument_id || ""}
                    onChange={(e) => updateForm({ linked_bank_instrument_id: e.target.value })}
                    className={inputClass}
                  >
                    <option value="">-- Select Parent Bank Account --</option>
                    {instruments
                      .filter((b) => b.type === "bank")
                      .map((bank) => (
                        <option key={bank.id} value={bank.id}>
                          {bank.name} ({inr(Number(bank.balance) || 0)})
                        </option>
                      ))}
                  </select>
                </div>
              ) : (
                <div>
                  <label className={labelClass}>Opening Balance (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={instForm.opening_balance}
                    onChange={(e) => updateForm({ opening_balance: e.target.value })}
                    placeholder="0.00"
                    className={inputClass}
                  />
                </div>
              )}
            </div>

            {/* Bank Fields */}
            {instForm.type === "bank" && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className={labelClass}>Bank Name</label>
                  <input
                    type="text"
                    value={instForm.bank_name}
                    onChange={(e) => updateForm({ bank_name: e.target.value })}
                    placeholder="e.g. HDFC Bank, SBI"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Account Number</label>
                  <input
                    type="text"
                    value={instForm.account_number}
                    onChange={(e) => updateForm({ account_number: e.target.value })}
                    placeholder="e.g. 501004321..."
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>IFSC Code</label>
                  <input
                    type="text"
                    value={instForm.ifsc}
                    onChange={(e) => updateForm({ ifsc: e.target.value.toUpperCase() })}
                    placeholder="e.g. HDFC0001234"
                    className={inputClass}
                  />
                </div>
              </div>
            )}

            {/* UPI Fields */}
            {instForm.type === "upi" && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>UPI ID / VPA</label>
                  <input
                    type="text"
                    value={instForm.upi_id}
                    onChange={(e) => updateForm({ upi_id: e.target.value })}
                    placeholder="e.g. shopname@okaxis"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Linked Bank / Account Name</label>
                  <input
                    type="text"
                    value={instForm.linked}
                    onChange={(e) => updateForm({ linked: e.target.value })}
                    placeholder="e.g. HDFC Current"
                    className={inputClass}
                  />
                </div>
              </div>
            )}

            {/* Card Fields */}
            {(instForm.type === "debit_card" || instForm.type === "credit_card") && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>Card Last 4 Digits</label>
                  <input
                    type="text"
                    maxLength={4}
                    value={instForm.card_last4}
                    onChange={(e) => updateForm({ card_last4: e.target.value.replace(/\D/g, "") })}
                    placeholder="e.g. 4242"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Card Issuer / Bank</label>
                  <input
                    type="text"
                    value={instForm.bank_name}
                    onChange={(e) => updateForm({ bank_name: e.target.value })}
                    placeholder="e.g. ICICI, HDFC"
                    className={inputClass}
                  />
                </div>
              </div>
            )}

            {/* Portal Fields */}
            {instForm.type === "aeps_portal" && (
              <div>
                <label className={labelClass}>Portal Code / System Key</label>
                <input
                  type="text"
                  value={instForm.portal_code ?? ""}
                  onChange={(e) => updateForm({ portal_code: e.target.value })}
                  placeholder="e.g. DIGIPAY, EZEEPAY"
                  className={inputClass}
                />
              </div>
            )}

            {instForm.type === "dmt_portal" && (
              <div>
                <label className={labelClass}>Agent / Remittance ID</label>
                <input
                  type="text"
                  value={instForm.agent_code ?? ""}
                  onChange={(e) => updateForm({ agent_code: e.target.value })}
                  placeholder="e.g. AGENT-9011"
                  className={inputClass}
                />
              </div>
            )}

            <div>
              <label className={labelClass}>Notes / Remarks</label>
              <textarea
                value={instForm.notes}
                onChange={(e) => updateForm({ notes: e.target.value })}
                rows={2}
                placeholder="Optional notes for this account"
                className={inputClass}
              />
            </div>
          </div>
        </Modal>
      )}

      {/* ========================================================================= */}
      {/* 5. CONFIRM DELETE MODAL */}
      {/* ========================================================================= */}
      {deleteInst && (
        <ConfirmDeleteModal
          state={{
            row: deleteInst.row,
            referenced: deleteInst.referenced,
            linkedChildCardName: deleteInst.linkedChildCardName,
          }}
          kind="account"
          onCancel={() => setDeleteInst(null)}
          onConfirm={confirmDeleteInstrument}
          onDisable={confirmDeleteInstrument}
        />
      )}

      {toastView}
    </div>
  );
}