/**
 * packages/hardware/src/escpos-builder.ts
 * High-performance, direct ESC/POS byte-level receipt builder for 58mm & 80mm thermal printers.
 * Generates raw Uint8Array byte streams ready for WebSerial, Tauri raw USB, or TCP.
 */

export type PrinterWidth = 58 | 80;

export interface ReceiptItem {
  name: string;
  qty: number;
  ratePaisa: bigint;
  totalPaisa: bigint;
}

export interface ReceiptData {
  shopName: string;
  addressLines?: string[];
  phone?: string;
  invoiceNumber: string;
  dateTime: string;
  customerName?: string;
  customerPhone?: string;
  items: ReceiptItem[];
  subtotalPaisa: bigint;
  discountPaisa?: bigint;
  grandTotalPaisa: bigint;
  paymentBreakdown: {
    method: string; // 'CASH', 'UPI', 'KHATA', 'SPLIT'
    amountPaisa: bigint;
    details?: string; // e.g. 'PhonePe QR'
  }[];
  footerMessage?: string;
  upiQrString?: string; // Optional dynamic UPI payment string to print QR on receipt
}

export class EscPosBuilder {
  private buffer: number[] = [];
  private charsPerLine: number;

  constructor(private width: PrinterWidth = 58) {
    this.charsPerLine = width === 58 ? 32 : 48;
    this.init();
  }

  // Hardware control codes
  private init(): this {
    this.buffer.push(0x1b, 0x40); // ESC @ (Initialize printer)
    return this;
  }

  public setAlignCenter(): this {
    this.buffer.push(0x1b, 0x61, 0x01); // ESC a 1
    return this;
  }

  public setAlignLeft(): this {
    this.buffer.push(0x1b, 0x61, 0x00); // ESC a 0
    return this;
  }

  public setAlignRight(): this {
    this.buffer.push(0x1b, 0x61, 0x02); // ESC a 2
    return this;
  }

  public setBold(enable: boolean): this {
    this.buffer.push(0x1b, 0x45, enable ? 0x01 : 0x00); // ESC E n
    return this;
  }

  public setDoubleHeight(enable: boolean): this {
    this.buffer.push(0x1b, 0x21, enable ? 0x10 : 0x00); // ESC ! 16
    return this;
  }

  public text(str: string): this {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(str);
    for (const b of bytes) this.buffer.push(b);
    return this;
  }

  public line(str: string = ""): this {
    this.text(str);
    this.buffer.push(0x0a); // LF
    return this;
  }

  public divider(char: string = "-"): this {
    this.line(char.repeat(this.charsPerLine));
    return this;
  }

  public twoColumn(left: string, right: string): this {
    const spaceNeeded = this.charsPerLine - (left.length + right.length);
    if (spaceNeeded <= 0) {
      this.line(left);
      this.line(" ".repeat(Math.max(0, this.charsPerLine - right.length)) + right);
    } else {
      this.line(left + " ".repeat(spaceNeeded) + right);
    }
    return this;
  }

  public feed(lines: number = 3): this {
    for (let i = 0; i < lines; i++) this.buffer.push(0x0a);
    return this;
  }

  public cut(): this {
    this.feed(3);
    this.buffer.push(0x1d, 0x56, 0x41, 0x00); // GS V 65 0 (Full Cut)
    return this;
  }

  public toBytes(): Uint8Array {
    return new Uint8Array(this.buffer);
  }

  /**
   * High-level receipt layout compiler
   */
  public static buildReceipt(data: ReceiptData, width: PrinterWidth = 58): Uint8Array {
    const b = new EscPosBuilder(width);

    // Header
    b.setAlignCenter()
      .setBold(true)
      .setDoubleHeight(true)
      .line(data.shopName)
      .setDoubleHeight(false)
      .setBold(false);

    if (data.addressLines) {
      for (const addr of data.addressLines) b.line(addr);
    }
    if (data.phone) {
      b.line(`Phone: ${data.phone}`);
    }

    b.divider("=");

    // Meta details
    b.setAlignLeft()
      .twoColumn(`Bill: ${data.invoiceNumber}`, data.dateTime.split("T")[0] || data.dateTime);

    if (data.customerName) {
      b.line(`Customer: ${data.customerName}${data.customerPhone ? ` (${data.customerPhone})` : ""}`);
    }

    b.divider("-");

    // Table Header
    b.setBold(true).twoColumn("Item", "Total").setBold(false);
    b.divider("-");

    // Line items
    for (const item of data.items) {
      const priceStr = `Rs ${(Number(item.totalPaisa) / 100).toFixed(2)}`;
      const qtyStr = `${item.qty} x ${(Number(item.ratePaisa) / 100).toFixed(2)}`;
      b.twoColumn(item.name, priceStr);
      b.line(`  (${qtyStr})`);
    }

    b.divider("-");

    // Totals
    const subtotalStr = `Rs ${(Number(data.subtotalPaisa) / 100).toFixed(2)}`;
    b.twoColumn("Subtotal:", subtotalStr);

    if (data.discountPaisa && data.discountPaisa > 0n) {
      const discStr = `- Rs ${(Number(data.discountPaisa) / 100).toFixed(2)}`;
      b.twoColumn("Discount:", discStr);
    }

    b.setBold(true);
    const grandTotalStr = `Rs ${(Number(data.grandTotalPaisa) / 100).toFixed(2)}`;
    b.twoColumn("GRAND TOTAL:", grandTotalStr);
    b.setBold(false);

    b.divider("=");

    // Payment breakdown
    b.setBold(true).line("Payment Details:").setBold(false);
    for (const pay of data.paymentBreakdown) {
      const amountStr = `Rs ${(Number(pay.amountPaisa) / 100).toFixed(2)}`;
      const label = `${pay.method}${pay.details ? ` (${pay.details})` : ""}`;
      b.twoColumn(label, amountStr);
    }

    b.divider("-");

    // Footer
    b.setAlignCenter()
      .line(data.footerMessage || "Thank you! Visit again.")
      .cut();

    return b.toBytes();
  }
}
