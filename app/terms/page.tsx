import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Terms of Service for Cafe ERP by Sarkar Communication.",
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-6 py-12 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <article className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm dark:border-white/10 dark:bg-slate-900">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">Cafe ERP</p>
        <h1 className="mt-2 text-3xl font-black">Terms of Service</h1>
        <p className="mt-2 text-sm text-slate-500">Last updated: September 3, 2026</p>
        <section className="mt-8 space-y-5 text-sm leading-7 text-slate-700 dark:text-slate-300">
          <p>These terms govern use of Cafe ERP, an operations platform provided by Sarkar Communication. By using the service, an authorized user agrees to use it lawfully and only for permitted business activities.</p>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Accounts and access</h2>
          <p>Users are responsible for protecting their account credentials and for activity performed through their authorized account. Administrative users are responsible for granting appropriate access to staff.</p>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Business records</h2>
          <p>The account owner is responsible for the accuracy, legality, and appropriate use of business, customer, financial, inventory, and communication records entered into Cafe ERP.</p>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Third-party services</h2>
          <p>Some features depend on third-party providers such as Meta, payment networks, messaging providers, or other business-service platforms. Those providers may impose separate terms, availability limits, or compliance requirements.</p>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Acceptable use</h2>
          <p>Users must not use Cafe ERP to violate law, impersonate another person or business, abuse third-party services, bypass security controls, or transmit malicious content.</p>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Service availability</h2>
          <p>We work to keep Cafe ERP reliable but do not guarantee uninterrupted availability. Maintenance, provider outages, network failures, or events outside our reasonable control may temporarily affect features.</p>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Contact</h2>
          <p>Questions about these terms can be sent to <a className="font-semibold text-indigo-600" href="mailto:sarkarcommunication.cafe@gmail.com">sarkarcommunication.cafe@gmail.com</a>.</p>
          <p><a className="font-semibold text-indigo-600" href="/privacy">Privacy Policy</a> · <a className="font-semibold text-indigo-600" href="/data-deletion">Data Deletion Instructions</a></p>
        </section>
      </article>
    </main>
  );
}
