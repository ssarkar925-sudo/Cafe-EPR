const base = (process.env.BASE_URL || "https://cafe-epr-sarkar-communications-projects.vercel.app").replace(/\/$/, "");
const routes = [
  "/pos", "/inventory", "/invoices", "/business/dmt", "/business/aeps", "/business/upi", "/business/bill-payment", "/finance", "/reports", "/customers"
];
let failures = 0;
for (const route of routes) {
  try {
    const res = await fetch(`${base}${route}`, { redirect: "manual", signal: AbortSignal.timeout(15000) });
    const location = res.headers.get("location") || "";
    const ok = [200, 301, 302, 303, 307, 308].includes(res.status) && !location.includes("/404");
    console.log(`${ok ? "✅" : "❌"} ${route} -> ${res.status}${location ? ` ${location}` : ""}`);
    if (!ok) failures++;
  } catch (e) { console.error(`❌ ${route}: ${e.message}`); failures++; }
}
if (failures) process.exitCode = 1;
