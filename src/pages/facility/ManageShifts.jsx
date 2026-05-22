import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, ChevronRight, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { getFacilityShifts } from '../../lib/api';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { ShiftCardSkeleton } from '../../components/common/Skeleton';

const FILTERS = ['all', 'open', 'filled', 'cancelled'];

export default function ManageShifts() {
  const { user } = useAuth();
  const { t } = useTranslation();
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
      title={t('facility.my_shifts')}
      subtitle={t('facility.all_shifts')}
      action={<Button to="/facility/post-shift" size="sm"><Plus className="w-4 h-4" />{t('facility.post_shift')}</Button>}
    >
      {/* Filter tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1 w-fit">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-1.5 text-sm font-semibold rounded-lg capitalize transition-all
              ${filter === f ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {f === 'all' ? t('common.all') : t(`status.${f}`)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <ShiftCardSkeleton key={i} />)}</div>
      ) : filtered.length === 0 ? (
        <Empty filter={filter} t={t} />
      ) : (
        <div className="space-y-3">
          {filtered.map((shift) => <ShiftRow key={shift.id} shift={shift} t={t} />)}
        </div>
      )}
    </PageWrapper>
  );
}

function ShiftRow({ shift, t }) {
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

function Empty({ filter, t }) {
  return (
    <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-gray-200">
      <div className="w-16 h-16 bg-gradient-to-br from-teal-50 to-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-teal-100">
        <CalendarDays className="w-8 h-8 text-teal-500" />
      </div>
      <p className="font-semibold text-gray-700">
        {t('facility.no_shifts_found', { filter: filter === 'all' ? '' : t(`status.${filter}`) })}
      </p>
      {filter === 'all' && (
        <>
          <p className="text-sm text-gray-400 mt-1 mb-5">{t('facility.post_to_receive')}</p>
          <Button to="/facility/post-shift" size="sm"><Plus className="w-4 h-4" />{t('facility.post_shift')}</Button>
        </>
      )}
    </div>
  );
}
