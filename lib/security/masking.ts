/**
 * ==============================================================================
 * Sensitive Data Masking (DPDP Act & Privacy Compliance)
 * ==============================================================================
 */

export function maskAadhaar(val: string | null | undefined): string {
  if (!val) return "—";
  const clean = val.replace(/\D/g, "");
  if (clean.length < 4) return "••••";
  return "•••• •••• " + clean.slice(-4);
}

export function maskBankAccount(val: string | null | undefined): string {
  if (!val) return "—";
  const clean = val.replace(/\D/g, "");
  if (clean.length <= 4) return clean;
  return "•••••••• " + clean.slice(-4);
}

export function maskCardNumber(val: string | null | undefined): string {
  if (!val) return "—";
  const clean = val.replace(/\D/g, "");
  if (clean.length < 4) return "••••";
  return "•••• •••• •••• " + clean.slice(-4);
}

export function maskPan(val: string | null | undefined): string {
  if (!val) return "—";
  const clean = val.trim().toUpperCase();
  if (clean.length < 5) return "••••";
  return clean.slice(0, 2) + "•••••" + clean.slice(-2);
}

export function maskPhone(val: string | null | undefined): string {
  if (!val) return "—";
  const clean = val.replace(/\D/g, "");
  if (clean.length < 4) return clean;
  return clean.slice(0, 2) + "••••••" + clean.slice(-2);
}
