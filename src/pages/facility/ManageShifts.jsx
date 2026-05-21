import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, ChevronRight, Plus } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getFacilityShifts } from '../../lib/api';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { ShiftCardSkeleton } from '../../components/common/Skeleton';

const FILTERS = ['all', 'open', 'filled', 'cancelled'];

export default function ManageShifts() {
  const { user } = useAuth();
  const [shifts, setShifts] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    getFacilityShifts(user.id).then(({ data }) => {
      setShifts(data || []);
    }).finally(() => setLoading(false));
  }, [user?.id]);

  const filtered = filter === 'all' ? shifts : shifts.filter((s) => s.status === filter);

  return (
    <PageWrapper
      title="My Shifts"
      subtitle="All shifts you have posted."
      action={
        <Button as={Link} to="/facility/post-shift" size="sm">
          <Plus className="w-4 h-4 mr-1" /> Post Shift
        </Button>
      }
    >
      {/* Filter tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-1.5 text-sm font-medium rounded-md capitalize transition-colors
              ${filter === f ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {f}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <ShiftCardSkeleton key={i} />)}</div>
      ) : filtered.length === 0 ? (
        <Empty filter={filter} />
      ) : (
        <div className="space-y-3">
          {filtered.map((shift) => <ShiftRow key={shift.id} shift={shift} />)}
        </div>
      )}
    </PageWrapper>
  );
}

function ShiftRow({ shift }) {
  const count = shift.applications?.[0]?.count ?? 0;
  return (
    <Link
      to={`/facility/shifts/${shift.id}`}
      className="flex items-center justify-between bg-white rounded-xl border border-gray-200 px-5 py-4 hover:border-teal-300 hover:shadow-sm transition-all group"
    >
      <div className="flex items-center gap-4">
        <div className="hidden sm:flex w-10 h-10 bg-teal-50 rounded-lg items-center justify-center shrink-0">
          <CalendarDays className="w-5 h-5 text-teal-600" />
        </div>
        <div>
          <p className="font-medium text-gray-900">{shift.shift_type}</p>
          <p className="text-sm text-gray-500">
            {new Date(shift.shift_date + 'T00:00:00').toLocaleDateString('en-TZ', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
            {' · '}TZS {shift.pay_amount.toLocaleString()}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-gray-400 hidden sm:block">{count} applicant{count !== 1 ? 's' : ''}</span>
        <Badge status={shift.status} />
        <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-teal-500 transition-colors" />
      </div>
    </Link>
  );
}

function Empty({ filter }) {
  return (
    <div className="text-center py-16 bg-white rounded-xl border border-dashed border-gray-300">
      <CalendarDays className="w-10 h-10 text-gray-300 mx-auto mb-3" />
      <p className="font-medium text-gray-700">No {filter === 'all' ? '' : filter} shifts found</p>
      {filter === 'all' && (
        <>
          <p className="text-sm text-gray-400 mt-1 mb-4">Post a shift to start receiving applications.</p>
          <Button as={Link} to="/facility/post-shift" size="sm"><Plus className="w-4 h-4 mr-1" />Post Shift</Button>
        </>
      )}
    </div>
  );
}
