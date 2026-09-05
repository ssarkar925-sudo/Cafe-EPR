"use client";

import MasterClient from "@/components/business/master-client";

export default function MerchantQrsShell({ rows, usage }: { rows: any[]; usage: Record<string, number> }) {
  return (
    <MasterClient
      title="UPI Merchant QRs"
      desc="Shop UPI QR codes used for UPI cash-out transfers."
      table="upi_merchant_qrs"
      fields={[
        { key: "display_name", label: "Display Name", required: true, placeholder: "Shop Main QR" },
        { key: "upi_id", label: "UPI ID", required: true, placeholder: "shop@sbi" },
      ]}
      rows={rows}
      usage={usage}
    />
  );
}
