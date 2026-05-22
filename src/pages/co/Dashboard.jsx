import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, ClipboardList, CheckCircle2, Clock, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { getCODashboardStats, getMyCOApplications } from '../../lib/api';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { StatCard } from '../../components/common/Card';
import { StatCardSkeleton, ShiftCardSkeleton } from '../../components/common/Skeleton';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';

export default function CODashboard() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [stats, setStats] = useState(null);
  const [recentApps, setRecentApps] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    Promise.all([
      getCODashboardStats(user.id),
      getMyCOApplications(user.id),
    ]).then(([statsRes, appsRes]) => {
      setStats(statsRes);
      setRecentApps((appsRes.data || []).slice(0, 4));
    }).finally(() => setLoading(false));
  }, [user?.id]);

  return (
    <PageWrapper
      title={t('co.welcome', { name: user?.display_name || '' })}
      subtitle={t('co.activity')}
      action={<Button to="/co/shifts"><Search className="w-4 h-4" />{t('co.browse_shifts')}</Button>}
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <StatCard label={t('co.open_shifts')}      value={stats?.openShifts ?? 0}      icon={Search}       color="teal" />
            <StatCard label={t('co.my_applications')}  value={stats?.myApplications ?? 0}  icon={ClipboardList} color="blue" />
            <StatCard label={t('co.confirmed')}        value={stats?.confirmed ?? 0}        icon={CheckCircle2} color="purple" />
            <StatCard label={t('co.pending')}          value={stats?.pending ?? 0}          icon={Clock}        color="yellow" />
          </>
        )}
      </div>

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

function ApplicationRow({ app }) {
  const shift = app.shifts;
  return (
    <div className="flex items-center justify-between bg-white rounded-2xl border border-gray-100 px-5 py-4 shadow-sm hover:shadow-md transition-shadow">
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
        <ChevronRight className="w-4 h-4 text-gray-300" />
      </div>
    </div>
  );
}

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
