import fs from "node:fs";

const path = "components/business/dmt-workspace.tsx";
let source = fs.readFileSync(path, "utf8");

const validation = /  \/\/ (?:Strict Form Validation Guard|Form Validation Guard: beneficiary bank\/account\/IFSC\/UPI are optional)[\s\S]*?\n  \/\/ Current Active Lifecycle Step/;
const replacement = `  // Form Validation Guard: beneficiary bank/account/IFSC/UPI are optional.
  // Amount, reference and settlement routing remain required.
  const isFormValid = useMemo(() => {
    if (numAmount <= 0) return false;
    if (numCharge < 0 || numFee < 0 || numComm < 0) return false;
    if (!reference.trim() || reference.trim().length < 6) return false;
    if (senderMobile.trim() && senderMobile.trim().replace(/\\D/g, "").length !== 10) return false;
    if (paidFrom === "portal" && !selectedPortalId) return false;
    if (paidFrom === "bank" && !selectedBankInstrumentId) return false;
    if (customerPayMethod === "due" && !selectedCustomerId) return false;
    return true;
  }, [
    numAmount,
    numCharge,
    numFee,
    numComm,
    reference,
    senderMobile,
    paidFrom,
    selectedPortalId,
    selectedBankInstrumentId,
    customerPayMethod,
    selectedCustomerId,
  ]);

  // Current Active Lifecycle Step`;

if (!validation.test(source)) throw new Error("DMT validation block not found");
source = source.replace(validation, replacement);

const step = /  const currentStep = useMemo\(\(\) => \{[\s\S]*?\n  \}, \[selectedCustomerId, senderName, senderMobile, transferMethod, beneficiaryAccount, beneficiaryBank, beneficiaryIfsc, upiId, numAmount\]\);/;
const stepReplacement = `  const currentStep = useMemo(() => {
    if (!selectedCustomerId && !senderName.trim() && !senderMobile.trim()) return 1;
    if (numAmount <= 0) return 4;
    return 5;
  }, [selectedCustomerId, senderName, senderMobile, numAmount]);`;
if (!step.test(source)) throw new Error("DMT currentStep block not found");
source = source.replace(step, stepReplacement);

const exactReplacements = [
  ["Beneficiary Bank <span className=\"text-rose-500\">*</span>", "Beneficiary Bank"],
  ["Account Number <span className=\"text-rose-500\">*</span>", "Account Number"],
  ["Bank IFSC Code <span className=\"text-rose-500\">*</span>", "Bank IFSC Code"],
  ["Beneficiary UPI ID (VPA) <span className=\"text-rose-500\">*</span>", "Beneficiary UPI ID (VPA)"],
];
for (const [from, to] of exactReplacements) source = source.replace(from, to);

source = source.replace(/(value=\{beneficiaryAccount\}[\s\S]*?placeholder=\"Enter account number\")/m, (block) => block.replace(/required\s*/g, ""));
source = source.replace(/(value=\{beneficiaryIfsc\}[\s\S]*?placeholder=\"e\.g\. SBIN0001234\")/m, (block) => block.replace(/required\s*/g, ""));
source = source.replace(/(value=\{upiId\}[\s\S]*?placeholder=\"e\.g\. username@oksbi or 9876543210@paytm\")/m, (block) => block.replace(/required\s*/g, ""));

fs.writeFileSync(path, source);

const enhancerPath = "components/business/dmt-self-beneficiary-enhancer.tsx";
let enhancer = fs.readFileSync(enhancerPath, "utf8");
enhancer = enhancer.replace(
  "observer.observe(document.body, { subtree: true, childList: true, characterData: true });",
  "observer.observe(document.body, { subtree: true, childList: true });"
);
fs.writeFileSync(enhancerPath, enhancer);

console.log("DMT build repair applied: beneficiary bank/account/IFSC/UPI are optional; self copies name/mobile only.");
