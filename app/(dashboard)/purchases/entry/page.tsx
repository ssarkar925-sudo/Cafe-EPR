import PurchaseEntryClient from "@/components/purchases/purchase-entry-client";

export const metadata = {
  title: "Stock Inward & Purchase Entry | CyberCafe ERP",
  description: "Record inward stock, supplier bills, moving WAC calculation, and payables",
};

export default function PurchaseEntryPage() {
  return <PurchaseEntryClient />;
}

