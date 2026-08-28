import PurchasesClient from "@/components/inventory/purchases-client";

export const metadata = {
  title: "Purchase Entry | CyberCafe ERP",
  description: "Record inventory purchases, supplier bills and purchase returns",
};

export default function PurchaseEntryPage() {
  return <PurchasesClient />;
}
