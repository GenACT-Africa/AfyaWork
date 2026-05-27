import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Search, ClipboardList, CheckCircle2, Clock, ChevronRight,
  Briefcase, AlertTriangle,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { getCODashboardStats, getMyCOApplications, getCOProfile } from '../../lib/api';
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
