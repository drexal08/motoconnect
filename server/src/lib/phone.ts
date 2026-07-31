/** Rwandan telco validation + normalization (PRD §4.3). */
const MTN = /^(\+250|0)7[89]\d{7}$/;
const AIRTEL = /^(\+250|0)7[23]\d{7}$/;
const COMBINED = /^(\+250|0)7[2389]\d{7}$/;

export function normalizePhone(input: string): string | null {
  const cleaned = input.replace(/[\s\-().]/g, '');
  if (!COMBINED.test(cleaned)) return null;
  if (cleaned.startsWith('0')) return '+250' + cleaned.slice(1);
  return cleaned;
}

export function isMtn(phone: string): boolean {
  return MTN.test(phone);
}

export function isAirtel(phone: string): boolean {
  return AIRTEL.test(phone);
}
