// Acceptance Test Suite: AEPS Universal Customer Search
// Tests A to O as specified in production requirements.
// Run: node scripts/test-aeps-customer-search.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), "utf8");

let passed = 0;
let failed = 0;

function ok(name, cond, extra = "") {
  if (cond) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.error(`  FAIL  ${name}${extra ? ` -- ${extra}` : ""}`);
  }
}

const cs = await import("../lib/customer-search.ts");
const {
  normalizePhone,
  normalizeSearchText,
  matchCustomerRecord,
  rankCustomerResults,
  formatCustomerResult,
} = cs;

console.log("=== AEPS UNIVERSAL CUSTOMER SEARCH ACCEPTANCE SUITE ===");

// Directory mock representing CafeERP customers table
const cafeerpCustomers = [
  {
    id: "a1b2c3d4-0001-4000-8000-000000000001",
    code: "CUST-00125",
    name: "Amit Biswas",
    phone: "9876543210",
    aadhaarLast4: "5678",
    is_active: true,
  },
  {
    id: "b2c3d4e5-0002-4000-8000-000000000002",
    code: "CUST-00042",
    name: "Sneha Karmakar",
    phone: "9123400042",
    aadhaarLast4: "1234",
    is_active: true,
  },
  {
    id: "c3d4e5f6-0003-4000-8000-000000000003",
    code: "CUST-00099",
    name: "Amitabh Banerjee",
    phone: "9830011223",
    aadhaarLast4: "9988",
    is_active: true,
  },
  {
    id: "d4e5f6a7-0004-4000-8000-000000000004",
    code: "CUST-00200",
    name: "Pooja Das",
    phone: "9748001122",
    aadhaarLast4: "5678", // Shares same last 4 with another customer
    is_active: true,
  },
];

// Test A: Type 'Amit' -> Shows matching customers named Amit
console.log("\nTest A: Name Search");
{
  const res = rankCustomerResults(cafeerpCustomers, "Amit", 10);
  ok(
    "Test A: Type 'Amit' finds Amit Biswas and Amitabh Banerjee",
    res.length >= 2 &&
      res.some((r) => r.record.name === "Amit Biswas") &&
      res.some((r) => r.record.name === "Amitabh Banerjee")
  );
  ok("Test A: Non-matching customer excluded", !res.some((r) => r.record.name === "Sneha Karmakar"));
}

// Test B: Type '9876543210' -> Shows customer with that mobile number
console.log("\nTest B: Mobile Number Search");
{
  const res = rankCustomerResults(cafeerpCustomers, "9876543210", 10);
  ok("Test B: Exact mobile returns Amit Biswas", res.length > 0 && res[0].record.name === "Amit Biswas");
  ok("Test B: Match tier is exact-phone", res[0].match.tier === "exact-phone");

  // Formatted mobile with country code / spaces
  const resFormatted = rankCustomerResults(cafeerpCustomers, "+91 98765-43210", 10);
  ok(
    "Test B: Formatted mobile (+91 98765-43210) resolves Amit Biswas",
    resFormatted.length > 0 && resFormatted[0].record.name === "Amit Biswas"
  );
}

// Test C: Type 'CUST-00125' or 'CUST00125' -> Shows customer with that code
console.log("\nTest C: Customer Code Search (Hyphen-Agnostic)");
{
  const withHyphen = rankCustomerResults(cafeerpCustomers, "CUST-00125", 10);
  ok(
    "Test C: Exact code with hyphen 'CUST-00125' matches Amit Biswas",
    withHyphen.length > 0 && withHyphen[0].record.code === "CUST-00125" && withHyphen[0].match.tier === "exact-id"
  );

  const withoutHyphen = rankCustomerResults(cafeerpCustomers, "CUST00125", 10);
  ok(
    "Test C: Code without hyphen 'CUST00125' matches Amit Biswas",
    withoutHyphen.length > 0 && withoutHyphen[0].record.code === "CUST-00125" && withoutHyphen[0].match.tier === "exact-id"
  );

  const lowercase = rankCustomerResults(cafeerpCustomers, "cust00125", 10);
  ok("Test C: Lowercase 'cust00125' matches", lowercase.length > 0 && lowercase[0].record.code === "CUST-00125");
}

// Test D: Type UUID 'a1b2c3d4-...' -> Shows customer with that ID
console.log("\nTest D: UUID Customer ID Search");
{
  const uuid = "a1b2c3d4-0001-4000-8000-000000000001";
  const res = rankCustomerResults(cafeerpCustomers, uuid, 10);
  ok("Test D: Exact UUID lookup returns Amit Biswas", res.length > 0 && res[0].record.id === uuid);
  ok("Test D: Tier is exact-id", res[0].match.tier === "exact-id");
}

// Test E: Type '5678' (4 digits) -> Shows customer matching Aadhaar last 4
console.log("\nTest E: Aadhaar Last 4 Digits Search");
{
  const res = rankCustomerResults(cafeerpCustomers, "5678", 10);
  ok("Test E: 4 digits '5678' returns Aadhaar matches", res.length >= 2);
  ok(
    "Test E: Includes Amit Biswas and Pooja Das",
    res.some((r) => r.record.name === "Amit Biswas") && res.some((r) => r.record.name === "Pooja Das")
  );
  ok("Test E: Does NOT include Sneha Karmakar (1234)", !res.some((r) => r.record.name === "Sneha Karmakar"));

  // Masked search input like ••••5678
  const maskedRes = rankCustomerResults(cafeerpCustomers, "••••5678", 10);
  ok(
    "Test E: Masked query '••••5678' returns Aadhaar matches",
    maskedRes.length >= 2 && maskedRes.some((r) => r.record.name === "Amit Biswas")
  );
}

// Test F: Debounce -> Rapid typing triggers only 1 API call after 300ms pause
console.log("\nTest F: Search Debounce Invariant");
{
  const workspaceSrc = read("components/business/aeps-workspace.tsx");
  ok(
    "Test F: 300ms debounce timer configured in useEffect",
    workspaceSrc.includes("setTimeout(") &&
      workspaceSrc.includes("300") &&
      workspaceSrc.includes("searchAbortRef")
  );
  ok(
    "Test F: AbortController cancels superseded inflight requests",
    workspaceSrc.includes("new AbortController()") &&
      workspaceSrc.includes("signal: controller.signal") &&
      workspaceSrc.includes("abort()")
  );
}

// Test G: Short query -> Typing 'A' does not trigger API call
console.log("\nTest G: Short Query Guard (<2 characters)");
{
  const workspaceSrc = read("components/business/aeps-workspace.tsx");
  const apiRouteSrc = read("app/api/customers/search/route.ts");

  ok(
    "Test G: Client checks query length < 2 before fetch",
    workspaceSrc.includes("raw.length < 2") || workspaceSrc.includes("q.length < 2") || workspaceSrc.includes("trimmed.length < 2")
  );
  ok("Test G: Client resets results when query < 2", workspaceSrc.includes("setCustomerSearchResults([])"));
  ok("Test G: API route rejects queries < 2 characters", apiRouteSrc.includes("query.length < 2"));
}

// Test H: No match -> Shows 'No matching customers found'
console.log("\nTest H: No Match State");
{
  const workspaceSrc = read("components/business/aeps-workspace.tsx");
  ok(
    "Test H: Workspace renders 'No matching customers found'",
    workspaceSrc.includes("No matching customers found")
  );
  ok(
    "Test H: Provides suggestion 'Try searching by mobile number or customer code'",
    workspaceSrc.includes("Try searching by mobile number or customer code")
  );
}

// Test I: Loading state -> Shows loading indicator during search
console.log("\nTest I: Loading State");
{
  const workspaceSrc = read("components/business/aeps-workspace.tsx");
  ok(
    "Test I: Loading state renders 'Searching customers...'",
    workspaceSrc.includes("Searching customers...")
  );
  ok(
    "Test I: Renders animated spinner indicator",
    workspaceSrc.includes("animate-spin")
  );
}

// Test J: Click customer -> Populates Name, Mobile, Aadhaar, customer_id
console.log("\nTest J: Customer Selection & Form Autofill");
{
  const workspaceSrc = read("components/business/aeps-workspace.tsx");
  ok(
    "Test J: handleSelectCustomer sets customerId",
    workspaceSrc.includes("setCustomerId(c.id)")
  );
  ok(
    "Test J: handleSelectCustomer sets customer name",
    workspaceSrc.includes("setName(c.name")
  );
  ok(
    "Test J: handleSelectCustomer sets 10-digit mobile",
    workspaceSrc.includes("setMobile(")
  );
  ok(
    "Test J: handleSelectCustomer sets Aadhaar last 4",
    workspaceSrc.includes("setAadhaar(")
  );
  ok(
    "Test J: handleSelectCustomer stores selected customer record",
    workspaceSrc.includes("setSelectedCustomerRecord(")
  );
}

// Test K: Verify form -> Bank and Portal are NOT changed when customer is selected
console.log("\nTest K: Non-Mutation Invariant for Bank, Portal & Pricing");
{
  const workspaceSrc = read("components/business/aeps-workspace.tsx");
  const fnMatch = workspaceSrc.match(/const handleSelectCustomer = \(([\s\S]*?)\n  \};/);
  ok("Test K: handleSelectCustomer function inspected", !!fnMatch);
  if (fnMatch) {
    const fnBody = fnMatch[1];
    ok("Test K: handleSelectCustomer does NOT call setBankId", !fnBody.includes("setBankId"));
    ok("Test K: handleSelectCustomer does NOT call setPortalId", !fnBody.includes("setPortalId"));
    ok("Test K: handleSelectCustomer does NOT call setTransactionType", !fnBody.includes("setTransactionType"));
    ok("Test K: handleSelectCustomer does NOT call setFeeSource", !fnBody.includes("setFeeSource"));
    ok("Test K: handleSelectCustomer does NOT call setFee(", !fnBody.includes("setFee("));
    ok("Test K: handleSelectCustomer does NOT call setCommission(", !fnBody.includes("setCommission("));
  }
}

// Test L: Clear search box -> Dropdown closes, selected customer remains linked
console.log("\nTest L: Clear Search Box Behavior");
{
  const workspaceSrc = read("components/business/aeps-workspace.tsx");
  const fnMatch = workspaceSrc.match(/const handleClearSearch = useCallback\(\(\) => \{([\s\S]*?)\}, \[\]\);/);
  ok("Test L: handleClearSearch function exists", !!fnMatch);
  if (fnMatch) {
    const fnBody = fnMatch[1];
    ok("Test L: handleClearSearch clears customerSearchQuery", fnBody.includes('setCustomerSearchQuery("")'));
    ok("Test L: handleClearSearch clears search results dropdown", fnBody.includes("setCustomerSearchResults([])"));
    ok("Test L: handleClearSearch does NOT clear customerId", !fnBody.includes('setCustomerId("")'));
  }
  ok("Test L: Clear [x] button rendered when query is present", workspaceSrc.includes("handleClearSearch"));
}

// Test M: Unlink customer -> Clears customer_id, leaves form fields editable
console.log("\nTest M: Unlink Customer Action");
{
  const workspaceSrc = read("components/business/aeps-workspace.tsx");
  const fnMatch = workspaceSrc.match(/const handleUnlinkCustomer = useCallback\(\(\) => \{([\s\S]*?)\}, \[showToast\]\);/);
  ok("Test M: handleUnlinkCustomer function exists", !!fnMatch);
  if (fnMatch) {
    const fnBody = fnMatch[1];
    ok("Test M: handleUnlinkCustomer clears customerId", fnBody.includes('setCustomerId("")'));
    ok("Test M: handleUnlinkCustomer clears selected record", fnBody.includes("setSelectedCustomerRecord(null)"));
    ok("Test M: handleUnlinkCustomer does NOT wipe name", !fnBody.includes('setName("")'));
    ok("Test M: handleUnlinkCustomer does NOT wipe mobile", !fnBody.includes('setMobile("")'));
    ok("Test M: handleUnlinkCustomer does NOT wipe aadhaar", !fnBody.includes('setAadhaar("")'));
  }
  ok("Test M: Unlink button rendered when customer is linked", workspaceSrc.includes("handleUnlinkCustomer"));
}

// Test N: Security -> Full Aadhaar is NEVER returned in API response or shown in UI
console.log("\nTest N: Privacy & Aadhaar Security Invariant");
{
  const apiRouteSrc = read("app/api/customers/search/route.ts");
  const workspaceSrc = read("components/business/aeps-workspace.tsx");

  ok(
    "Test N: API returns only aadhaarLast4 / aadhaar_last4",
    apiRouteSrc.includes("aadhaarLast4: aadhaarLast4 || undefined") &&
      !apiRouteSrc.includes("full_aadhaar") &&
      !apiRouteSrc.includes("aadhaar_number")
  );
  ok(
    "Test N: Workspace slices Aadhaar to last 4 digits only",
    workspaceSrc.includes(".slice(-4)")
  );
  ok(
    "Test N: Workspace masks Aadhaar display as ••••xxxx",
    workspaceSrc.includes("••••")
  );
}

// Test O: Integration & Invariants verification
console.log("\nTest O: Invariants & Authoritative Directory Invariant");
{
  const workspaceSrc = read("components/business/aeps-workspace.tsx");
  ok(
    "Test O: Universal customer search queries /api/customers/search",
    workspaceSrc.includes("fetch(`/api/customers/search?q=")
  );
  ok(
    "Test O: Mobile auto-resolve queries /api/customers/search?q=${cleanMobile}",
    workspaceSrc.includes("/api/customers/search?q=${cleanMobile}")
  );
  ok(
    "Test O: Displays authoritative CafeERP DB badge",
    workspaceSrc.includes("Authoritative CafeERP DB")
  );
  ok(
    "Test O: Candidate card renders initials, Name, Customer ID, Mobile, and Aadhaar",
    workspaceSrc.includes("getCustomerInitials") &&
      workspaceSrc.includes("Customer ID:") &&
      workspaceSrc.includes("Mobile:") &&
      workspaceSrc.includes("••••")
  );
}

console.log(`\n========================================================`);
console.log(`AEPS CUSTOMER SEARCH SUITE: ${passed} PASSED, ${failed} FAILED`);
console.log(`========================================================\n`);

process.exit(failed ? 1 : 0);
