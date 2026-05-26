import { useEffect, useState } from 'react';
import { CalendarDays, Search, Users } from 'lucide-react';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { Card } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';
import { getAdminShifts } from '../../lib/api';

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatPay(amount) {
  return `TZS ${Number(amount || 0).toLocaleString()}`;
}

const STATUS_LABELS = {
  all: 'All', open: 'Open', filled: 'Offer Pending', confirmed: 'Confirmed',
  in_progress: 'In Progress', completed: 'Completed',
  disputed_checkin: 'Disputed (In)', disputed_checkout: 'Disputed (Out)',
  no_show: 'No Show', cancelled: 'Cancelled',
};
const statusFilters = Object.keys(STATUS_LABELS);

export default function AdminShifts() {
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    getAdminShifts().then(({ data }) => { setShifts(data || []); setLoading(false); });
  }, []);

  const filtered = shifts.filter((s) => {
    const q = search.toLowerCase();
    const matchesSearch =
      s.facility_profiles?.facility_name?.toLowerCase().includes(q) ||
      s.shift_type?.toLowerCase().includes(q);
    const matchesStatus = statusFilter === 'all' || s.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <PageWrapper
      title="All Shifts"
      subtitle={`${shifts.length} shifts on the platform`}
    >
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search shifts…"
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white shadow-sm"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {statusFilters.map((f) => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                statusFilter === f
                  ? 'bg-teal-600 text-white shadow-sm'
                  : 'bg-white border border-gray-200 text-gray-500 hover:text-gray-800'
              }`}
            >
              {STATUS_LABELS[f] ?? f}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-16 bg-gray-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16 text-center">
          <CalendarDays className="w-10 h-10 text-gray-300 mb-3" />
          <p className="text-gray-500 text-sm">{search || statusFilter !== 'all' ? 'No shifts match your filters.' : 'No shifts yet.'}</p>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-gray-100 shadow-sm bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs text-gray-400 uppercase tracking-wider">
                <th className="text-left px-5 py-4 font-semibold">Shift</th>
                <th className="text-left px-5 py-4 font-semibold">Facility</th>
                <th className="text-left px-5 py-4 font-semibold">Pay</th>
                <th className="text-left px-5 py-4 font-semibold">Applicants</th>
                <th className="text-left px-5 py-4 font-semibold">Status</th>
                <th className="text-left px-5 py-4 font-semibold">Posted</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-4">
                    <p className="font-semibold text-gray-900 capitalize">{s.shift_type}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{formatDate(s.shift_date)}</p>
                  </td>
                  <td className="px-5 py-4 text-gray-600">
                    {s.facility_profiles?.facility_name || '—'}
                  </td>
                  <td className="px-5 py-4 font-medium text-gray-900">
                    {formatPay(s.pay_amount)}
                  </td>
                  <td className="px-5 py-4">
                    <span className="flex items-center gap-1.5 text-gray-600">
                      <Users className="w-3.5 h-3.5 text-gray-400" />
                      {s.applicant_count}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <Badge status={s.status} />
                  </td>
                  <td className="px-5 py-4 text-gray-500 text-xs">
                    {formatDate(s.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageWrapper>
  );
}
