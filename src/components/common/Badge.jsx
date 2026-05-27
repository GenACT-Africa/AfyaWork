import { useTranslation } from 'react-i18next';

const styles = {
  // ── Original statuses ──
  open:      'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  filled:    'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
  cancelled: 'bg-gray-100 text-gray-500 ring-1 ring-gray-200',
  pending:   'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  approved:  'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  rejected:  'bg-red-50 text-red-600 ring-1 ring-red-200',
  // ── Subscription tiers ──
  msingi:    'bg-gray-100 text-gray-600 ring-1 ring-gray-200',
  daktari:   'bg-teal-50 text-teal-700 ring-1 ring-teal-200',
  bingwa:    'bg-purple-50 text-purple-700 ring-1 ring-purple-200',
  // ── Feature 2: shift lifecycle ──
  confirmed:                  'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200',
  pending_checkin_approval:   'bg-amber-50 text-amber-700 ring-1 ring-amber-300',
  in_progress:                'bg-teal-50 text-teal-700 ring-1 ring-teal-200',
  pending_checkout_approval:  'bg-orange-50 text-orange-700 ring-1 ring-orange-300',
  completed:                  'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-300',
  disputed_checkin:           'bg-red-50 text-red-700 ring-1 ring-red-300',
  disputed_checkout:          'bg-red-50 text-red-700 ring-1 ring-red-300',
  no_show:                    'bg-gray-100 text-gray-700 ring-1 ring-gray-300',
};

const dots = {
  open:                      'bg-emerald-500',
  filled:                    'bg-blue-500',
  cancelled:                 'bg-gray-400',
  pending:                   'bg-amber-500',
  approved:                  'bg-emerald-500',
  rejected:                  'bg-red-500',
  confirmed:                 'bg-indigo-500',
  pending_checkin_approval:  'bg-amber-500',
  in_progress:               'bg-teal-500',
  pending_checkout_approval: 'bg-orange-500',
  completed:                 'bg-emerald-600',
  disputed_checkin:          'bg-red-500',
  disputed_checkout:         'bg-red-500',
  no_show:                   'bg-gray-500',
};

// Human-readable fallback labels for statuses not in i18n yet
const fallbackLabels = {
  confirmed:                 'Confirmed',
  pending_checkin_approval:  'Check-in Pending',
  in_progress:               'In Progress',
  pending_checkout_approval: 'Checkout Pending',
  completed:                 'Completed',
  disputed_checkin:          'Disputed',
  disputed_checkout:         'Disputed',
  no_show:                   'No Show',
};

// ── Employment Availability Badge ─────────────────────────────────

const AVAIL_CONFIG = {
  open_fulltime: {
    label: 'Open to full-time roles',
    style: 'bg-green-50 text-green-700 ring-1 ring-green-200',
    dot:   'bg-green-500',
  },
  open_parttime: {
    label: 'Open to part-time permanent',
    style: 'bg-yellow-50 text-yellow-700 ring-1 ring-yellow-200',
    dot:   'bg-yellow-500',
  },
};

/** Renders a green or yellow availability badge. Returns null for not_looking / null. */
export function AvailabilityBadge({ status, className = '' }) {
  const cfg = AVAIL_CONFIG[status];
  if (!cfg) return null;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold ${cfg.style} ${className}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

export function Badge({ status, className = '' }) {
  const { t } = useTranslation();
  const label = fallbackLabels[status] ?? t(`status.${status}`, { defaultValue: status });
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold ${styles[status] || 'bg-gray-100 text-gray-600'} ${className}`}>
      {dots[status] && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dots[status]}`} />}
      {label}
    </span>
  );
}
