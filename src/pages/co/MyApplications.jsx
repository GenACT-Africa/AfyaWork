import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, ArrowRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getMyCOApplications } from '../../lib/api';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { ShiftCardSkeleton } from '../../components/common/Skeleton';

const TABS = ['all', 'pending', 'approved', 'rejected'];

export default function MyApplications() {
  const { user } = useAuth();
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
    pending: applications.filter((a) => a.status === 'pending').length,
    approved: applications.filter((a) => a.status === 'approved').length,
    rejected: applications.filter((a) => a.status === 'rejected').length,
  };

  return (
    <PageWrapper title="My Applications" subtitle="Track all your shift applications.">
      {/* Tabs */}
      <div className="flex gap-1 mb-6 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`shrink-0 px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors
              ${tab === t ? 'bg-teal-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
          >
            {t}
            {t !== 'all' && counts[t] > 0 && (
              <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${tab === t ? 'bg-teal-500' : 'bg-gray-200 text-gray-600'}`}>
                {counts[t]}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <ShiftCardSkeleton key={i} />)}</div>
      ) : filtered.length === 0 ? (
        <EmptyState tab={tab} />
      ) : (
        <div className="space-y-3">
          {filtered.map((app) => <ApplicationCard key={app.id} app={app} />)}
        </div>
      )}
    </PageWrapper>
  );
}

function ApplicationCard({ app }) {
  const shift = app.shifts;
  const isApproved = app.status === 'approved';

  return (
    <div className={`bg-white rounded-xl border px-5 py-4 ${isApproved ? 'border-green-300 bg-green-50/30' : 'border-gray-200'}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-gray-900">{shift?.shift_type}</p>
          <p className="text-sm text-gray-500 mt-0.5">
            {shift?.facility_profiles?.facility_name}
          </p>
          <p className="text-sm text-gray-400 mt-1">
            {new Date(shift?.shift_date + 'T00:00:00').toLocaleDateString('en-TZ', {
              weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
            })}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Badge status={app.status} />
          <span className="text-base font-bold text-gray-900">TZS {shift?.pay_amount?.toLocaleString()}</span>
        </div>
      </div>

      {isApproved && (
        <div className="mt-3 pt-3 border-t border-green-200">
          <p className="text-sm text-green-700 font-medium">
            You have been selected for this shift.
          </p>
          <p className="text-xs text-green-600 mt-0.5">
            The facility will contact you with further details.
          </p>
        </div>
      )}

      <p className="text-xs text-gray-400 mt-2">
        Applied {new Date(app.applied_at).toLocaleDateString('en-TZ', { day: 'numeric', month: 'short', year: 'numeric' })}
      </p>
    </div>
  );
}

function EmptyState({ tab }) {
  return (
    <div className="text-center py-16 bg-white rounded-xl border border-dashed border-gray-300">
      <ClipboardList className="w-10 h-10 text-gray-300 mx-auto mb-3" />
      <p className="font-medium text-gray-700">
        No {tab === 'all' ? '' : tab} applications
      </p>
      {tab === 'all' && (
        <>
          <p className="text-sm text-gray-400 mt-1 mb-4">Start by browsing open shifts.</p>
          <Button to="/co/shifts" size="sm">
            <ArrowRight className="w-4 h-4 mr-1" /> Browse Shifts
          </Button>
        </>
      )}
    </div>
  );
}
