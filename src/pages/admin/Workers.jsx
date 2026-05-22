import { useEffect, useState } from 'react';
import { UserCircle, Mail, Phone, Search, Award } from 'lucide-react';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { Card } from '../../components/common/Card';
import { getAdminWorkers } from '../../lib/api';

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

const tierBadge = {
  basic:    'bg-gray-100 text-gray-600',
  standard: 'bg-blue-50 text-blue-700',
  premium:  'bg-amber-50 text-amber-700',
};

export default function AdminWorkers() {
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    getAdminWorkers().then(({ data }) => { setWorkers(data || []); setLoading(false); });
  }, []);

  const filtered = workers.filter((w) => {
    const q = search.toLowerCase();
    return (
      w.users?.display_name?.toLowerCase().includes(q) ||
      w.users?.email?.toLowerCase().includes(q) ||
      w.license_number?.toLowerCase().includes(q) ||
      w.specialization?.toLowerCase().includes(q)
    );
  });

  return (
    <PageWrapper
      title="Clinical Officers"
      subtitle={`${workers.length} registered workers`}
    >
      {/* Search */}
      <div className="relative mb-6 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search workers…"
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white shadow-sm"
        />
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-20 bg-gray-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16 text-center">
          <UserCircle className="w-10 h-10 text-gray-300 mb-3" />
          <p className="text-gray-500 text-sm">{search ? 'No workers match your search.' : 'No workers yet.'}</p>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-gray-100 shadow-sm bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs text-gray-400 uppercase tracking-wider">
                <th className="text-left px-5 py-4 font-semibold">Worker</th>
                <th className="text-left px-5 py-4 font-semibold">Contact</th>
                <th className="text-left px-5 py-4 font-semibold">Tier</th>
                <th className="text-left px-5 py-4 font-semibold">Applications</th>
                <th className="text-left px-5 py-4 font-semibold">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((w) => (
                <tr key={w.user_id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-4">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center shrink-0 shadow-sm text-white text-xs font-bold">
                        {(w.users?.display_name || w.users?.email || '?').split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()}
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">{w.users?.display_name || '—'}</p>
                        <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                          <Award className="w-3 h-3" />
                          {w.license_number} · {w.specialization || 'General'}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <p className="flex items-center gap-1.5 text-gray-600">
                      <Mail className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                      {w.users?.email || '—'}
                    </p>
                    {w.users?.phone && (
                      <p className="flex items-center gap-1.5 text-gray-500 text-xs mt-1">
                        <Phone className="w-3 h-3 text-gray-400 shrink-0" />
                        {w.users.phone}
                      </p>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold capitalize ${tierBadge[w.subscription_tier] || tierBadge.basic}`}>
                      {w.subscription_tier || 'basic'}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-50 text-purple-700 text-xs font-semibold">
                      {w.app_stats?.approved || 0} approved
                    </span>
                    <p className="text-xs text-gray-400 mt-1">{w.app_stats?.total || 0} total</p>
                  </td>
                  <td className="px-5 py-4 text-gray-500 text-xs">
                    {formatDate(w.users?.created_at)}
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
