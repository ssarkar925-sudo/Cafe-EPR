"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { inr } from "@/lib/format";
import Modal from "@/components/ui/modal";

export type Supplier = {
  id: string;
  code: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state_code: string | null;
  gstin: string | null;
  payment_terms: string;
  opening_balance: number;
  current_balance: number;
  is_active: boolean;
  notes: string | null;
  created_at: string;
};

export type SupplierLedgerEntry = {
  id: string;
  supplier_id: string;
  entry_date: string;
  type: "purchase" | "payment" | "return" | "adjustment" | "opening";
  description: string;
  debit: number;
  credit: number;
  balance_after: number;
  ref_type: string | null;
  ref_id: string | null;
  created_at: string;
};

export default function SuppliersClient() {
  const supabase = useMemo(() => createClient(), []);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [ledgerOpen, setLedgerOpen] = useState<Supplier | null>(null);
  const [ledgerEntries, setLedgerEntries] = useState<SupplierLedgerEntry[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  // Form State
  const [name, setName] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [stateCode, setStateCode] = useState("");
  const [gstin, setGstin] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("immediate");
  const [openingBalance, setOpeningBalance] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSuppliers();
  }, []);

  async function loadSuppliers() {
    setLoading(true);
    const { data, error } = await supabase
      .from("suppliers")
      .select("*")
      .order("created_at", { ascending: false });
    if (!error && data) {
      setSuppliers(data as Supplier[]);
    }
    setLoading(false);
  }

  async function openLedger(sup: Supplier) {
    setLedgerOpen(sup);
    setLedgerLoading(true);
    const { data } = await supabase
      .from("supplier_ledger")
      .select("*")
      .eq("supplier_id", sup.id)
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false });
    setLedgerEntries((data as SupplierLedgerEntry[]) || []);
    setLedgerLoading(false);
  }

  function resetForm() {
    setName("");
    setContactPerson("");
    setPhone("");
    setEmail("");
    setAddress("");
    setCity("");
    setStateCode("");
    setGstin("");
    setPaymentTerms("immediate");
    setOpeningBalance("");
    setNotes("");
  }

  async function handleCreateSupplier(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      alert("Supplier name is required");
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc("create_supplier", {
        p_name: name.trim(),
        p_contact_person: contactPerson.trim() || null,
        p_phone: phone.trim() || null,
        p_email: email.trim() || null,
        p_address: address.trim() || null,
        p_city: city.trim() || null,
        p_state_code: stateCode.trim() || null,
        p_gstin: gstin.trim() || null,
        p_payment_terms: paymentTerms,
        p_opening_balance: Number(openingBalance) || 0,
        p_notes: notes.trim() || null,
      });

      if (error) {
        alert("Error creating supplier: " + error.message);
      } else {
        setModalOpen(false);
        resetForm();
        loadSuppliers();
      }
    } catch (err: any) {
      alert("Error: " + err.message);
    } finally {
      setSaving(false);
    }
  }

  const filtered = suppliers.filter((s) => {
    const q = search.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      s.code.toLowerCase().includes(q) ||
      (s.phone && s.phone.includes(q)) ||
      (s.gstin && s.gstin.toLowerCase().includes(q))
    );
  });

  const totalPayable = suppliers.reduce((acc, s) => acc + Number(s.current_balance || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Suppliers & Vendors
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Manage vendor profiles, commercial terms, and Accounts Payable ledger
          </p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setModalOpen(true);
          }}
          className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add Supplier
        </button>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-white/10 dark:bg-slate-900">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Total Suppliers
          </div>
          <div className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">
            {suppliers.length}
          </div>
          <div className="mt-1 text-xs text-slate-400">Active Trade Partners</div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-white/10 dark:bg-slate-900">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Total Accounts Payable (Due)
          </div>
          <div className="mt-2 text-3xl font-bold text-rose-600 dark:text-rose-400">
            {inr(totalPayable)}
          </div>
          <div className="mt-1 text-xs text-slate-400">Current Outstanding Dues</div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-white/10 dark:bg-slate-900">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Accounting Integrity
          </div>
          <div className="mt-2 flex items-center gap-2 text-lg font-bold text-emerald-600 dark:text-emerald-400">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
            Audit Ledger Synced
          </div>
          <div className="mt-1 text-xs text-slate-400">Canonical Ledger Source of Truth</div>
        </div>
      </div>

      {/* Search & List */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-white/10 dark:bg-slate-900">
        <div className="mb-4">
          <input
            type="text"
            placeholder="Search suppliers by name, code, phone, or GSTIN..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-transparent px-4 py-2.5 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-white/10 dark:text-white"
          />
        </div>

        {loading ? (
          <div className="py-12 text-center text-sm text-slate-400">Loading suppliers...</div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-400">No suppliers found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:border-white/10 dark:text-slate-400">
                <tr>
                  <th className="py-3 px-4">Code / Name</th>
                  <th className="py-3 px-4">Contact</th>
                  <th className="py-3 px-4">GSTIN / State</th>
                  <th className="py-3 px-4">Terms</th>
                  <th className="py-3 px-4 text-right">Payable Balance</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {filtered.map((sup) => (
                  <tr key={sup.id} className="hover:bg-slate-50/50 dark:hover:bg-white/5">
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-900 dark:text-white">{sup.name}</div>
                      <div className="text-xs font-mono text-indigo-600 dark:text-indigo-400">{sup.code}</div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="text-slate-900 dark:text-slate-200">{sup.contact_person || "—"}</div>
                      <div className="text-xs text-slate-500">{sup.phone || sup.email || "No contact info"}</div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-mono text-xs text-slate-700 dark:text-slate-300">
                        {sup.gstin || "Unregistered"}
                      </div>
                      <div className="text-xs text-slate-400">
                        {sup.state_code ? `State: ${sup.state_code}` : "State: Unspecified"}
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700 dark:bg-white/10 dark:text-slate-300">
                        {sup.payment_terms}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className={`font-bold ${Number(sup.current_balance) > 0 ? "text-rose-600 dark:text-rose-400" : "text-slate-700 dark:text-slate-300"}`}>
                        {inr(sup.current_balance)}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={() => openLedger(sup)}
                        className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-indigo-50 hover:text-indigo-600 dark:bg-white/10 dark:text-slate-300 dark:hover:bg-indigo-900/30 dark:hover:text-indigo-400"
                      >
                        View Ledger
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Supplier Modal */}
      {modalOpen && (
        <Modal
          as="form"
          onSubmit={handleCreateSupplier}
          onClose={() => setModalOpen(false)}
          title="Add New Supplier"
          subtitle="Create vendor master with payment terms and optional opening balance"
          icon="M16 11V7a4 4 0 0 0-8 0v4M5 9h14l1 12H4L5 9z"
          accent="indigo"
          size="lg"
          footer={
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save Supplier"}
              </button>
            </div>
          }
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Supplier / Business Name *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Acme Wholesale Supplies"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm outline-none focus:border-indigo-500 dark:border-white/10 dark:bg-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Contact Person
              </label>
              <input
                type="text"
                placeholder="e.g. Rajesh Sharma"
                value={contactPerson}
                onChange={(e) => setContactPerson(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm outline-none focus:border-indigo-500 dark:border-white/10 dark:bg-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Phone Number
              </label>
              <input
                type="text"
                placeholder="10-digit mobile number"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm outline-none focus:border-indigo-500 dark:border-white/10 dark:bg-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Email Address
              </label>
              <input
                type="email"
                placeholder="vendor@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm outline-none focus:border-indigo-500 dark:border-white/10 dark:bg-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                GSTIN (Optional)
              </label>
              <input
                type="text"
                placeholder="15-digit GSTIN (nullable)"
                value={gstin}
                onChange={(e) => setGstin(e.target.value.toUpperCase())}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm outline-none focus:border-indigo-500 dark:border-white/10 dark:bg-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                State Code (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. 19 for WB, 27 for MH (default: null)"
                value={stateCode}
                onChange={(e) => setStateCode(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm outline-none focus:border-indigo-500 dark:border-white/10 dark:bg-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Payment Terms
              </label>
              <select
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm outline-none focus:border-indigo-500 dark:border-white/10 dark:bg-slate-900 dark:text-white"
              >
                <option value="immediate">Immediate / COD</option>
                <option value="net_7">Net 7 Days</option>
                <option value="net_15">Net 15 Days</option>
                <option value="net_30">Net 30 Days</option>
                <option value="credit">Open Credit</option>
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Opening Payable Balance (₹)
              </label>
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={openingBalance}
                onChange={(e) => setOpeningBalance(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm outline-none focus:border-indigo-500 dark:border-white/10 dark:bg-slate-900 dark:text-white"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Address & City
              </label>
              <input
                type="text"
                placeholder="Street address and city"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm outline-none focus:border-indigo-500 dark:border-white/10 dark:bg-slate-900 dark:text-white"
              />
            </div>
          </div>
        </Modal>
      )}

      {/* Supplier Ledger Modal */}
      {ledgerOpen && (
        <Modal
          as="div"
          onClose={() => setLedgerOpen(null)}
          title={`Supplier Ledger: ${ledgerOpen.name}`}
          subtitle={`Code: ${ledgerOpen.code} • Current Outstanding Payable: ${inr(ledgerOpen.current_balance)}`}
          icon="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"
          accent="indigo"
          size="xl"
          footer={
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setLedgerOpen(null)}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300"
              >
                Close
              </button>
            </div>
          }
        >
          {ledgerLoading ? (
            <div className="py-12 text-center text-sm text-slate-400">Loading ledger statement...</div>
          ) : ledgerEntries.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-400">No ledger transactions found.</div>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-slate-50 text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                  <tr className="border-b border-slate-200 dark:border-white/10">
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Type</th>
                    <th className="py-2.5 px-3">Description</th>
                    <th className="py-2.5 px-3 text-right">Credit (Bill)</th>
                    <th className="py-2.5 px-3 text-right">Debit (Paid/Ret)</th>
                    <th className="py-2.5 px-3 text-right">Balance After</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                  {ledgerEntries.map((e) => (
                    <tr key={e.id} className="hover:bg-slate-50/50 dark:hover:bg-white/5">
                      <td className="py-2.5 px-3 whitespace-nowrap text-slate-600 dark:text-slate-400">
                        {e.entry_date}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="inline-flex uppercase font-semibold text-[10px] tracking-wider rounded-md bg-slate-100 px-2 py-0.5 text-slate-700 dark:bg-white/10 dark:text-slate-300">
                          {e.type}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-900 dark:text-white font-medium">
                        {e.description}
                      </td>
                      <td className="py-2.5 px-3 text-right font-medium text-slate-900 dark:text-white">
                        {Number(e.credit) > 0 ? inr(e.credit) : "—"}
                      </td>
                      <td className="py-2.5 px-3 text-right font-medium text-emerald-600 dark:text-emerald-400">
                        {Number(e.debit) > 0 ? inr(e.debit) : "—"}
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-rose-600 dark:text-rose-400">
                        {inr(e.balance_after)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

