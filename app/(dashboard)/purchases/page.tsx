import PurchasesHistoryClient from "@/components/purchases/purchases-history-client";

export const metadata = {
  title: "Purchases & Inward History | CyberCafe ERP",
  description: "Purchase bills ledger, inward stock history, and supplier liabilities",
};

export default function PurchasesPage() {
  return <PurchasesHistoryClient />;
}

