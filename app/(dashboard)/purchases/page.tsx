import PurchasesClient from "@/components/inventory/purchases-client";

export const metadata = {
  title: "Purchases & Inward Restock | ERP",
  description: "Record inventory purchases, supplier bills, and purchase returns with Moving WAC",
};

export default function PurchasesPage() {
  return <PurchasesClient />;
}

