/**
 * ShiftProgressCard — shared active-shift lifecycle card used on all three dashboards.
 *
 * Usage:
 *   <ActiveShiftsBanner
 *     shifts={normalizedShifts}   // see normalizeForBanner() helpers below
 *     role="co" | "facility" | "admin"
 *     viewAllLink="/co/applications"
 *     loading={false}
 *   />
 *
 * Normalise your data with one of:
 *   normalizeCOShift(app)            — from getMyCOApplications row
 *   normalizeFacilityShift(shift)    — from getFacilityShifts row
 *   normalizeAdminShift(shift)       — from getAdminActiveShifts row
 */

import { Link } from 'react-router-dom';
import { CheckCircle2, AlertTriangle, ArrowRight, Building2, User } from 'lucide-react';
import { Badge } from '../common/Badge';

// ── Constants ─────────────────────────────────────────────────────

export const ACTIVE_SHIFT_STATUSES = [
  'filled', 'confirmed', 'pending_checkin_approval',
  'in_progress', 'pending_checkout_approval',
  'disputed_checkin', 'disputed_checkout',
];

export const ACTIVE_SHIFT_SET = new Set(ACTIVE_SHIFT_STATUSES);

// Status priority for sorting (lower = more urgent)
export const ACTIVE_STATUS_PRIORITY = {
  disputed_checkin:          0,
  disputed_checkout:         1,
  pending_checkin_approval:  2,
  in_progress:               3,
  pending_checkout_approval: 4,
  filled:                    5,
  confirmed:                 6,
};

// ── Role-specific status description text ─────────────────────────

const STATUS_TEXT = {
  filled: {
    co:       "You've been selected! Accept or decline this offer.",
    facility: 'Offer sent — waiting for CO to respond.',
    admin:    'Offer sent — CO has 24 hours to respond.',
  },
  confirmed: {
    co:       'Confirmed — check in on shift day to start.',
    facility: 'CO confirmed — will check in on shift day.',
    admin:    'CO accepted. Shift is scheduled.',
  },
  pending_checkin_approval: {
    co:       'Checked in · waiting for facility to confirm.',
    facility: 'CO has checked in — confirm they are on-site.',
    admin:    'CO checked in, awaiting facility confirmation.',
  },
  in_progress: {
    co:       "Shift is live — check out when you're done.",
    facility: 'Shift in progress — CO is currently on-site.',
    admin:    'Shift currently active.',
  },
  pending_checkout_approval: {
    co:       'Checked out · waiting for facility to confirm.',
    facility: 'CO checked out — confirm to complete the shift.',
    admin:    'CO checked out, awaiting facility confirmation.',
  },
  disputed_checkin: {
    co:       'Check-in dispute raised — admin is reviewing.',
    facility: 'Check-in dispute raised — admin has been notified.',
    admin:    '⚠️ Check-in disputed — requires your resolution.',
  },
  disputed_checkout: {
    co:       'Check-out dispute raised — admin is reviewing.',
    facility: 'Check-out dispute raised — admin has been notified.',
    admin:    '⚠️ Check-out disputed — requires your resolution.',
  },
};

const ACCENT = {
  filled:                    'border-blue-300   bg-blue-50',
  confirmed:                 'border-indigo-300 bg-indigo-50',
  pending_checkin_approval:  'border-amber-300  bg-amber-50',
  in_progress:               'border-teal-300   bg-teal-50',
  pending_checkout_approval: 'border-orange-300 bg-orange-50',
  disputed_checkin:          'border-red-300    bg-red-50',
  disputed_checkout:         'border-red-300    bg-red-50',
};

// ── Stage derivation ──────────────────────────────────────────────

function getStages(status) {
  const s = status;
  return [
    {
      label: 'Offer',
      state: ['confirmed','pending_checkin_approval','in_progress','pending_checkout_approval',
        'completed','disputed_checkin','disputed_checkout'].includes(s)
        ? 'done' : s === 'filled' ? 'current' : 'upcoming',
    },
    {
      label: 'Check-in',
      state: ['in_progress','pending_checkout_approval','completed','disputed_checkout'].includes(s) ? 'done'
        : s === 'disputed_checkin'        ? 'disputed'
        : s === 'pending_checkin_approval' ? 'current' : 'upcoming',
    },
    {
      label: 'Active',
      state: ['pending_checkout_approval','completed','disputed_checkout'].includes(s) ? 'done'
        : s === 'in_progress' ? 'current' : 'upcoming',
    },
    {
      label: 'Check-out',
      state: s === 'completed'             ? 'done'
        : s === 'disputed_checkout'         ? 'disputed'
        : s === 'pending_checkout_approval' ? 'current' : 'upcoming',
    },
    { label: 'Done', state: s === 'completed' ? 'done' : 'upcoming' },
  ];
}

// ── Visual helpers ────────────────────────────────────────────────

const CIRCLE = {
  done:     'bg-emerald-500 border-emerald-500',
  current:  'bg-blue-500   border-blue-500',
  disputed: 'bg-amber-500  border-amber-500',
  upcoming: 'bg-white      border-gray-300',
};
const LINE  = { done: 'bg-emerald-400', other: 'bg-gray-200' };
const LABEL = {
  done:     'text-emerald-700 font-semibold',
  current:  'text-blue-700   font-bold',
  disputed: 'text-amber-700  font-bold',
  upcoming: 'text-gray-400',
};

function StageStep({ label, state, isLast }) {
  return (
    <div className="flex items-center flex-1 min-w-0">
      <div className="flex flex-col items-center">
        <div className="relative flex items-center justify-center">
          {state === 'current' && (
            <span className="absolute w-9 h-9 rounded-full bg-blue-400 animate-ping opacity-25" />
          )}
          <div className={`relative w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all duration-500 ${CIRCLE[state]}`}>
            {state === 'done'     && <CheckCircle2   className="w-3.5 h-3.5 text-white" />}
            {state === 'current'  && <span className="w-2 h-2 bg-white rounded-full" />}
            {state === 'disputed' && <AlertTriangle  className="w-3 h-3 text-white" />}
          </div>
        </div>
        <p className={`text-[10px] mt-1.5 whitespace-nowrap transition-colors duration-500 ${LABEL[state]}`}>
          {label}
        </p>
      </div>
      {!isLast && (
        <div className={`flex-1 h-0.5 mx-1.5 mb-4 transition-colors duration-500 ${state === 'done' ? LINE.done : LINE.other}`} />
      )}
    </div>
  );
}

// ── Single card ───────────────────────────────────────────────────

function ShiftProgressCard({ shift, role }) {
  const { status, shiftType, shiftDate, payAmount, facilityName, coName, linkTo } = shift;

  const accent  = ACCENT[status]   || ACCENT.confirmed;
  const roleKey = role || 'co';
  const text    = STATUS_TEXT[status]?.[roleKey] ?? '';
  const stages  = getStages(status);

  const dateStr = new Date(shiftDate + 'T00:00:00').toLocaleDateString('en-TZ', {
    weekday: 'short', day: 'numeric', month: 'short',
  });

  return (
    <div className={`rounded-2xl border-2 px-5 py-4 shadow-sm ${accent}`}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-bold text-gray-900 text-sm">{shiftType}</p>
            <span className="text-gray-300">·</span>
            <p className="text-xs text-gray-500">{dateStr}</p>
          </div>

          {/* Context line: facility (for CO/admin) and/or CO (for facility/admin) */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
            {facilityName && (
              <span className="flex items-center gap-1 text-xs text-gray-500">
                <Building2 className="w-3 h-3 text-gray-400 shrink-0" />
                {facilityName}
              </span>
            )}
            {coName && (
              <span className="flex items-center gap-1 text-xs text-gray-500">
                <User className="w-3 h-3 text-gray-400 shrink-0" />
                {coName}
              </span>
            )}
          </div>

          {/* Status text */}
          <p className="text-xs font-medium text-gray-700 mt-1.5">{text}</p>
        </div>

        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <Badge status={status} />
          <span className="text-xs font-bold text-gray-600">
            TZS {Number(payAmount || 0).toLocaleString()}
          </span>
        </div>
      </div>

      {/* 5-stage progress bar */}
      <div className="flex items-start w-full">
        {stages.map((stage, i) => (
          <StageStep
            key={i}
            label={stage.label}
            state={stage.state}
            isLast={i === stages.length - 1}
          />
        ))}
      </div>

      {/* Footer link */}
      <div className="mt-3 pt-3 border-t border-black/5 flex justify-end">
        <Link
          to={linkTo}
          className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-teal-600 transition-colors"
        >
          View &amp; take action <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
    </div>
  );
}

// ── Banner wrapper ────────────────────────────────────────────────

/**
 * Renders the "Active shifts · N" section with a card per shift.
 * Renders nothing when loading or shifts is empty.
 */
export function ActiveShiftsBanner({ shifts, role, viewAllLink, loading, maxVisible = 999 }) {
  if (loading || !shifts?.length) return null;

  const visible  = shifts.slice(0, maxVisible);
  const overflow = shifts.length - visible.length;

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
          Active shift{shifts.length !== 1 ? 's' : ''} · {shifts.length}
        </p>
        {viewAllLink && (
          <Link to={viewAllLink} className="text-xs text-teal-600 hover:underline font-medium">
            {overflow > 0 ? `+${overflow} more — View all →` : 'View all →'}
          </Link>
        )}
      </div>

      <div className="space-y-3">
        {visible.map((shift, i) => (
          <ShiftProgressCard key={shift.id ?? i} shift={shift} role={role} />
        ))}
      </div>
    </div>
  );
}

// ── Data normalisers (import & call in each dashboard) ────────────

/** CO dashboard: one row from getMyCOApplications */
export function normalizeCOShift(app) {
  const s = app.shifts;
  return {
    id:           app.id,
    status:       s?.status,
    shiftType:    s?.shift_type,
    shiftDate:    s?.shift_date,
    payAmount:    s?.pay_amount,
    facilityName: s?.facility_profiles?.facility_name ?? null,
    coName:       null,
    linkTo:       '/co/applications',
  };
}

/** Facility dashboard: one row from getFacilityShifts (needs co_user attached) */
export function normalizeFacilityShift(shift) {
  return {
    id:           shift.id,
    status:       shift.status,
    shiftType:    shift.shift_type,
    shiftDate:    shift.shift_date,
    payAmount:    shift.pay_amount,
    facilityName: null,                          // facility knows their own name
    coName:       shift.co_user?.display_name ?? null,
    linkTo:       `/facility/shifts/${shift.id}`,
  };
}

/** Admin dashboard: one row from getAdminActiveShifts */
export function normalizeAdminShift(shift) {
  return {
    id:           shift.id,
    status:       shift.status,
    shiftType:    shift.shift_type,
    shiftDate:    shift.shift_date,
    payAmount:    shift.pay_amount,
    facilityName: shift.facility_profiles?.facility_name ?? null,
    coName:       shift.co_user?.display_name ?? null,
    linkTo:       '/admin/shifts?status=disputed',
  };
}
