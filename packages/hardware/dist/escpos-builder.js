/**
 * packages/hardware/src/escpos-builder.ts
 * High-performance, direct ESC/POS byte-level receipt builder for 58mm & 80mm thermal printers.
 * Generates raw Uint8Array byte streams ready for WebSerial, Tauri raw USB, or TCP.
 */
export class EscPosBuilder {
    width;
    buffer = [];
    charsPerLine;
    constructor(width = 58) {
        this.width = width;
        this.charsPerLine = width === 58 ? 32 : 48;
        this.init();
    }
    // Hardware control codes
    init() {
        this.buffer.push(0x1b, 0x40); // ESC @ (Initialize printer)
        return this;
    }
    setAlignCenter() {
        this.buffer.push(0x1b, 0x61, 0x01); // ESC a 1
        return this;
    }
    setAlignLeft() {
        this.buffer.push(0x1b, 0x61, 0x00); // ESC a 0
        return this;
    }
    setAlignRight() {
        this.buffer.push(0x1b, 0x61, 0x02); // ESC a 2
        return this;
    }
    setBold(enable) {
        this.buffer.push(0x1b, 0x45, enable ? 0x01 : 0x00); // ESC E n
        return this;
    }
    setDoubleHeight(enable) {
        this.buffer.push(0x1b, 0x21, enable ? 0x10 : 0x00); // ESC ! 16
        return this;
    }
    text(str) {
        const encoder = new TextEncoder();
        const bytes = encoder.encode(str);
        for (const b of bytes)
            this.buffer.push(b);
        return this;
    }
    line(str = "") {
        this.text(str);
        this.buffer.push(0x0a); // LF
        return this;
    }
    divider(char = "-") {
        this.line(char.repeat(this.charsPerLine));
        return this;
    }
    twoColumn(left, right) {
        const spaceNeeded = this.charsPerLine - (left.length + right.length);
        if (spaceNeeded <= 0) {
            this.line(left);
            this.line(" ".repeat(Math.max(0, this.charsPerLine - right.length)) + right);
        }
        else {
            this.line(left + " ".repeat(spaceNeeded) + right);
        }
        return this;
    }
    feed(lines = 3) {
        for (let i = 0; i < lines; i++)
            this.buffer.push(0x0a);
        return this;
    }
    cut() {
        this.feed(3);
        this.buffer.push(0x1d, 0x56, 0x41, 0x00); // GS V 65 0 (Full Cut)
        return this;
    }
    toBytes() {
        return new Uint8Array(this.buffer);
    }
    /**
     * High-level receipt layout compiler
     */
    static buildReceipt(data, width = 58) {
        const b = new EscPosBuilder(width);
        // Header
        b.setAlignCenter()
            .setBold(true)
            .setDoubleHeight(true)
            .line(data.shopName)
            .setDoubleHeight(false)
            .setBold(false);
        if (data.addressLines) {
            for (const addr of data.addressLines)
                b.line(addr);
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
