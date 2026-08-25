import StockMovementsClient from "@/components/inventory/movements-client";

export const metadata = {
  title: "Stock Movements Journal | ERP",
  description: "Audited physical stock movements journal and stock adjustment trail",
};

export default function StockMovementsPage() {
  return <StockMovementsClient />;
}

