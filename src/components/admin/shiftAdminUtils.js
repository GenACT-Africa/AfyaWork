export const SHIFT_TYPES = ['Day (8AM-4PM)', 'Evening (4PM-10PM)', 'Night (10PM-6AM)', '24-Hour', 'Weekend'];

/** Today in Dar es Salaam as YYYY-MM-DD (min for date inputs). */
export function todayEAT() {
  return new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
}
