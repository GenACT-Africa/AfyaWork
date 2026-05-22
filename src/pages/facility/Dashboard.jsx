import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, CheckCircle2, Users, XCircle, Plus, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { getFacilityDashboardStats, getFacilityShifts } from '../../lib/api';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { StatCard } from '../../components/common/Card';
import { StatCardSkeleton, ShiftCardSkeleton } from '../../components/common/Skeleton';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';

export default function FacilityDashboard() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [stats, setStats] = useState(null);
  const [recentShifts, setRecentShifts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    Promise.all([
      getFacilityDashboardStats(user.id),
      getFacilityShifts(user.id),
    ]).then(([statsRes, shiftsRes]) => {
      setStats(statsRes);
      setRecentShifts((shiftsRes.data || []).slice(0, 5));
    }).finally(() => setLoading(false));
  }, [user?.id]);

  return (
    <PageWrapper
      title={t('facility.welcome', { name: user?.display_name || '' })}
      subtitle={t('facility.overview')}
      action={<Button to="/facility/post-shift"><Plus className="w-4 h-4" />{t('facility.post_shift')}</Button>}
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <StatCard label={t('facility.open_shifts')}       value={stats?.openShifts ?? 0}       icon={CalendarDays}  color="teal" />
            <StatCard label={t('facility.filled_shifts')}     value={stats?.filledShifts ?? 0}     icon={CheckCircle2}  color="blue" />
            <StatCard label={t('facility.pending_applicants')} value={stats?.pendingApplicants ?? 0} icon={Users}         color="yellow" />
            <StatCard label={t('facility.cancelled')}         value={stats?.cancelledShifts ?? 0}  icon={XCircle}       color="red" />
          </>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">{t('facility.recent_shifts')}</h2>
          <Link to="/facility/shifts" className="text-sm text-teal-600 hover:underline font-medium">{t('facility.view_all')}</Link>
        </div>

        {loading ? (
          <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <ShiftCardSkeleton key={i} />)}</div>
        ) : recentShifts.length === 0 ? (
          <EmptyShifts t={t} />
        ) : (
          <div className="space-y-3">
            {recentShifts.map((shift) => <FacilityShiftRow key={shift.id} shift={shift} t={t} />)}
          </div>
        )}
      </div>
    </PageWrapper>
  );
}

function FacilityShiftRow({ shift, t }) {
  const count = shift.applicant_count ?? 0;
  return (
    <Link
      to={`/facility/shifts/${shift.id}`}
      className="flex items-center justify-between bg-white rounded-2xl border border-gray-100 px-5 py-4 hover:border-teal-200 hover:shadow-md transition-all group shadow-sm"
    >
      <div className="flex items-center gap-4">
        <div className="hidden sm:flex w-10 h-10 bg-gradient-to-br from-teal-50 to-emerald-50 rounded-xl items-center justify-center shrink-0 border border-teal-100">
          <CalendarDays className="w-5 h-5 text-teal-600" />
        </div>
        <div>
          <p className="font-semibold text-gray-900">{shift.shift_type}</p>
          <p className="text-sm text-gray-400">
            {new Date(shift.shift_date + 'T00:00:00').toLocaleDateString('en-TZ', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
            {' · '}TZS {shift.pay_amount.toLocaleString()}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-gray-400 hidden sm:block">
          {count} {count === 1 ? t('facility.applicant') : t('facility.applicants')}
        </span>
        <Badge status={shift.status} />
        <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-teal-500 transition-colors" />
      </div>
    </Link>
  );
}

function EmptyShifts({ t }) {
  return (
    <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-gray-200">
      <div className="w-16 h-16 bg-gradient-to-br from-teal-50 to-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-teal-100">
        <CalendarDays className="w-8 h-8 text-teal-500" />
      </div>
      <p className="font-semibold text-gray-700">{t('facility.no_shifts_yet')}</p>
      <p className="text-sm text-gray-400 mt-1 mb-5">{t('facility.post_first')}</p>
      <Button to="/facility/post-shift" size="sm"><Plus className="w-4 h-4" />{t('facility.post_first_btn')}</Button>
    </div>
  );
}
