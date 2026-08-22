export function inr(n: number | string) {
  return (
    "₹" +
    Number(n).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

export function numberToWordsInr(num: number | string): string {
  const n = Math.round(Number(num) || 0);
  if (n === 0) return "Zero Rupees Only";
  if (n < 0) return "Negative " + numberToWordsInr(-n);

  const units = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  function convertSection(v: number): string {
    let str = "";
    if (v >= 100) {
      str += units[Math.floor(v / 100)] + " Hundred ";
      v %= 100;
    }
    if (v >= 20) {
      str += tens[Math.floor(v / 10)] + (v % 10 ? " " + units[v % 10] : "");
    } else if (v > 0) {
      str += units[v];
    }
    return str.trim();
  }

  let crore = Math.floor(n / 10000000);
  let remainder = n % 10000000;
  let lakh = Math.floor(remainder / 100000);
  remainder %= 100000;
  let thousand = Math.floor(remainder / 1000);
  remainder %= 1000;
  let hundreds = remainder;

  let res = "";
  if (crore > 0) res += convertSection(crore) + " Crore ";
  if (lakh > 0) res += convertSection(lakh) + " Lakh ";
  if (thousand > 0) res += convertSection(thousand) + " Thousand ";
  if (hundreds > 0) res += convertSection(hundreds);

  return "Rupees " + res.trim() + " Only";
}
