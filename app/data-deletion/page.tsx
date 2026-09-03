import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Data Deletion Instructions",
  description: "Data deletion instructions for Cafe ERP.",
};

export default function DataDeletionPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-6 py-12 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <article className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm dark:border-white/10 dark:bg-slate-900">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">Cafe ERP</p>
        <h1 className="mt-2 text-3xl font-black">Data Deletion Instructions</h1>
        <p className="mt-2 text-sm text-slate-500">Last updated: September 3, 2026</p>
        <section className="mt-8 space-y-5 text-sm leading-7 text-slate-700 dark:text-slate-300">
          <p>You can request deletion of personal information associated with a Cafe ERP account or with an enabled communication integration.</p>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">How to request deletion</h2>
          <ol className="list-decimal space-y-2 pl-6">
            <li>Email <a className="font-semibold text-indigo-600" href="mailto:sarkarcommunication.cafe@gmail.com?subject=Cafe%20ERP%20Data%20Deletion%20Request">sarkarcommunication.cafe@gmail.com</a>.</li>
            <li>Use the subject <strong>“Cafe ERP Data Deletion Request”</strong>.</li>
            <li>Identify the account or business record involved and state whether you want complete account deletion or deletion of specific personal information.</li>
          </ol>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">What happens next</h2>
          <p>We will verify that the request is authorized, identify the relevant data, and delete or anonymize information that we are permitted to remove. Some records may need to be retained where required for legal, security, accounting, fraud-prevention, or other legitimate obligations.</p>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">WhatsApp / Meta data</h2>
          <p>If your request concerns a WhatsApp integration, include the affected business phone number and account details. Cafe ERP will process the request for data under its control; data independently retained by Meta or another provider may require a separate request to that provider.</p>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Contact</h2>
          <p>Sarkar Communication · <a className="font-semibold text-indigo-600" href="mailto:sarkarcommunication.cafe@gmail.com">sarkarcommunication.cafe@gmail.com</a></p>
          <p><a className="font-semibold text-indigo-600" href="/privacy">Privacy Policy</a> · <a className="font-semibold text-indigo-600" href="/terms">Terms of Service</a></p>
        </section>
      </article>
    </main>
  );
}
