/**
 * V1 receipt print stylesheet — thermal receipt milestone.
 *
 * Plain CSS text rendered through a <style> element by V1Receipt (client
 * component), so the global print rules that isolate the receipt apply
 * exactly on pages rendering a receipt and nowhere else. No build-time
 * CSS-module purity constraints, no layout changes, no shell edits.
 *
 * Monospace-safe, black on white, single column. Widths are exact paper
 * widths (58mm / 80mm). No external fonts, no color dependence, no
 * JavaScript required for layout.
 */

export const V1R_PRINT_CSS = `
.v1r-receipt {
  background: #fff;
  color: #000;
  font-family: "Courier New", Courier, monospace;
  font-size: 12px;
  line-height: 1.45;
  padding: 8px;
  margin: 0 auto;
  border: 1px dashed #999;
}
.v1r-w58 {
  width: 58mm;
  max-width: 100%;
}
.v1r-w80 {
  width: 80mm;
  max-width: 100%;
}
.v1r-block {
  border-top: 1px solid #000;
  padding: 4px 0;
  page-break-inside: avoid;
}
.v1r-block-first {
  border-top: none;
}
.v1r-business {
  text-align: center;
  font-weight: 700;
  font-size: 14px;
  margin: 0;
  overflow-wrap: break-word;
}
.v1r-title {
  text-align: center;
  font-weight: 700;
  margin: 2px 0 0;
}
.v1r-watermark {
  text-align: center;
  font-weight: 700;
  font-size: 14px;
  border: 2px solid #000;
  padding: 4px;
  margin: 6px 0;
}
.v1r-row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin: 1px 0;
}
.v1r-num {
  text-align: right;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.v1r-wrap {
  overflow-wrap: break-word;
  word-break: break-word;
  min-width: 0;
}
.v1r-line {
  page-break-inside: avoid;
  margin: 2px 0;
}
.v1r-total {
  font-weight: 700;
  font-size: 14px;
}
.v1r-capitalize {
  text-transform: capitalize;
}
.v1r-footer {
  text-align: center;
  margin: 2px 0 0;
}
.v1r-screen-only {
  margin: 0 auto 12px;
  max-width: 80mm;
}
@media print {
  body * {
    visibility: hidden;
  }
  .v1r-receipt,
  .v1r-receipt * {
    visibility: visible;
  }
  .v1r-receipt {
    position: absolute;
    left: 0;
    top: 0;
    margin: 0;
    border: none;
    page-break-inside: avoid;
  }
  .v1r-screen-only {
    display: none;
  }
  @page {
    margin: 0;
  }
}
`;
