import { useEffect, useState, useCallback } from 'react';
import { MapPin, Clock, Building2, Search, Filter } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { getOpenShifts, applyToShift, getMyCOApplications } from '../../lib/api';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { Button } from '../../components/common/Button';
import { ShiftCardSkeleton } from '../../components/common/Skeleton';
import { useToast } from '../../components/common/Toast';

const SHIFT_TYPES = ['All', 'Day (8AM-4PM)', 'Evening (4PM-10PM)', 'Night (10PM-6AM)', '24-Hour', 'Weekend'];

export default function BrowseShifts() {
  const { user } = useAuth();
  const { t } = useTranslation();
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
    if (error) { show(error.message || 'Failed to apply. Please try again.', 'error'); return; }
    setAppliedIds((prev) => new Set([...prev, shiftId]));
    show(t('co.apply_success'));
  }

  const filtered = filter === 'All' ? shifts : shifts.filter((s) => s.shift_type === filter);

  return (
    <PageWrapper title={t('co.browse_title')} subtitle={t('co.browse_sub')}>
      {ToastComponent}

      <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-1">
        <Filter className="w-4 h-4 text-gray-400 shrink-0" />
        {SHIFT_TYPES.map((type) => (
          <button
            key={type}
            onClick={() => setFilter(type)}
            className={`shrink-0 px-4 py-2 rounded-full text-sm font-semibold transition-all
              ${filter === type
                ? 'bg-teal-600 text-white shadow-sm'
                : 'bg-white border border-gray-100 text-gray-600 hover:border-teal-200 shadow-sm'}`}
          >
            {type === 'All' ? t('common.all') : type}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid md:grid-cols-2 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <ShiftCardSkeleton key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState filter={filter} t={t} />
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {filtered.map((shift) => (
            <ShiftCard
              key={shift.id}
              shift={shift}
              applied={appliedIds.has(shift.id)}
              applying={applying === shift.id}
              onApply={() => handleApply(shift.id)}
              t={t}
            />
          ))}
        </div>
      )}
    </PageWrapper>
  );
}

function ShiftCard({ shift, applied, applying, onApply, t }) {
  const facility = shift.facility_profiles;
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col gap-4 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
      <div>
        <div className="flex items-start justify-between gap-2 mb-2">
          <span className="inline-flex items-center px-2.5 py-1 bg-teal-50 text-teal-700 text-xs font-semibold rounded-lg">
            {shift.shift_type}
          </span>
          <span className="text-xl font-extrabold text-gray-900 shrink-0">
            TZS {shift.pay_amount.toLocaleString()}
          </span>
        </div>
        <p className="font-semibold text-gray-800">{facility?.facility_name}</p>
        {facility?.facility_type && (
          <div className="flex items-center gap-1 text-xs text-gray-400 mt-0.5">
            <Building2 className="w-3 h-3" />{facility.facility_type}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1.5 text-xs text-gray-500">
        <span className="flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-gray-400" />
          {new Date(shift.shift_date + 'T00:00:00').toLocaleDateString('en-TZ', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
        </span>
        {facility?.address && (
          <span className="flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-gray-400" />
            {facility.address}
          </span>
        )}
      </div>

      {shift.description && (
        <p className="text-sm text-gray-500 bg-gray-50 rounded-xl px-3 py-2 line-clamp-2">{shift.description}</p>
      )}

      <div className="mt-auto">
        {applied ? (
          <div className="w-full text-center text-sm font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl py-2.5">
            ✓ {t('co.applied_badge')}
          </div>
        ) : (
          <Button className="w-full" loading={applying} onClick={onApply}>
            {t('co.apply')}
          </Button>
        )}
      </div>
    </div>
  );
}

function EmptyState({ filter, t }) {
  return (
    <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-gray-200">
      <div className="w-16 h-16 bg-gradient-to-br from-gray-50 to-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-gray-200">
        <Search className="w-8 h-8 text-gray-400" />
      </div>
      <p className="font-semibold text-gray-700">
        {filter !== 'All' ? `${t('co.no_shifts_filter')} "${filter}"` : t('co.no_shifts')}
      </p>
      <p className="text-sm text-gray-400 mt-1">{t('co.check_back')}</p>
    </div>
  );
}
