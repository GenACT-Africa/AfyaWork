import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Building2, Users, CalendarDays, FileCheck, Clock, XCircle,
  AlertTriangle, Activity, CheckCircle2, ChevronRight,
} from 'lucide-react';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { StatCard } from '../../components/common/Card';
import { getAdminStats } from '../../lib/api';

// ── Shift status progress bar ─────────────────────────────────────

const SEGMENTS = [
  { key: 'openShifts',       label: 'Open',        color: 'bg-blue-500'   },
  { key: 'filledShifts',     label: 'Offer Sent',  color: 'bg-indigo-500' },
  { key: 'confirmedShifts',  label: 'Confirmed',   color: 'bg-violet-500' },
  { key: 'inProgressShifts', label: 'Active',      color: 'bg-teal-500'   },
  { key: 'completedShifts',  label: 'Completed',   color: 'bg-emerald-500'},
  { key: 'disputedShifts',   label: 'Disputed',    color: 'bg-amber-500'  },
  { key: 'cancelledShifts',  label: 'Cancelled',   color: 'bg-red-400'    },
];

function ShiftProgressBar({ stats }) {
  const total = stats.totalShifts || 1; // avoid div-by-zero

  return (
    <div>
      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
        Shift Status Breakdown
      </h2>

      {/* Stacked bar */}
      <div className="flex h-3 rounded-full overflow-hidden gap-px mb-5 bg-gray-100">
        {SEGMENTS.map(({ key, color }) => {
          const val = stats[key] || 0;
          if (val === 0) return null;
          const pct = (val / total) * 100;
          return (
            <div
              key={key}
              className={`${color} transition-all duration-700`}
              style={{ width: `${pct}%`, minWidth: val > 0 ? '4px' : '0' }}
              title={`${val} shifts`}
            />
          );
        })}
      </div>

      {/* Legend */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {SEGMENTS.map(({ key, label, color }) => {
          const val = stats[key] || 0;
          return (
            <Link
              key={key}
              to={key === 'disputedShifts' ? '/admin/shifts?status=disputed' : '/admin/shifts'}
              className="flex flex-col items-center gap-1.5 bg-white border border-gray-100 rounded-xl px-3 py-3 hover:border-gray-200 hover:shadow-sm transition-all group"
            >
              <div className={`w-2.5 h-2.5 rounded-full ${color}`} />
              <p className="text-xl font-bold text-gray-900">{val}</p>
              <p className="text-xs text-gray-500 font-medium text-center leading-tight">{label}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAdminStats().then((s) => { setStats(s); setLoading(false); });
  }, []);

  if (loading) {
    return (
      <PageWrapper title="Admin Overview" subtitle="Platform-wide statistics">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-32 bg-gray-100 rounded-2xl animate-pulse" />
          ))}
        </div>
        <div className="h-40 bg-gray-100 rounded-2xl animate-pulse" />
      </PageWrapper>
    );
  }

  return (
    <PageWrapper
      title="Admin Overview"
      subtitle="Real-time platform statistics across all users and shifts"
    >
      {/* ── Disputes callout (only shown when there are disputes) ── */}
      {stats.disputedShifts > 0 && (
        <Link
          to="/admin/shifts?status=disputed"
          className="flex items-center gap-4 mb-6 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 hover:bg-amber-100 transition-colors group"
        >
          <div className="w-10 h-10 bg-amber-500 rounded-xl flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <p className="font-bold text-amber-900">
              {stats.disputedShifts} shift dispute{stats.disputedShifts !== 1 ? 's' : ''} require your attention
            </p>
            <p className="text-sm text-amber-700 mt-0.5">
              Review and resolve disputes to keep operations running smoothly.
            </p>
          </div>
          <ChevronRight className="w-5 h-5 text-amber-500 group-hover:translate-x-0.5 transition-transform" />
        </Link>
      )}

      {/* ── Users ── */}
      <section className="mb-8">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Users</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Facilities"          value={stats.totalFacilities} icon={Building2}   color="teal"   to="/admin/facilities" />
          <StatCard label="Clinical Officers"   value={stats.totalWorkers}    icon={Users}        color="blue"   to="/admin/workers" />
          <StatCard label="Total Applications"  value={stats.totalApps}       icon={FileCheck}    color="purple" to="/admin/shifts" />
          <StatCard label="Pending Applications" value={stats.pendingApps}    icon={Clock}        color="yellow" to="/admin/shifts" />
        </div>
      </section>

      {/* ── Shifts overview ── */}
      <section className="mb-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard label="Total Shifts"   value={stats.totalShifts}     icon={CalendarDays}  color="teal"   to="/admin/shifts" />
          <StatCard label="Active Now"     value={stats.inProgressShifts} icon={Activity}     color="blue"   to="/admin/shifts" />
          <StatCard label="Completed"      value={stats.completedShifts} icon={CheckCircle2}  color="purple" to="/admin/shifts" />
          <StatCard label="Cancelled"      value={stats.cancelledShifts} icon={XCircle}       color="red"    to="/admin/shifts" />
        </div>

        {/* Shift status breakdown bar */}
        <ShiftProgressBar stats={stats} />
      </section>

      {/* ── Successful placements highlight ── */}
      <div className="bg-gradient-to-r from-teal-50 to-emerald-50 border border-teal-100 rounded-2xl p-6 flex items-center gap-5">
        <div className="w-12 h-12 bg-gradient-to-br from-teal-500 to-emerald-500 rounded-2xl flex items-center justify-center shadow-sm shrink-0">
          <FileCheck className="w-6 h-6 text-white" />
        </div>
        <div>
          <p className="text-3xl font-bold text-gray-900">{stats.approvedApps}</p>
          <p className="text-sm text-gray-500 font-medium mt-0.5">
            Approved placements — shifts successfully filled via AfyaWork
          </p>
        </div>
      </div>
    </PageWrapper>
  );
}
