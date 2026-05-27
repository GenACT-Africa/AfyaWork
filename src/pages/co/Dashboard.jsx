import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Search, ClipboardList, CheckCircle2, Clock, ChevronRight,
  Briefcase, AlertTriangle, CalendarDays, ArrowRight,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { getCODashboardStats, getMyCOApplications, getCOProfile } from '../../lib/api';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { StatCard } from '../../components/common/Card';
import { StatCardSkeleton, ShiftCardSkeleton } from '../../components/common/Skeleton';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';

// ── Active shift lifecycle banner ─────────────────────────────────

const ACTIVE_STATUSES = new Set([
  'filled', 'confirmed', 'pending_checkin_approval',
  'in_progress', 'pending_checkout_approval',
  'disputed_checkin', 'disputed_checkout',
]);

const STATUS_INFO = {
  filled:                    { text: "You've been selected! Accept or decline this offer.",  accent: 'border-blue-300 bg-blue-50',    dot: 'bg-blue-500'   },
  confirmed:                 { text: 'Confirmed — check in on shift day to start.',           accent: 'border-indigo-300 bg-indigo-50', dot: 'bg-indigo-500' },
  pending_checkin_approval:  { text: 'Checked in · waiting for facility to confirm.',         accent: 'border-amber-300 bg-amber-50',   dot: 'bg-amber-500'  },
  in_progress:               { text: "Shift is live — check out when you're done.",           accent: 'border-teal-300 bg-teal-50',     dot: 'bg-teal-500'   },
  pending_checkout_approval: { text: 'Checked out · waiting for facility to confirm.',        accent: 'border-orange-300 bg-orange-50', dot: 'bg-orange-500' },
  disputed_checkin:          { text: 'Check-in dispute raised — admin is reviewing.',         accent: 'border-red-300 bg-red-50',       dot: 'bg-red-500'    },
  disputed_checkout:         { text: 'Check-out dispute raised — admin is reviewing.',        accent: 'border-red-300 bg-red-50',       dot: 'bg-red-500'    },
};

function getStages(status) {
  const s = status;
  return [
    {
      label: 'Offer',
      state: ['confirmed','pending_checkin_approval','in_progress','pending_checkout_approval','completed','disputed_checkin','disputed_checkout'].includes(s)
        ? 'done' : s === 'filled' ? 'current' : 'upcoming',
    },
    {
      label: 'Check-in',
      state: ['in_progress','pending_checkout_approval','completed','disputed_checkout'].includes(s) ? 'done'
        : s === 'disputed_checkin' ? 'disputed'
        : s === 'pending_checkin_approval' ? 'current' : 'upcoming',
    },
    {
      label: 'Active',
      state: ['pending_checkout_approval','completed','disputed_checkout'].includes(s) ? 'done'
        : s === 'in_progress' ? 'current' : 'upcoming',
    },
    {
      label: 'Check-out',
      state: s === 'completed' ? 'done'
        : s === 'disputed_checkout' ? 'disputed'
        : s === 'pending_checkout_approval' ? 'current' : 'upcoming',
    },
    { label: 'Done', state: s === 'completed' ? 'done' : 'upcoming' },
  ];
}

const CIRCLE = {
  done:     'bg-emerald-500 border-emerald-500',
  current:  'bg-blue-500   border-blue-500',
  disputed: 'bg-amber-500  border-amber-500',
  upcoming: 'bg-white      border-gray-300',
};
const ICON_COLOR = { done: 'text-white', current: 'text-white', disputed: 'text-white', upcoming: 'text-gray-300' };
const LINE_COLOR  = { done: 'bg-emerald-400', other: 'bg-gray-200' };
const LABEL_COLOR = { done: 'text-emerald-700 font-semibold', current: 'text-blue-700 font-bold', disputed: 'text-amber-700 font-bold', upcoming: 'text-gray-400' };

function StageStep({ label, state, isLast }) {
  return (
    <div className="flex items-center flex-1 min-w-0">
      <div className="flex flex-col items-center">
        {/* Pulse ring for current */}
        <div className="relative flex items-center justify-center">
          {state === 'current' && (
            <span className="absolute w-9 h-9 rounded-full bg-blue-400 animate-ping opacity-25" />
          )}
          <div className={`relative w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all duration-500 ${CIRCLE[state]}`}>
            {state === 'done' && <CheckCircle2 className={`w-3.5 h-3.5 ${ICON_COLOR.done}`} />}
            {state === 'current' && <span className="w-2 h-2 bg-white rounded-full" />}
            {state === 'disputed' && <AlertTriangle className={`w-3 h-3 ${ICON_COLOR.disputed}`} />}
          </div>
        </div>
        <p className={`text-[10px] mt-1.5 whitespace-nowrap transition-colors duration-500 ${LABEL_COLOR[state]}`}>{label}</p>
      </div>
      {!isLast && (
        <div className={`flex-1 h-0.5 mx-1.5 mb-4 transition-colors duration-500 ${state === 'done' ? LINE_COLOR.done : LINE_COLOR.other}`} />
      )}
    </div>
  );
}

function ActiveShiftCard({ app }) {
  const shift    = app.shifts;
  const facility = shift?.facility_profiles;
  const status   = shift?.status;
  const info     = STATUS_INFO[status] || STATUS_INFO.confirmed;
  const stages   = getStages(status);

  const shiftDate = new Date(shift?.shift_date + 'T00:00:00').toLocaleDateString('en-TZ', {
    weekday: 'short', day: 'numeric', month: 'short',
  });

  return (
    <div className={`rounded-2xl border-2 px-5 py-4 shadow-sm ${info.accent}`}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-3">
          <div className="hidden sm:flex w-9 h-9 bg-white/70 rounded-xl items-center justify-center shrink-0 border border-white/80 shadow-sm">
            <CalendarDays className="w-4.5 h-4.5 text-gray-500" />
          </div>
          <div>
            <p className="font-bold text-gray-900 text-sm leading-tight">{shift?.shift_type}</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {facility?.facility_name} · {shiftDate}
            </p>
            {/* Status description */}
            <p className="text-xs font-medium mt-1.5 text-gray-700">{info.text}</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <Badge status={status} />
          <span className="text-xs font-bold text-gray-700">TZS {shift?.pay_amount?.toLocaleString()}</span>
        </div>
      </div>

      {/* 5-stage progress bar */}
      <div className="flex items-start w-full">
        {stages.map((stage, i) => (
          <StageStep key={i} label={stage.label} state={stage.state} isLast={i === stages.length - 1} />
        ))}
      </div>

      {/* Go to My Applications */}
      <div className="mt-3 pt-3 border-t border-black/5 flex justify-end">
        <Link
          to="/co/applications"
          className="inline-flex items-center gap-1 text-xs font-semibold text-gray-600 hover:text-teal-600 transition-colors"
        >
          View &amp; take action <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
    </div>
  );
}

function ActiveShiftsBanner({ apps, userId, loading }) {
  const active = apps.filter((a) =>
    a.shifts?.assigned_co_id === userId && ACTIVE_STATUSES.has(a.shifts?.status)
  );

  if (loading || active.length === 0) return null;

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
          Active shift{active.length !== 1 ? 's' : ''} · {active.length}
        </p>
        <Link to="/co/applications" className="text-xs text-teal-600 hover:underline font-medium">
          View all →
        </Link>
      </div>
      <div className="space-y-3">
        {active.map((app) => (
          <ActiveShiftCard key={app.id} app={app} />
        ))}
      </div>
    </div>
  );
}

// ── Dashboard page ────────────────────────────────────────────────

export default function CODashboard() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [stats, setStats]         = useState(null);
  const [allApps, setAllApps]     = useState([]);
  const [recentApps, setRecentApps] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [availStatus, setAvailStatus]       = useState(null);
  const [availDatePassed, setAvailDatePassed] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    Promise.all([
      getCODashboardStats(user.id),
      getMyCOApplications(user.id),
      getCOProfile(user.id),
    ]).then(([statsRes, appsRes, profileRes]) => {
      setStats(statsRes);
      const apps = appsRes.data || [];
      setAllApps(apps);
      setRecentApps(apps.slice(0, 4));

      const p = profileRes.data;
      if (!p?.employment_availability_status) {
        setAvailStatus(false);
      } else {
        setAvailStatus(p.employment_availability_status);
        if (p.available_from_date && !p.available_from_immediately) {
          const d = new Date(String(p.available_from_date) + 'T00:00:00');
          const now = new Date();
          if (
            d.getFullYear() < now.getFullYear() ||
            (d.getFullYear() === now.getFullYear() && d.getMonth() < now.getMonth())
          ) {
            setAvailDatePassed(true);
          }
        }
      }
    }).finally(() => setLoading(false));
  }, [user?.id]);

  return (
    <PageWrapper
      title={t('co.welcome', { name: user?.display_name || '' })}
      subtitle={t('co.activity')}
      action={<Button to="/co/shifts"><Search className="w-4 h-4" />{t('co.browse_shifts')}</Button>}
    >
      {/* ── Active shifts live tracker (below header, above stat cards) ── */}
      <ActiveShiftsBanner apps={allApps} userId={user?.id} loading={loading} />

      {/* Employment availability prompts */}
      {!loading && availStatus === false && (
        <div className="mb-6 flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-2xl px-5 py-4">
          <Briefcase className="w-5 h-5 text-blue-500 shrink-0" />
          <p className="text-sm text-blue-800 flex-1">
            <span className="font-semibold">Let facilities know if you're open to full-time work.</span>
            {' '}Update your availability to appear in permanent hire searches.
          </p>
          <Link to="/co/profile" className="text-sm font-semibold text-blue-600 hover:text-blue-700 whitespace-nowrap">
            Update →
          </Link>
        </div>
      )}

      {!loading && availDatePassed && (
        <div className="mb-6 flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4">
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
          <p className="text-sm text-amber-800 flex-1">
            <span className="font-semibold">Your availability date has passed.</span>
            {' '}Please update your employment availability so facilities see accurate information.
          </p>
          <Link to="/co/profile" className="text-sm font-semibold text-amber-600 hover:text-amber-700 whitespace-nowrap">
            Update →
          </Link>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <StatCard label={t('co.open_shifts')}     value={stats?.openShifts ?? 0}     icon={Search}       color="teal"   to="/co/shifts" />
            <StatCard label={t('co.my_applications')} value={stats?.myApplications ?? 0} icon={ClipboardList} color="blue"  to="/co/applications" />
            <StatCard label={t('co.confirmed')}       value={stats?.confirmed ?? 0}       icon={CheckCircle2} color="purple" to="/co/applications" />
            <StatCard label={t('co.pending')}         value={stats?.pending ?? 0}         icon={Clock}        color="yellow" to="/co/applications" />
          </>
        )}
      </div>

      {/* Recent applications */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">{t('co.recent_applications')}</h2>
          <Link to="/co/applications" className="text-sm text-teal-600 hover:underline font-medium">{t('co.view_all')}</Link>
        </div>

        {loading ? (
          <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <ShiftCardSkeleton key={i} />)}</div>
        ) : recentApps.length === 0 ? (
          <EmptyState t={t} />
        ) : (
          <div className="space-y-3">
            {recentApps.map((app) => <ApplicationRow key={app.id} app={app} />)}
          </div>
        )}
      </div>
    </PageWrapper>
  );
}

// ── ApplicationRow ────────────────────────────────────────────────

function ApplicationRow({ app }) {
  const shift = app.shifts;
  return (
    <Link
      to="/co/applications"
      className="flex items-center justify-between bg-white rounded-2xl border border-gray-100 px-5 py-4 shadow-sm hover:border-teal-200 hover:shadow-md transition-all group"
    >
      <div className="flex items-center gap-4">
        <div className="hidden sm:flex w-10 h-10 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl items-center justify-center shrink-0 border border-blue-100">
          <ClipboardList className="w-5 h-5 text-blue-500" />
        </div>
        <div>
          <p className="font-semibold text-gray-900">{shift?.shift_type}</p>
          <p className="text-sm text-gray-400">
            {shift?.facility_profiles?.facility_name}{' · '}
            {new Date(shift?.shift_date + 'T00:00:00').toLocaleDateString('en-TZ', { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-700 font-bold hidden sm:block">TZS {shift?.pay_amount?.toLocaleString()}</span>
        <Badge status={app.status} />
        <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-teal-500 transition-colors" />
      </div>
    </Link>
  );
}

// ── EmptyState ────────────────────────────────────────────────────

function EmptyState({ t }) {
  return (
    <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-gray-200">
      <div className="w-16 h-16 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-blue-100">
        <ClipboardList className="w-8 h-8 text-blue-400" />
      </div>
      <p className="font-semibold text-gray-700">{t('co.no_applications')}</p>
      <p className="text-sm text-gray-400 mt-1 mb-5">{t('co.browse_to_start')}</p>
      <Button to="/co/shifts" size="sm"><Search className="w-4 h-4" />{t('co.browse_shifts')}</Button>
    </div>
  );
}
