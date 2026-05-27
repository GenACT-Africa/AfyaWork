import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Search, ClipboardList, CheckCircle2, Clock, ChevronRight,
  Briefcase, AlertTriangle, TrendingUp, Wallet, ArrowRight, Sparkles,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { getCODashboardStats, getMyCOApplications, getCOProfile, getCOPaymentStats } from '../../lib/api';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { StatCard } from '../../components/common/Card';
import { StatCardSkeleton, ShiftCardSkeleton } from '../../components/common/Skeleton';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import {
  ActiveShiftsBanner, ACTIVE_SHIFT_SET, normalizeCOShift,
} from '../../components/shifts/ShiftProgressCard';

// ── Dashboard page ────────────────────────────────────────────────

export default function CODashboard() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [stats, setStats]           = useState(null);
  const [payStats, setPayStats]     = useState(null);
  const [allApps, setAllApps]       = useState([]);
  const [recentApps, setRecentApps] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [availStatus, setAvailStatus]       = useState(null);
  const [availDatePassed, setAvailDatePassed] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    Promise.all([
      getCODashboardStats(user.id),
      getMyCOApplications(user.id),
      getCOProfile(user.id),
      getCOPaymentStats(user.id),
    ]).then(([statsRes, appsRes, profileRes, payStatsRes]) => {
      setStats(statsRes);
      setPayStats(payStatsRes);
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
      {/* ── Earnings summary ── */}
      <EarningsCard stats={payStats} loading={loading} />

      {/* ── Active shifts live tracker ── */}
      <ActiveShiftsBanner
        shifts={allApps
          .filter((a) => a.shifts?.assigned_co_id === user?.id && ACTIVE_SHIFT_SET.has(a.shifts?.status))
          .map(normalizeCOShift)}
        role="co"
        viewAllLink="/co/applications"
        loading={loading}
      />

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

// ── EarningsCard ──────────────────────────────────────────────────

const MOTIVATING_MESSAGES = [
  { min: 0,         max: 0,         text: 'Browse shifts and start earning today.' },
  { min: 1,         max: 99_999,    text: 'Great start — keep picking up shifts!' },
  { min: 100_000,   max: 499_999,   text: 'You\'re building real momentum. 💪' },
  { min: 500_000,   max: 999_999,   text: 'Half a million earned — impressive work!' },
  { min: 1_000_000, max: 4_999_999, text: 'Over a million earned. You\'re a top performer!' },
  { min: 5_000_000, max: Infinity,  text: 'Elite earner. AfyaWork is working for you! 🏆' },
];

function getMotivatingMessage(totalEarned) {
  return MOTIVATING_MESSAGES.find((m) => totalEarned >= m.min && totalEarned <= m.max)?.text ?? '';
}

function EarningsCard({ stats, loading }) {
  if (loading) {
    return <div className="h-40 bg-gray-100 rounded-3xl animate-pulse mb-8" />;
  }

  const totalEarned      = stats?.totalEarned      ?? 0;
  const earnedThisMonth  = stats?.earnedThisMonth  ?? 0;
  const upcoming         = stats?.upcoming          ?? 0;
  const hasAnyActivity   = totalEarned > 0 || upcoming > 0;

  // ── No earnings yet — motivational empty state ─────────────────
  if (!hasAnyActivity) {
    return (
      <Link
        to="/co/shifts"
        className="flex items-center gap-5 mb-8 bg-gradient-to-br from-teal-50 to-emerald-50 border border-teal-100 rounded-3xl px-6 py-5 hover:shadow-md transition-all group"
      >
        <div className="w-14 h-14 bg-gradient-to-br from-teal-500 to-emerald-400 rounded-2xl flex items-center justify-center shrink-0 shadow-lg group-hover:scale-105 transition-transform">
          <TrendingUp className="w-7 h-7 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-gray-900 text-lg">Start earning today</p>
          <p className="text-sm text-gray-500 mt-0.5">
            Pick up a locum shift and your earnings will appear here after payment.
          </p>
        </div>
        <div className="flex items-center gap-1 text-sm font-semibold text-teal-600 whitespace-nowrap group-hover:translate-x-0.5 transition-transform">
          Browse shifts <ArrowRight className="w-4 h-4" />
        </div>
      </Link>
    );
  }

  // ── Has earnings — hero earnings card ──────────────────────────
  return (
    <Link to="/co/payments" className="block mb-8 group">
      <div className="relative overflow-hidden bg-gradient-to-br from-teal-600 via-teal-500 to-emerald-500 rounded-3xl px-6 py-6 shadow-lg shadow-teal-200 hover:shadow-xl hover:shadow-teal-200 transition-all">

        {/* Background decoration */}
        <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 rounded-full -translate-y-16 translate-x-16 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-white/5 rounded-full translate-y-12 -translate-x-12 pointer-events-none" />

        {/* Header row */}
        <div className="flex items-start justify-between mb-4 relative">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Wallet className="w-4 h-4 text-teal-200" />
              <p className="text-sm font-medium text-teal-100">Total Earned</p>
            </div>
            <p className="text-4xl font-black text-white tracking-tight">
              TZS {totalEarned.toLocaleString()}
            </p>
            <p className="text-sm text-teal-200 mt-1.5 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              {getMotivatingMessage(totalEarned)}
            </p>
          </div>
          <div className="w-10 h-10 bg-white/15 rounded-xl flex items-center justify-center group-hover:bg-white/25 transition-colors">
            <ArrowRight className="w-5 h-5 text-white group-hover:translate-x-0.5 transition-transform" />
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 gap-3 relative">
          <div className="bg-white/15 backdrop-blur-sm rounded-2xl px-4 py-3">
            <p className="text-xs text-teal-200 font-medium mb-0.5">This Month</p>
            <p className={`font-bold text-white ${earnedThisMonth >= 1_000_000 ? 'text-lg' : 'text-xl'}`}>
              {earnedThisMonth > 0 ? `TZS ${earnedThisMonth.toLocaleString()}` : '—'}
            </p>
          </div>
          <div className="bg-white/15 backdrop-blur-sm rounded-2xl px-4 py-3">
            <p className="text-xs text-teal-200 font-medium mb-0.5">Coming Soon</p>
            <p className={`font-bold ${upcoming > 0 ? 'text-white' : 'text-teal-300'} ${upcoming >= 1_000_000 ? 'text-lg' : 'text-xl'}`}>
              {upcoming > 0 ? `TZS ${upcoming.toLocaleString()}` : '—'}
            </p>
          </div>
        </div>

        {/* Footer */}
        <p className="text-xs text-teal-300 mt-3 relative text-right">
          Tap to view full payment history →
        </p>
      </div>
    </Link>
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
