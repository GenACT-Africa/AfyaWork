import { useEffect, useState } from 'react';
import { ClipboardList, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { getMyCOApplications } from '../../lib/api';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { ShiftCardSkeleton } from '../../components/common/Skeleton';
import { Avatar } from '../../components/common/Avatar';

const TABS = ['all', 'pending', 'approved', 'rejected'];

export default function MyApplications() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [applications, setApplications] = useState([]);
  const [tab, setTab] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    getMyCOApplications(user.id).then(({ data }) => {
      setApplications(data || []);
    }).finally(() => setLoading(false));
  }, [user?.id]);

  const filtered = tab === 'all' ? applications : applications.filter((a) => a.status === tab);
  const counts = {
    pending:  applications.filter((a) => a.status === 'pending').length,
    approved: applications.filter((a) => a.status === 'approved').length,
    rejected: applications.filter((a) => a.status === 'rejected').length,
  };

  return (
    <PageWrapper title={t('co.my_applications')} subtitle={t('co.track_applications')}>
      {/* Tabs */}
      <div className="flex gap-1.5 mb-6 overflow-x-auto pb-1">
        {TABS.map((tabKey) => (
          <button
            key={tabKey}
            onClick={() => setTab(tabKey)}
            className={`shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all
              ${tab === tabKey
                ? 'bg-teal-600 text-white shadow-sm'
                : 'bg-white border border-gray-100 text-gray-600 hover:bg-gray-50 shadow-sm'}`}
          >
            {tabKey === 'all' ? t('common.all') : t(`status.${tabKey}`)}
            {tabKey !== 'all' && counts[tabKey] > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${tab === tabKey ? 'bg-teal-500 text-white' : 'bg-gray-100 text-gray-600'}`}>
                {counts[tabKey]}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <ShiftCardSkeleton key={i} />)}</div>
      ) : filtered.length === 0 ? (
        <EmptyState tab={tab} t={t} />
      ) : (
        <div className="space-y-3">
          {filtered.map((app) => <ApplicationCard key={app.id} app={app} t={t} />)}
        </div>
      )}
    </PageWrapper>
  );
}

function ApplicationCard({ app, t }) {
  const shift = app.shifts;
  const facility = shift?.facility_profiles;
  const isApproved = app.status === 'approved';

  return (
    <div className={`bg-white rounded-2xl border px-5 py-5 shadow-sm transition-all
      ${isApproved ? 'border-emerald-200 bg-emerald-50/30' : 'border-gray-100 hover:shadow-md'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Avatar
            src={facility?.users?.avatar_url}
            name={facility?.facility_name}
            size="md"
            shape="rounded"
            className="mt-0.5"
          />
          <div>
            <p className="font-bold text-gray-900 text-base">{shift?.shift_type}</p>
            <p className="text-sm text-gray-500 mt-0.5 font-medium">{facility?.facility_name}</p>
            <p className="text-sm text-gray-400 mt-1">
              {new Date(shift?.shift_date + 'T00:00:00').toLocaleDateString('en-TZ', {
                weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
              })}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Badge status={app.status} />
          <span className="text-lg font-extrabold text-gray-900">TZS {shift?.pay_amount?.toLocaleString()}</span>
        </div>
      </div>

      {isApproved && (
        <div className="mt-4 pt-4 border-t border-emerald-100 bg-emerald-50 rounded-xl px-4 py-3">
          <p className="text-sm text-emerald-800 font-semibold">{t('co.selected')}</p>
          <p className="text-xs text-emerald-600 mt-0.5">{t('co.facility_will_contact')}</p>
        </div>
      )}

      <p className="text-xs text-gray-400 mt-3">
        {t('co.applied')} {new Date(app.applied_at).toLocaleDateString('en-TZ', { day: 'numeric', month: 'short', year: 'numeric' })}
      </p>
    </div>
  );
}

function EmptyState({ tab, t }) {
  return (
    <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-gray-200">
      <div className="w-16 h-16 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-blue-100">
        <ClipboardList className="w-8 h-8 text-blue-400" />
      </div>
      <p className="font-semibold text-gray-700">
        {tab === 'all' ? t('co.no_applications') : t('co.no_apps_tab', { tab: t(`status.${tab}`) })}
      </p>
      {tab === 'all' && (
        <>
          <p className="text-sm text-gray-400 mt-1 mb-5">{t('co.start_browsing')}</p>
          <Button to="/co/shifts" size="sm"><Search className="w-4 h-4" />{t('co.browse_btn')}</Button>
        </>
      )}
    </div>
  );
}
