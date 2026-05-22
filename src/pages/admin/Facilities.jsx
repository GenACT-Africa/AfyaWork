import { useEffect, useState } from 'react';
import { Building2, MapPin, Phone, Mail, Search } from 'lucide-react';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { Card } from '../../components/common/Card';
import { getAdminFacilities } from '../../lib/api';

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function AdminFacilities() {
  const [facilities, setFacilities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    getAdminFacilities().then(({ data }) => { setFacilities(data || []); setLoading(false); });
  }, []);

  const filtered = facilities.filter((f) => {
    const q = search.toLowerCase();
    return (
      f.facility_name?.toLowerCase().includes(q) ||
      f.facility_type?.toLowerCase().includes(q) ||
      f.address?.toLowerCase().includes(q) ||
      f.users?.email?.toLowerCase().includes(q)
    );
  });

  return (
    <PageWrapper
      title="Facilities"
      subtitle={`${facilities.length} registered healthcare facilities`}
    >
      {/* Search */}
      <div className="relative mb-6 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search facilities…"
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
          <Building2 className="w-10 h-10 text-gray-300 mb-3" />
          <p className="text-gray-500 text-sm">{search ? 'No facilities match your search.' : 'No facilities yet.'}</p>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-gray-100 shadow-sm bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs text-gray-400 uppercase tracking-wider">
                <th className="text-left px-5 py-4 font-semibold">Facility</th>
                <th className="text-left px-5 py-4 font-semibold">Contact</th>
                <th className="text-left px-5 py-4 font-semibold">Shifts</th>
                <th className="text-left px-5 py-4 font-semibold">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((f) => (
                <tr key={f.user_id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-4">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-500 flex items-center justify-center shrink-0 shadow-sm">
                        <Building2 className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">{f.facility_name}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{f.facility_type || '—'}</p>
                        {f.address && (
                          <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                            <MapPin className="w-3 h-3" />{f.address}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <p className="flex items-center gap-1.5 text-gray-600">
                      <Mail className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                      {f.users?.email || '—'}
                    </p>
                    {f.users?.phone && (
                      <p className="flex items-center gap-1.5 text-gray-500 text-xs mt-1">
                        <Phone className="w-3 h-3 text-gray-400 shrink-0" />
                        {f.users.phone}
                      </p>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-teal-50 text-teal-700 text-xs font-semibold">
                      {f.shift_stats?.open || 0} open
                    </span>
                    <p className="text-xs text-gray-400 mt-1">{f.shift_stats?.total || 0} total</p>
                  </td>
                  <td className="px-5 py-4 text-gray-500 text-xs">
                    {formatDate(f.users?.created_at)}
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
