import QRCode from "qrcode";

export function generateUpiString({
  upiId,
  name,
  amount,
  note,
}: {
  upiId: string;
  name?: string;
  amount?: number | string;
  note?: string;
}): string {
  const cleanUpi = upiId?.trim();
  if (!cleanUpi) return "";
  const params = new URLSearchParams();
  params.set("pa", cleanUpi);
  if (name) params.set("pn", name.trim());
  if (amount && Number(amount) > 0) params.set("am", Number(amount).toFixed(2));
  if (note) params.set("tn", note.trim());
  params.set("cu", "INR");

  return `upi://pay?${params.toString()}`;
}

export async function generateQrDataUrl(
  text: string,
  options?: { width?: number; margin?: number; darkColor?: string; lightColor?: string }
): Promise<string> {
  if (!text) return "";
  try {
    return await QRCode.toDataURL(text, {
      width: options?.width || 200,
      margin: options?.margin ?? 1,
      color: {
        dark: options?.darkColor || "#000000",
        light: options?.lightColor || "#ffffff",
      },
      errorCorrectionLevel: "M",
    });
  } catch (err) {
    console.error("Failed to generate QR code:", err);
    return "";
  }
}

