// Plain helpers for the admin profile views (kept out of ProfileKit.jsx for fast refresh)

// ── Formatting ────────────────────────────────────────────────────

export function formatDate(iso, opts = { day: 'numeric', month: 'short', year: 'numeric' }) {
  if (!iso) return '—';
  const d = String(iso).length === 10 ? new Date(iso + 'T00:00:00') : new Date(iso);
  return d.toLocaleDateString('en-GB', opts);
}

export function formatTZS(n) {
  return 'TZS ' + Number(n || 0).toLocaleString('en-US');
}

/** wa.me link from a Tanzanian number ("0746…", "+255 746…", "255746…"). */
export function waLink(phone) {
  if (!phone) return null;
  let digits = String(phone).replace(/\D/g, '');
  if (digits.startsWith('0')) digits = '255' + digits.slice(1);
  if (digits.length === 9) digits = '255' + digits;
  return digits.length >= 11 ? `https://wa.me/${digits}` : null;
}

// ── Profile completeness ──────────────────────────────────────────

export function coCompleteness(w) {
  const items = [
    { label: 'Profile photo',          done: !!w.users?.avatar_url },
    { label: 'Phone number',           done: !!w.users?.phone },
    { label: 'About / bio',            done: !!w.users?.bio?.trim() },
    { label: 'Specialization',         done: !!w.specialization },
    { label: 'Employment availability', done: !!w.employment_availability_status },
    { label: 'Mobile money details',   done: !!(w.has_mobile_money ?? w.mobileMoney) },
    { label: 'Contractor agreement signed', done: !!w.ica_signed_at },
  ];
  const done = items.filter((i) => i.done).length;
  return { items, done, total: items.length, pct: Math.round((done / items.length) * 100) };
}

export function facilityCompleteness(f) {
  const items = [
    { label: 'Logo / photo',   done: !!f.users?.avatar_url },
    { label: 'Contact phone',  done: !!f.users?.phone },
    { label: 'About',          done: !!f.users?.bio?.trim() },
    { label: 'Facility type',  done: !!f.facility_type },
    { label: 'Address',        done: !!f.address },
    { label: 'Terms accepted', done: !!f.users?.tos_agreed_at },
  ];
  const done = items.filter((i) => i.done).length;
  return { items, done, total: items.length, pct: Math.round((done / items.length) * 100) };
}

