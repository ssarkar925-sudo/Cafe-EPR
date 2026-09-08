import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Privacy Policy for Cafe ERP by Sarkar Communication.",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-6 py-12 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <article className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm dark:border-white/10 dark:bg-slate-900">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">Cafe ERP</p>
        <h1 className="mt-2 text-3xl font-black">Privacy Policy</h1>
        <p className="mt-2 text-sm text-slate-500">Last updated: September 3, 2026</p>

        <section className="mt-8 space-y-5 text-sm leading-7 text-slate-700 dark:text-slate-300">
          <p>Cafe ERP is an operations platform provided by Sarkar Communication for cyber-cafe, retail, billing, inventory, business-services, and communication workflows.</p>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Information we process</h2>
          <p>Depending on the features used, Cafe ERP may process account information, business records, customer and invoice information, inventory and transaction records, and communications required to provide enabled services.</p>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">WhatsApp and Meta data</h2>
          <p>When WhatsApp Cloud API features are enabled, Cafe ERP processes WhatsApp Business Account identifiers, phone-number identifiers, message metadata, and message content necessary to deliver and receive business communications. Meta may process data independently under its own terms and policies.</p>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">How information is used</h2>
          <p>Information is used to authenticate users, operate the ERP, create and manage business records, provide requested communications, maintain security, troubleshoot failures, and improve reliability.</p>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Security</h2>
          <p>Credentials, access tokens, application secrets, and webhook verification secrets are intended to remain server-side and are not displayed as ordinary application data. Access is restricted according to the application's authorization controls.</p>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Retention and deletion</h2>
          <p>Business records are retained according to the needs of the account owner and applicable obligations. Requests concerning personal data deletion can be submitted using the Data Deletion page linked below.</p>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Contact</h2>
          <p>For privacy questions or deletion requests, contact Sarkar Communication at <a className="font-semibold text-indigo-600" href="mailto:sarkarcommunication.cafe@gmail.com">sarkarcommunication.cafe@gmail.com</a>.</p>
          <p><a className="font-semibold text-indigo-600" href="/terms">Terms of Service</a> · <a className="font-semibold text-indigo-600" href="/data-deletion">Data Deletion Instructions</a></p>
        </section>
      </article>
    </main>
  );
}
