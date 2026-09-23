"use client";

/**
 * V1 thermal receipt — presentational only (thermal receipt milestone).
 *
 * Renders a V1ReceiptModel in fixed field order (identity, transaction,
 * customer, lines, totals, payment, stamps, footer) and injects the
 * scoped print stylesheet. No data fetching, no mutations, no tax math,
 * no QR, no secrets.
 */

import { V1R_PRINT_CSS } from "./v1-receipt-css";
import { UNSYNCED_RECEIPT_LABEL, money, type V1ReceiptModel } from "./v1-receipt-model";

export default function V1Receipt({ receipt, width }: { receipt: V1ReceiptModel; width: 58 | 80 }) {
  const showWatermark = receipt.provisional;
  const showCancelled = !receipt.provisional && receipt.status !== "posted";
  return (
    <>
      <style>{V1R_PRINT_CSS}</style>
      <div className={`v1r-receipt ${width === 58 ? "v1r-w58" : "v1r-w80"}`} role="document" aria-label="Sale receipt">
        <div className="v1r-block v1r-block-first">
          <p className="v1r-business">{receipt.businessName}</p>
          <p className="v1r-title">SALE RECEIPT</p>
        </div>

        {showWatermark && <p className="v1r-watermark">{UNSYNCED_RECEIPT_LABEL}</p>}
        {showCancelled && <p className="v1r-watermark">{receipt.status.toUpperCase()}</p>}

        <div className="v1r-block">
          <p className="v1r-row">
            <span>Bill No</span>
            <span className="v1r-num">{receipt.provisional ? receipt.provisionalNumber : receipt.canonicalNumber}</span>
          </p>
          <p className="v1r-row">
            <span>Date</span>
            <span className="v1r-num">{receipt.invoiceDate}</span>
          </p>
          {receipt.serverTimestamp && (
            <p className="v1r-row">
              <span>Recorded</span>
              <span className="v1r-num">{receipt.serverTimestamp.slice(0, 19).replace("T", " ")}</span>
            </p>
          )}
        </div>

        {receipt.customer && (
          <div className="v1r-block">
            <p className="v1r-row">
              <span>Customer</span>
              <span className="v1r-wrap">{receipt.customer.name}</span>
            </p>
            {receipt.customer.phone && (
              <p className="v1r-row">
                <span>Phone</span>
                <span className="v1r-num">{receipt.customer.phone}</span>
              </p>
            )}
            {receipt.khataBalance !== null && (
              <p className="v1r-row">
                <span>Khata balance</span>
                <span className="v1r-num">{money(receipt.khataBalance)}</span>
              </p>
            )}
          </div>
        )}

        <div className="v1r-block">
          {receipt.lines.map((l, i) => (
            <div key={i} className="v1r-line">
              <p className="v1r-wrap">{l.name}</p>
              <p className="v1r-row">
                <span>
                  {l.qty} x {money(l.rate)}
                </span>
                <span className="v1r-num">{money(l.amount)}</span>
              </p>
            </div>
          ))}
        </div>

        <div className="v1r-block">
          <p className="v1r-row">
            <span>Subtotal</span>
            <span className="v1r-num">{money(receipt.subtotal)}</span>
          </p>
          <p className="v1r-row">
            <span>Discount</span>
            <span className="v1r-num">{money(receipt.discount)}</span>
          </p>
          {receipt.discount > 0 && (
            <p className="v1r-row">
              <span>Approved by</span>
              <span className="v1r-wrap">{receipt.approverName ?? "Admin (see records)"}</span>
            </p>
          )}
          <p className="v1r-row v1r-total">
            <span>Total</span>
            <span className="v1r-num">{money(receipt.total)}</span>
          </p>
        </div>

        {receipt.payments.length > 0 && (
          <div className="v1r-block">
            {receipt.payments.map((p, i) => (
              <p key={i} className="v1r-row">
                <span className="v1r-capitalize">
                  {p.method}
                  {p.instrument ? ` (${p.instrument})` : ""}
                </span>
                <span className="v1r-num">{money(p.amount)}</span>
              </p>
            ))}
          </div>
        )}

        {(receipt.editedFromNumber || receipt.recreatedByNumber) && (
          <div className="v1r-block">
            {receipt.editedFromNumber && (
              <p className="v1r-row">
                <span>Edited from</span>
                <span className="v1r-num">{receipt.editedFromNumber}</span>
              </p>
            )}
            {receipt.recreatedByNumber && (
              <p className="v1r-row">
                <span>Recreated by</span>
                <span className="v1r-num">{receipt.recreatedByNumber}</span>
              </p>
            )}
          </div>
        )}

        <div className="v1r-block">
          <p className="v1r-footer">Thank you.</p>
        </div>
      </div>
    </>
  );
}
