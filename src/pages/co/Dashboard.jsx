import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, ClipboardList, CheckCircle2, Clock, ArrowRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getCODashboardStats, getMyCOApplications } from '../../lib/api';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { StatCard } from '../../components/common/Card';
import { StatCardSkeleton, ShiftCardSkeleton } from '../../components/common/Skeleton';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';

export default function CODashboard() {
  const { user } = useAuth();
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
      title={`Welcome, ${user?.display_name || 'there'}`}
      subtitle="Your locum activity at a glance."
      action={
        <Button to="/co/shifts">
          <Search className="w-4 h-4 mr-1" /> Browse Shifts
        </Button>
      }
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <StatCard label="Open Shifts" value={stats?.openShifts ?? 0} icon={Search} color="teal" />
            <StatCard label="My Applications" value={stats?.myApplications ?? 0} icon={ClipboardList} color="blue" />
            <StatCard label="Confirmed" value={stats?.confirmed ?? 0} icon={CheckCircle2} color="purple" />
            <StatCard label="Pending" value={stats?.pending ?? 0} icon={Clock} color="yellow" />
          </>
        )}
      </div>

      {/* Recent applications */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Recent Applications</h2>
          <Link to="/co/applications" className="text-sm text-teal-600 hover:underline">View all</Link>
        </div>

        {loading ? (
          <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <ShiftCardSkeleton key={i} />)}</div>
        ) : recentApps.length === 0 ? (
          <EmptyState />
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
    <div className="flex items-center justify-between bg-white rounded-xl border border-gray-200 px-5 py-4">
      <div>
        <p className="font-medium text-gray-900">{shift?.shift_type}</p>
        <p className="text-sm text-gray-500">
          {shift?.facility_profiles?.facility_name} ·{' '}
          {new Date(shift?.shift_date + 'T00:00:00').toLocaleDateString('en-TZ', { day: 'numeric', month: 'short', year: 'numeric' })}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-600 font-medium">TZS {shift?.pay_amount?.toLocaleString()}</span>
        <Badge status={app.status} />
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-16 bg-white rounded-xl border border-dashed border-gray-300">
      <ClipboardList className="w-10 h-10 text-gray-300 mx-auto mb-3" />
      <p className="font-medium text-gray-700">No applications yet</p>
      <p className="text-sm text-gray-400 mt-1 mb-4">Browse open shifts and apply to get started.</p>
      <Button to="/co/shifts" size="sm">
        <ArrowRight className="w-4 h-4 mr-1" /> Browse Shifts
      </Button>
    </div>
  );
}
