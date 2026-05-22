import { useEffect, useState } from 'react';
import { Building2, Users, CalendarDays, FileCheck, Clock, XCircle } from 'lucide-react';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { StatCard } from '../../components/common/Card';
import { getAdminStats } from '../../lib/api';

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAdminStats().then((s) => { setStats(s); setLoading(false); });
  }, []);

  if (loading) {
    return (
      <PageWrapper title="Admin Overview" subtitle="Platform-wide statistics">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-32 bg-gray-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper
      title="Admin Overview"
      subtitle="Real-time platform statistics across all users and shifts"
    >
      <section>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Users</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StatCard label="Facilities" value={stats.totalFacilities} icon={Building2} color="teal" />
          <StatCard label="Clinical Officers" value={stats.totalWorkers} icon={Users} color="blue" />
          <StatCard label="Total Applications" value={stats.totalApps} icon={FileCheck} color="purple" />
          <StatCard label="Pending Applications" value={stats.pendingApps} icon={Clock} color="yellow" />
        </div>
      </section>

      <section>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Shifts</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total Shifts" value={stats.totalShifts} icon={CalendarDays} color="teal" />
          <StatCard label="Open" value={stats.openShifts} icon={CalendarDays} color="blue" />
          <StatCard label="Filled" value={stats.filledShifts} icon={FileCheck} color="purple" />
          <StatCard label="Cancelled" value={stats.cancelledShifts} icon={XCircle} color="red" />
        </div>
      </section>

      {/* Approved applications stat */}
      <div className="mt-8 bg-gradient-to-r from-teal-50 to-emerald-50 border border-teal-100 rounded-2xl p-6 flex items-center gap-5">
        <div className="w-12 h-12 bg-gradient-to-br from-teal-500 to-emerald-500 rounded-2xl flex items-center justify-center shadow-sm shrink-0">
          <FileCheck className="w-6 h-6 text-white" />
        </div>
        <div>
          <p className="text-3xl font-bold text-gray-900">{stats.approvedApps}</p>
          <p className="text-sm text-gray-500 font-medium mt-0.5">Approved placements — shifts successfully filled via AfyaWork</p>
        </div>
      </div>
    </PageWrapper>
  );
}
