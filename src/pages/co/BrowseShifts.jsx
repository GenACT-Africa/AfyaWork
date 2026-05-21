import { useEffect, useState, useCallback } from 'react';
import { MapPin, Clock, Banknote, Search, Filter } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getOpenShifts, applyToShift, getMyCOApplications } from '../../lib/api';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { ShiftCardSkeleton } from '../../components/common/Skeleton';
import { useToast } from '../../components/common/Toast';

const SHIFT_TYPES = ['All', 'Day (8AM-4PM)', 'Evening (4PM-10PM)', 'Night (10PM-6AM)', '24-Hour', 'Weekend'];

export default function BrowseShifts() {
  const { user } = useAuth();
  const { show, ToastComponent } = useToast();

  const [shifts, setShifts] = useState([]);
  const [appliedIds, setAppliedIds] = useState(new Set());
  const [applying, setApplying] = useState(null);
  const [filter, setFilter] = useState('All');
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!user?.id) return;
    const [shiftsRes, appsRes] = await Promise.all([
      getOpenShifts(),
      getMyCOApplications(user.id),
    ]);
    setShifts(shiftsRes.data || []);
    setAppliedIds(new Set((appsRes.data || []).map((a) => a.shift_id)));
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleApply(shiftId) {
    setApplying(shiftId);
    const { error } = await applyToShift(shiftId, user.id);
    setApplying(null);
    if (error) {
      show(error.message || 'Failed to apply. Please try again.', 'error');
      return;
    }
    setAppliedIds((prev) => new Set([...prev, shiftId]));
    show('Application submitted! The facility will review and notify you.');
  }

  const filtered = filter === 'All' ? shifts : shifts.filter((s) => s.shift_type === filter);

  return (
    <PageWrapper title="Browse Shifts" subtitle="Open shifts available in Dar es Salaam.">
      {ToastComponent}

      {/* Filter */}
      <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-1">
        <Filter className="w-4 h-4 text-gray-400 shrink-0" />
        {SHIFT_TYPES.map((t) => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors
              ${filter === t ? 'bg-teal-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-teal-300'}`}
          >
            {t}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid md:grid-cols-2 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <ShiftCardSkeleton key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState filter={filter} />
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {filtered.map((shift) => (
            <ShiftCard
              key={shift.id}
              shift={shift}
              applied={appliedIds.has(shift.id)}
              applying={applying === shift.id}
              onApply={() => handleApply(shift.id)}
            />
          ))}
        </div>
      )}
    </PageWrapper>
  );
}

function ShiftCard({ shift, applied, applying, onApply }) {
  const facility = shift.facility_profiles;
  return (
    <Card className="p-5 flex flex-col gap-4">
      <div>
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-gray-900">{shift.shift_type}</h3>
          <span className="text-lg font-bold text-teal-600 shrink-0">
            TZS {shift.pay_amount.toLocaleString()}
          </span>
        </div>
        <p className="text-sm text-gray-500 mt-1 font-medium">{facility?.facility_name}</p>
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <Clock className="w-3.5 h-3.5" />
          {new Date(shift.shift_date + 'T00:00:00').toLocaleDateString('en-TZ', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
        </span>
        {facility?.facility_type && (
          <span className="flex items-center gap-1">
            <Banknote className="w-3.5 h-3.5" />
            {facility.facility_type}
          </span>
        )}
        {facility?.address && (
          <span className="flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5" />
            {facility.address}
          </span>
        )}
      </div>

      {shift.description && (
        <p className="text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2">{shift.description}</p>
      )}

      <div className="mt-auto">
        {applied ? (
          <div className="w-full text-center text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg py-2">
            Application Submitted
          </div>
        ) : (
          <Button
            className="w-full"
            loading={applying}
            onClick={onApply}
          >
            Apply for Shift
          </Button>
        )}
      </div>
    </Card>
  );
}

function EmptyState({ filter }) {
  return (
    <div className="text-center py-16 bg-white rounded-xl border border-dashed border-gray-300">
      <Search className="w-10 h-10 text-gray-300 mx-auto mb-3" />
      <p className="font-medium text-gray-700">No open shifts {filter !== 'All' ? `for "${filter}"` : 'available'}</p>
      <p className="text-sm text-gray-400 mt-1">Check back soon — facilities post new shifts daily.</p>
    </div>
  );
}
