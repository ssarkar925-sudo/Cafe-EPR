"use client";

/**
 * CoA head editor + instrument→account mapping forms (client islands).
 * Mutations use only mg_coa_head_update (rename/activate; code and type are
 * structural and never touched) and set_instrument_account. Server state is
 * authoritative: the page re-renders from the database after each change.
 */

import { useState } from "react";
import Modal from "@/components/ui/modal";
import { useV1Mutation, V1Confirm, V1Field, v1InputClass } from "@/components/v1/v1-mutation";

export interface CoaHead {
  id: string;
  code: string;
  name: string;
  account_type: string;
  is_active: boolean;
}

export interface CoaOption {
  id: string;
  code: string;
  name: string;
}

export function CoaEditButton({ head }: { head: CoaHead }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(head.name);
  const [formError, setFormError] = useState<string | null>(null);
  const mutation = useV1Mutation();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setFormError("Name is required.");
      return;
    }
    setFormError(null);
    const result = await mutation.run("mg_coa_head_update", {
      p_id: head.id,
      p_name: trimmed,
      p_is_active: head.is_active,
    });
    if (result !== null) setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setName(head.name);
          setFormError(null);
          mutation.reset();
          setOpen(true);
        }}
        className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
      >
        Rename
      </button>
      {open && (
        <Modal
          as="form"
          onSubmit={submit}
          size="sm"
          accent="blue"
          title={`Rename ${head.code}`}
          subtitle="Code and account type are structural and cannot change here."
          onClose={() => setOpen(false)}
          footer={
            <div className="flex w-full gap-2.5">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={mutation.pending}
                className="flex-1 rounded-xl bg-slate-900 px-3 py-2.5 text-xs font-bold text-white transition hover:bg-slate-700 disabled:opacity-50 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
              >
                {mutation.pending ? "Saving…" : "Save"}
              </button>
            </div>
          }
        >
          <div className="space-y-3 py-2">
            <V1Field label="Head name" htmlFor={`coa-name-${head.id}`}>
              <input
                id={`coa-name-${head.id}`}
                className={v1InputClass}
                value={name}
                maxLength={120}
                onChange={(e) => setName(e.target.value)}
                disabled={mutation.pending}
              />
            </V1Field>
            {(formError || mutation.error) && (
              <p role="alert" className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                {formError ?? mutation.error}
              </p>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}

export function CoaActiveToggle({ head }: { head: CoaHead }) {
  const mutation = useV1Mutation();
  return (
    <V1Confirm
      label={head.is_active ? "Deactivate" : "Activate"}
      title={`${head.is_active ? "Deactivate" : "Activate"} ${head.code}`}
      body={`Head “${head.name}” will be marked ${head.is_active ? "inactive" : "active"}. Postings referencing it are validated server-side.`}
      confirmLabel={head.is_active ? "Deactivate" : "Activate"}
      onConfirm={() =>
        mutation.run("mg_coa_head_update", {
          p_id: head.id,
          p_name: head.name,
          p_is_active: !head.is_active,
        })
      }
      disabled={mutation.pending}
    />
  );
}

export function InstrumentMapForm({
  instrumentId,
  instrumentName,
  currentCode,
  accounts,
}: {
  instrumentId: string;
  instrumentName: string;
  currentCode: string | null;
  accounts: CoaOption[];
}) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState(currentCode ?? "");
  const [formError, setFormError] = useState<string | null>(null);
  const mutation = useV1Mutation();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!code) {
      setFormError("Select an account.");
      return;
    }
    setFormError(null);
    const result = await mutation.run("set_instrument_account", {
      p_instrument_id: instrumentId,
      p_account_code: code,
    });
    if (result !== null) setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setCode(currentCode ?? "");
          setFormError(null);
          mutation.reset();
          setOpen(true);
        }}
        className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
      >
        {currentCode ? "Remap" : "Map"}
      </button>
      {open && (
        <Modal
          as="form"
          onSubmit={submit}
          size="sm"
          accent="blue"
          title={`Map ${instrumentName}`}
          subtitle="Explicit instrument→account configuration used by the posting engine."
          onClose={() => setOpen(false)}
          footer={
            <div className="flex w-full gap-2.5">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={mutation.pending}
                className="flex-1 rounded-xl bg-slate-900 px-3 py-2.5 text-xs font-bold text-white transition hover:bg-slate-700 disabled:opacity-50 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
              >
                {mutation.pending ? "Saving…" : "Save mapping"}
              </button>
            </div>
          }
        >
          <div className="space-y-3 py-2">
            <V1Field label="Account" htmlFor={`map-acct-${instrumentId}`}>
              <select
                id={`map-acct-${instrumentId}`}
                className={v1InputClass}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                disabled={mutation.pending}
              >
                <option value="">Select…</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.code}>
                    {a.code} — {a.name}
                  </option>
                ))}
              </select>
            </V1Field>
            {(formError || mutation.error) && (
              <p role="alert" className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                {formError ?? mutation.error}
              </p>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
