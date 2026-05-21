import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, CheckCircle2, Users, XCircle, Plus } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getFacilityDashboardStats, getFacilityShifts } from '../../lib/api';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { StatCard } from '../../components/common/Card';
import { StatCardSkeleton, ShiftCardSkeleton } from '../../components/common/Skeleton';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';

export default function FacilityDashboard() {
  const { user } = useAuth();
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
      title={`Welcome back, ${user?.display_name || 'there'}`}
      subtitle="Here's an overview of your shift activity."
      action={<Button to="/facility/post-shift"><Plus className="w-4 h-4 mr-1" />Post Shift</Button>}
    >
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <StatCard label="Open Shifts" value={stats?.openShifts ?? 0} icon={CalendarDays} color="teal" />
            <StatCard label="Filled Shifts" value={stats?.filledShifts ?? 0} icon={CheckCircle2} color="blue" />
            <StatCard label="Pending Applicants" value={stats?.pendingApplicants ?? 0} icon={Users} color="yellow" />
            <StatCard label="Cancelled" value={stats?.cancelledShifts ?? 0} icon={XCircle} color="red" />
          </>
        )}
      </div>

      {/* Recent shifts */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Recent Shifts</h2>
          <Link to="/facility/shifts" className="text-sm text-teal-600 hover:underline">View all</Link>
        </div>

        {loading ? (
          <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <ShiftCardSkeleton key={i} />)}</div>
        ) : recentShifts.length === 0 ? (
          <EmptyShifts />
        ) : (
          <div className="space-y-3">
            {recentShifts.map((shift) => (
              <FacilityShiftRow key={shift.id} shift={shift} />
            ))}
          </div>
        )}
      </div>
    </PageWrapper>
  );
}

function FacilityShiftRow({ shift }) {
  const applicantCount = shift.applicant_count ?? 0;
  return (
    <Link
      to={`/facility/shifts/${shift.id}`}
      className="flex items-center justify-between bg-white rounded-xl border border-gray-200 px-5 py-4 hover:border-teal-300 hover:shadow-sm transition-all"
    >
      <div>
        <p className="font-medium text-gray-900">{shift.shift_type}</p>
        <p className="text-sm text-gray-500">{new Date(shift.shift_date + 'T00:00:00').toLocaleDateString('en-TZ', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</p>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-500">{applicantCount} applicant{applicantCount !== 1 ? 's' : ''}</span>
        <Badge status={shift.status} />
      </div>
    </Link>
  );
}

function EmptyShifts() {
  return (
    <div className="text-center py-16 bg-white rounded-xl border border-dashed border-gray-300">
      <CalendarDays className="w-10 h-10 text-gray-300 mx-auto mb-3" />
      <p className="font-medium text-gray-700">No shifts posted yet</p>
      <p className="text-sm text-gray-400 mt-1 mb-4">Post your first shift to start receiving applications.</p>
      <Button to="/facility/post-shift" size="sm"><Plus className="w-4 h-4 mr-1" />Post first shift</Button>
    </div>
  );
}
