/**
 * ShiftProgressTracker
 *
 * Real-time, animated 6-stage lifecycle tracker for every shift.
 * Used on both the CO (MyApplications) and Facility (ShiftDetail) sides.
 *
 * Props:
 *   shift            — full shift record (all timestamp fields)
 *   role             — 'co' | 'facility'
 *   myRating         — rating object { stars, published_at } or null
 *   coName           — CO display name (facility view)
 *   facilityName     — facility display name (CO view)
 *   facilityAddress  — facility address string (CO view, optional)
 *   onAccept         — fn (CO: accept offer)
 *   onDecline        — fn (CO: open decline modal)
 *   onCheckin        — fn (CO: check in)
 *   onCheckout       — fn (CO: check out)
 *   onApproveCheckin  — fn (facility)
 *   onDisputeCheckin  — fn (facility: open dispute modal)
 *   onApproveCheckout — fn (facility)
 *   onDisputeCheckout — fn (facility: open dispute modal)
 *   onRate           — fn (both: open rating modal)
 *   actionLoading    — string key of running action or null
 */

import { useState } from 'react';
import {
  CheckCircle2, LogIn, Activity, LogOut, CheckCircle, Star,
  AlertTriangle, ChevronDown, ChevronUp, MapPin,
} from 'lucide-react';
import { Button } from '../common/Button';

// ── Stage configuration ───────────────────────────────────────────

const STAGES = [
  { coLabel: 'Offer Accepted',  facilityLabel: 'CO Accepted Offer',  Icon: CheckCircle2 },
  { coLabel: 'Checked In',      facilityLabel: 'CO Checked In',       Icon: LogIn        },
  { coLabel: 'Shift Active',    facilityLabel: 'Shift Active',        Icon: Activity     },
  { coLabel: 'Checked Out',     facilityLabel: 'CO Checked Out',      Icon: LogOut       },
  { coLabel: 'Shift Complete',  facilityLabel: 'Shift Complete',      Icon: CheckCircle  },
  { coLabel: 'Rated',           facilityLabel: 'Rated',               Icon: Star         },
];

// ── Derive stage states from shift data ───────────────────────────

function deriveStages(shift, myRating) {
  const s = shift.status;
  return [
    {
      // 0 — Offer Accepted
      state: ['confirmed', 'pending_checkin_approval', 'in_progress', 'pending_checkout_approval',
        'completed', 'disputed_checkin', 'disputed_checkout'].includes(s) ? 'done' : 'upcoming',
      timestamp: shift.offer_responded_at,
    },
    {
      // 1 — Checked In
      state: s === 'disputed_checkin' ? 'disputed'
        : s === 'pending_checkin_approval' ? 'current'
        : ['in_progress', 'pending_checkout_approval', 'completed', 'disputed_checkout'].includes(s) ? 'done'
        : 'upcoming',
      timestamp: shift.checkin_at,
    },
    {
      // 2 — Shift Active
      state: s === 'in_progress' ? 'current'
        : ['pending_checkout_approval', 'completed', 'disputed_checkout'].includes(s) ? 'done'
        : 'upcoming',
      timestamp: shift.checkin_approved_at,
    },
    {
      // 3 — Checked Out
      state: s === 'disputed_checkout' ? 'disputed'
        : s === 'pending_checkout_approval' ? 'current'
        : s === 'completed' ? 'done'
        : 'upcoming',
      timestamp: shift.checkout_at,
    },
    {
      // 4 — Shift Complete
      state: s === 'completed' ? 'done' : 'upcoming',
      timestamp: shift.checkout_approved_at,
    },
    {
      // 5 — Rated
      state: myRating ? 'done' : s === 'completed' ? 'current' : 'upcoming',
      timestamp: myRating?.published_at || null,
    },
  ];
}

// ── Small helpers ─────────────────────────────────────────────────

function fmtTime(ts) {
  if (!ts) return null;
  return new Date(ts).toLocaleTimeString('en-TZ', { timeStyle: 'short' });
}

function fmtDateTime(ts) {
  if (!ts) return null;
  return new Date(ts).toLocaleString('en-TZ', { dateStyle: 'short', timeStyle: 'short' });
}

const LABEL_CLS = {
  done:     'text-green-700 font-medium',
  current:  'text-blue-600 font-bold',
  disputed: 'text-amber-700 font-bold',
  upcoming: 'text-gray-400',
};

const LINE_CLS = {
  done:     'bg-green-400',
  other:    'bg-gray-200',
};

// ── Stage circle ──────────────────────────────────────────────────

function StageCircle({ state, Icon }) {
  const ring = {
    done:     'bg-green-500 border-green-500',
    current:  'bg-blue-500 border-blue-500',
    disputed: 'bg-amber-500 border-amber-500',
    upcoming: 'bg-white border-gray-300',
  };
  const iconCls = state === 'upcoming' ? 'text-gray-300' : 'text-white';

  return (
    <div className="relative flex items-center justify-center shrink-0">
      {state === 'current' && (
        <span className="absolute w-10 h-10 rounded-full bg-blue-400 animate-ping opacity-30" />
      )}
      <div className={`relative w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all duration-500 ${ring[state] || ring.upcoming}`}>
        {state === 'disputed'
          ? <AlertTriangle className="w-4 h-4 text-white" />
          : <Icon className={`w-4 h-4 ${iconCls} transition-colors duration-500`} />
        }
      </div>
    </div>
  );
}

// ── Horizontal stage item (desktop) ──────────────────────────────

function StageHorizontal({ cfg, stage, role, isFirst, isLast, prevDone }) {
  const label = stage.state === 'disputed'
    ? 'Under Review'
    : (role === 'co' ? cfg.coLabel : cfg.facilityLabel);

  const leftLineCls  = prevDone ? LINE_CLS.done : LINE_CLS.other;
  const rightLineCls = stage.state === 'done' ? LINE_CLS.done : LINE_CLS.other;

  return (
    <div className="flex-1 flex flex-col items-center min-w-0">
      {/* Circle row */}
      <div className="flex items-center w-full">
        {!isFirst  && <div className={`flex-1 h-0.5 transition-colors duration-500 ${leftLineCls}`}  />}
        <StageCircle state={stage.state} Icon={cfg.Icon} />
        {!isLast   && <div className={`flex-1 h-0.5 transition-colors duration-500 ${rightLineCls}`} />}
      </div>

      {/* Label + timestamp */}
      <div className="mt-2 text-center px-0.5 w-full">
        <p className={`text-[11px] leading-tight transition-colors duration-500 ${LABEL_CLS[stage.state]}`}>
          {label}
        </p>
        {stage.state === 'done' && stage.timestamp && (
          <p className="text-[10px] text-gray-400 mt-0.5">{fmtTime(stage.timestamp)}</p>
        )}
        {stage.state === 'current' && (
          <p className="text-[10px] text-blue-500 mt-0.5 animate-pulse">In progress</p>
        )}
      </div>
    </div>
  );
}

// ── Vertical stage item (mobile) ──────────────────────────────────

function StageVertical({ cfg, stage, role, isLast }) {
  const label = stage.state === 'disputed'
    ? 'Under Review'
    : (role === 'co' ? cfg.coLabel : cfg.facilityLabel);
  const lineCls = stage.state === 'done' ? LINE_CLS.done : LINE_CLS.other;

  return (
    <div className="flex gap-3">
      {/* Circle + line */}
      <div className="flex flex-col items-center">
        <StageCircle state={stage.state} Icon={cfg.Icon} />
        {!isLast && (
          <div className={`w-0.5 flex-1 min-h-[20px] mt-1 mb-1 transition-colors duration-500 ${lineCls}`} />
        )}
      </div>

      {/* Label + time */}
      <div className={`flex-1 min-w-0 ${!isLast ? 'pb-3' : ''}`}>
        <p className={`text-sm transition-colors duration-500 ${LABEL_CLS[stage.state]}`}>{label}</p>
        {stage.state === 'done' && stage.timestamp && (
          <p className="text-xs text-gray-400 mt-0.5">{fmtDateTime(stage.timestamp)}</p>
        )}
        {stage.state === 'current' && (
          <p className="text-xs text-blue-500 mt-0.5 animate-pulse">In progress</p>
        )}
      </div>
    </div>
  );
}

// ── Closed state (cancelled / no-show) ───────────────────────────

function ClosedState({ shift, coName, facilityName, role }) {
  const s = shift.status;
  const isNoShow = s === 'no_show';

  let message;
  if (isNoShow) {
    message = 'Shift closed — No-show recorded';
  } else if (shift.cancelled_by === 'co') {
    message = `Shift cancelled by ${role === 'co' ? 'you' : (coName || 'the CO')}`;
  } else if (shift.cancelled_by === 'facility') {
    message = `Shift cancelled by ${role === 'facility' ? 'you' : (facilityName || 'the facility')}`;
  } else {
    message = 'Shift cancelled';
  }

  return (
    <div className="flex items-start gap-3 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl">
      <AlertTriangle className="w-5 h-5 text-gray-400 mt-0.5 shrink-0" />
      <div>
        <p className="text-sm font-semibold text-gray-700">⚠️ {message}</p>
        {shift.cancellation_reason && (
          <p className="text-xs text-gray-500 mt-0.5 italic">"{shift.cancellation_reason}"</p>
        )}
      </div>
    </div>
  );
}

// ── Action panel wrapper ──────────────────────────────────────────

const PANEL_BG = {
  blue:    'bg-blue-50 border-blue-100',
  indigo:  'bg-indigo-50 border-indigo-100',
  amber:   'bg-amber-50 border-amber-100',
  teal:    'bg-teal-50 border-teal-100',
  orange:  'bg-orange-50 border-orange-100',
  emerald: 'bg-emerald-50 border-emerald-100',
  red:     'bg-red-50 border-red-100',
  gray:    'bg-gray-50 border-gray-200',
};

function ActionPanel({ bg, title, body, children }) {
  return (
    <div className={`rounded-xl border px-4 py-4 ${PANEL_BG[bg] || PANEL_BG.gray}`}>
      {title && <p className="font-semibold text-gray-900">{title}</p>}
      {body  && <p className="text-sm text-gray-600 mt-0.5">{body}</p>}
      {children}
    </div>
  );
}

// ── Next Action: CO view ──────────────────────────────────────────

function CONextAction({
  shift, myRating, facilityName, facilityAddress,
  onAccept, onDecline, onCheckin, onCheckout, onRate,
  actionLoading,
}) {
  const s = shift.status;
  const dateStr = new Date(shift.shift_date + 'T00:00:00')
    .toLocaleDateString('en-TZ', { weekday: 'long', day: 'numeric', month: 'long' });

  if (s === 'filled') {
    return (
      <ActionPanel bg="blue" title="🎉 You've been selected for this shift!">
        <p className="text-sm text-gray-600 mt-0.5">Review and respond to this offer. It expires in 24 hours.</p>
        <div className="flex flex-wrap gap-2 mt-3">
          <Button size="sm" loading={actionLoading === 'accept'} disabled={!!actionLoading && actionLoading !== 'accept'} onClick={onAccept}>
            <CheckCircle2 className="w-4 h-4" /> Accept Offer
          </Button>
          <Button variant="secondary" size="sm" disabled={!!actionLoading} onClick={onDecline}>
            Decline
          </Button>
        </div>
      </ActionPanel>
    );
  }

  if (s === 'confirmed') {
    return (
      <ActionPanel bg="indigo">
        <p className="font-semibold text-gray-900">Your shift is confirmed.</p>
        <p className="text-sm text-gray-600 mt-0.5">
          {dateStr} · {shift.shift_type}
        </p>
        {(facilityName || facilityAddress) && (
          <p className="text-sm text-gray-500 mt-0.5 flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5 shrink-0" />
            {facilityName}{facilityAddress ? ` — ${facilityAddress}` : ''}
          </p>
        )}
        <div className="mt-3">
          <Button size="sm" loading={actionLoading === 'checkin'} onClick={onCheckin}>
            <LogIn className="w-4 h-4" /> Check In Now
          </Button>
        </div>
      </ActionPanel>
    );
  }

  if (s === 'pending_checkin_approval') {
    return (
      <ActionPanel bg="amber"
        title="Check-in submitted."
        body={`Waiting for ${facilityName || 'the facility'} to confirm you're on-site. You'll be notified.`}
      />
    );
  }

  if (s === 'in_progress') {
    const startedAt = shift.checkin_approved_at ? fmtTime(shift.checkin_approved_at) : null;
    return (
      <ActionPanel bg="teal">
        <p className="font-semibold text-gray-900">🟢 Your shift is active.</p>
        {startedAt && <p className="text-sm text-gray-600 mt-0.5">Started at {startedAt}. Check out when you're done.</p>}
        <div className="mt-3">
          <Button size="sm" loading={actionLoading === 'checkout'} onClick={onCheckout}>
            <LogOut className="w-4 h-4" /> Check Out
          </Button>
        </div>
      </ActionPanel>
    );
  }

  if (s === 'pending_checkout_approval') {
    return (
      <ActionPanel bg="orange"
        title="Check-out submitted."
        body={`Waiting for ${facilityName || 'the facility'} to confirm. You'll be notified when the shift is marked complete.`}
      />
    );
  }

  if (s === 'completed' && !myRating) {
    return (
      <ActionPanel bg="emerald">
        <p className="font-semibold text-gray-900">Shift complete! How was {facilityName || 'your experience'}?</p>
        <p className="text-sm text-gray-500 mt-0.5">This option closes in 48 hours.</p>
        <div className="mt-3">
          <Button size="sm" loading={actionLoading === 'rate'} onClick={onRate}>
            <Star className="w-4 h-4" /> Rate Now
          </Button>
        </div>
      </ActionPanel>
    );
  }

  if (s === 'disputed_checkin' || s === 'disputed_checkout') {
    return (
      <ActionPanel bg="red"
        title={`A dispute has been raised by ${facilityName || 'the facility'}.`}
        body="Admin is reviewing and will resolve within 24 hours. You will be notified of the outcome."
      />
    );
  }

  return null;
}

// ── Next Action: Facility view ────────────────────────────────────

function FacilityNextAction({
  shift, myRating, coName,
  onApproveCheckin, onDisputeCheckin, onApproveCheckout, onDisputeCheckout, onRate,
  actionLoading,
}) {
  const s = shift.status;
  const co = coName || 'The CO';

  const checkinTime  = fmtTime(shift.checkin_at);
  const checkoutTime = fmtTime(shift.checkout_at);
  const dateStr = new Date(shift.shift_date + 'T00:00:00')
    .toLocaleDateString('en-TZ', { weekday: 'long', day: 'numeric', month: 'long' });

  // Hours worked
  let hoursWorked = null;
  if (shift.checkout_at && shift.checkin_approved_at) {
    const ms   = new Date(shift.checkout_at) - new Date(shift.checkin_approved_at);
    const hrs  = Math.floor(ms / 3_600_000);
    const mins = Math.round((ms % 3_600_000) / 60_000);
    hoursWorked = `${hrs}h ${mins}m`;
  }

  if (s === 'filled') {
    return (
      <ActionPanel bg="indigo"
        title={`Offer sent to ${co}.`}
        body={`Waiting for ${co} to accept. They have 24 hours to respond.`}
      />
    );
  }

  if (s === 'confirmed') {
    return (
      <ActionPanel bg="indigo"
        title={`${co} has accepted the offer.`}
        body={`Scheduled: ${dateStr} · ${shift.shift_type}. You will be notified when they check in.`}
      />
    );
  }

  if (s === 'pending_checkin_approval') {
    return (
      <ActionPanel bg="amber">
        <p className="font-semibold text-gray-900">{co} has checked in{checkinTime ? ` at ${checkinTime}` : ''}.</p>
        <p className="text-sm text-gray-600 mt-0.5">Confirm they are on-site to start the shift clock.</p>
        <div className="flex flex-wrap gap-2 mt-3">
          <Button size="sm" loading={actionLoading === 'approve-checkin'} disabled={!!actionLoading && actionLoading !== 'approve-checkin'} onClick={onApproveCheckin}>
            <CheckCircle className="w-4 h-4" /> Approve Check-in
          </Button>
          <Button variant="secondary" size="sm" disabled={!!actionLoading} onClick={onDisputeCheckin}>
            <AlertTriangle className="w-4 h-4" /> Dispute
          </Button>
        </div>
      </ActionPanel>
    );
  }

  if (s === 'in_progress') {
    return (
      <ActionPanel bg="teal"
        title={`🟢 Shift is in progress.`}
        body={`${co} is on-site. You'll be notified when they check out.`}
      />
    );
  }

  if (s === 'pending_checkout_approval') {
    return (
      <ActionPanel bg="orange">
        <p className="font-semibold text-gray-900">{co} has checked out{checkoutTime ? ` at ${checkoutTime}` : ''}.</p>
        {hoursWorked && <p className="text-sm text-gray-600 mt-0.5">Total hours worked: {hoursWorked}</p>}
        <p className="text-sm text-gray-600 mt-0.5">Confirm to mark the shift complete and release payment.</p>
        <div className="flex flex-wrap gap-2 mt-3">
          <Button size="sm" loading={actionLoading === 'approve-checkout'} disabled={!!actionLoading && actionLoading !== 'approve-checkout'} onClick={onApproveCheckout}>
            <CheckCircle className="w-4 h-4" /> Approve Checkout
          </Button>
          <Button variant="secondary" size="sm" disabled={!!actionLoading} onClick={onDisputeCheckout}>
            <AlertTriangle className="w-4 h-4" /> Dispute
          </Button>
        </div>
      </ActionPanel>
    );
  }

  if (s === 'completed' && !myRating) {
    return (
      <ActionPanel bg="emerald">
        <p className="font-semibold text-gray-900">Shift complete! How did {co} perform?</p>
        <p className="text-sm text-gray-500 mt-0.5">This option closes in 48 hours.</p>
        <div className="mt-3">
          <Button size="sm" loading={actionLoading === 'rate'} onClick={onRate}>
            <Star className="w-4 h-4" /> Rate Now
          </Button>
        </div>
      </ActionPanel>
    );
  }

  if (s === 'disputed_checkin' || s === 'disputed_checkout') {
    return (
      <ActionPanel bg="red"
        title="You have raised a dispute on this shift."
        body="Admin is reviewing and will resolve within 24 hours. You will be notified of the outcome."
      />
    );
  }

  return null;
}

// ── Main export ───────────────────────────────────────────────────

export function ShiftProgressTracker({
  shift, role, myRating,
  coName, facilityName, facilityAddress,
  onAccept, onDecline, onCheckin, onCheckout,
  onApproveCheckin, onDisputeCheckin, onApproveCheckout, onDisputeCheckout,
  onRate,
  actionLoading,
}) {
  const status   = shift.status;
  const isClosed = ['cancelled', 'no_show'].includes(status);

  // Completed + rated → default collapsed
  const isFullyDone = status === 'completed' && !!myRating;
  const [expanded, setExpanded] = useState(!isFullyDone);

  // ── Closed state ──
  if (isClosed) {
    return (
      <ClosedState
        shift={shift}
        coName={coName}
        facilityName={facilityName}
        role={role}
      />
    );
  }

  const stages = deriveStages(shift, myRating);

  return (
    <div className="space-y-3">
      {/* Collapse toggle for fully completed+rated shifts */}
      {isFullyDone && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 bg-emerald-50 border border-emerald-100 rounded-xl text-sm font-semibold text-emerald-800 hover:bg-emerald-100 transition-colors"
        >
          <span className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-600" />
            Completed
            {shift.checkout_approved_at && (
              <span className="font-normal text-emerald-600">
                — {new Date(shift.checkout_approved_at).toLocaleDateString('en-TZ', { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
            )}
            <span className="text-xs text-emerald-600">· Rated ⭐</span>
          </span>
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      )}

      {expanded && (
        <>
          {/* ── Horizontal tracker (md+) ── */}
          <div className="hidden md:block px-2 py-2">
            <div className="flex items-start">
              {STAGES.map((cfg, i) => (
                <StageHorizontal
                  key={i}
                  cfg={cfg}
                  stage={stages[i]}
                  role={role}
                  isFirst={i === 0}
                  isLast={i === STAGES.length - 1}
                  prevDone={i > 0 && stages[i - 1].state === 'done'}
                />
              ))}
            </div>
          </div>

          {/* ── Vertical tracker (mobile) ── */}
          <div className="md:hidden px-1 py-2">
            {STAGES.map((cfg, i) => (
              <StageVertical
                key={i}
                cfg={cfg}
                stage={stages[i]}
                role={role}
                isLast={i === STAGES.length - 1}
              />
            ))}
          </div>

          {/* ── Next Action block — hidden for fully done shifts ── */}
          {!isFullyDone && (
            role === 'co' ? (
              <CONextAction
                shift={shift}
                myRating={myRating}
                facilityName={facilityName}
                facilityAddress={facilityAddress}
                onAccept={onAccept}
                onDecline={onDecline}
                onCheckin={onCheckin}
                onCheckout={onCheckout}
                onRate={onRate}
                actionLoading={actionLoading}
              />
            ) : (
              <FacilityNextAction
                shift={shift}
                myRating={myRating}
                coName={coName}
                onApproveCheckin={onApproveCheckin}
                onDisputeCheckin={onDisputeCheckin}
                onApproveCheckout={onApproveCheckout}
                onDisputeCheckout={onDisputeCheckout}
                onRate={onRate}
                actionLoading={actionLoading}
              />
            )
          )}

          {/* Collapse link after expanded full timeline */}
          {isFullyDone && (
            <button
              onClick={() => setExpanded(false)}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              <ChevronUp className="w-3 h-3" /> Collapse timeline
            </button>
          )}
        </>
      )}
    </div>
  );
}
