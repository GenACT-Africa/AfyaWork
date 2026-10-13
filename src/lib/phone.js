/**
 * Tanzanian mobile numbers in any common format → "+2557XXXXXXXX".
 * Accepts spaces, dashes, dots and brackets, with or without the 0 / 255 / +255 prefix:
 *   "+255 748 795 514", "0748795514", "255-748-795-514", "(0748) 795 514", "748795514".
 * Returns null when the digits are not a Tanzanian mobile number.
 */
export function normaliseTzPhone(raw) {
  let d = String(raw ?? '').replace(/[\s\-().]/g, '');
  if (/[^+\d]/.test(d)) return null;                 // letters or other symbols
  d = d.replace(/^\+/, '').replace(/^00/, '');
  if (/^2550[67]\d{8}$/.test(d)) d = `255${d.slice(4)}`;   // "+255 (0) 7…"
  if (/^0[67]\d{8}$/.test(d)) d = `255${d.slice(1)}`;
  else if (/^[67]\d{8}$/.test(d)) d = `255${d}`;
  return /^255[67]\d{8}$/.test(d) ? `+${d}` : null;
}

export const isTzPhone = (raw) => normaliseTzPhone(raw) !== null;

/** Why a number was refused, in plain words (for form errors). */
export function phoneProblem(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return 'Enter a phone number.';
  if (/[a-z]/i.test(s)) return 'The phone number has letters in it.';
  let d = s.replace(/\D/g, '').replace(/^00/, '');
  if (/^(\+|00)/.test(s) && !d.startsWith('255')) return 'Only Tanzanian numbers (+255) are accepted.';
  d = d.replace(/^2550?/, '').replace(/^0/, '');
  if (d.length < 9) return 'The phone number is too short — a Tanzanian mobile has 10 digits, e.g. 0748 795 514.';
  if (d.length > 9) return 'The phone number is too long — a Tanzanian mobile has 10 digits, e.g. 0748 795 514.';
  if (!/^[67]/.test(d)) return 'That is not a mobile number — it should start with 06 or 07 (or +255 6 / +255 7).';
  return '';
}
