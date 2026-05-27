import { useEffect, useState } from 'react';
import { Search, Users, MapPin, Calendar, Briefcase, SlidersHorizontal, X } from 'lucide-react';
import { searchCOsByAvailability } from '../../lib/api';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Avatar } from '../../components/common/Avatar';
import { AvailabilityBadge } from '../../components/common/Badge';

const EMPLOYMENT_LABELS = {
  employed_looking: 'Currently employed, looking to move',
  locum_only:       'Currently doing locum shifts only',
  unemployed:       'Unemployed / between roles',
};

const LOCATION_LABELS = {
  dar_only:     'Dar es Salaam only',
  open_regions: 'Open to all regions',
};

function formatAvailableFrom(immediately, date) {
  if (immediately) return 'Immediately available';
  if (date) {
    const d = new Date(String(date) + 'T00:00:00');
    return 'From ' + d.toLocaleDateString('en-TZ', { month: 'long', year: 'numeric' });
  }
  return null;
}

function minMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export default function BrowseCOs() {
  const [cos, setCOs]         = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');

  // Filters
  const [statusFilter,      setStatusFilter]      = useState('');   // '' | 'open_fulltime' | 'open_parttime'
  const [immediateFilter,   setImmediateFilter]   = useState(false);
  const [availByFilter,     setAvailByFilter]     = useState('');   // YYYY-MM

  useEffect(() => {
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, immediateFilter, availByFilter]);

  async function load() {
    setLoading(true);
    const filters = {};
    if (statusFilter)    filters.status = statusFilter;
    if (immediateFilter) filters.immediately = true;
    if (availByFilter)   filters.available_by = availByFilter + '-01';

    const { data } = await searchCOsByAvailability(filters);
    setCOs(data || []);
    setLoading(false);
  }

  function clearFilters() {
    setStatusFilter('');
    setImmediateFilter(false);
    setAvailByFilter('');
    setSearch('');
  }

  const anyFilter = statusFilter || immediateFilter || availByFilter;

  const filtered = (cos || []).filter((co) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      co.users?.display_name?.toLowerCase().includes(q) ||
      co.specialization?.toLowerCase().includes(q) ||
      co.availability_note?.toLowerCase().includes(q) ||
      co.preferred_location_text?.toLowerCase().includes(q)
    );
  });

  return (
    <PageWrapper
      title="Find Clinical Officers"
      subtitle="Browse COs who are open to full-time or permanent employment."
    >
      {/* ── Filter bar ── */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or specialization…"
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white shadow-sm"
          />
        </div>

        {/* Status chips */}
        <button
          onClick={() => setStatusFilter(statusFilter === 'open_fulltime' ? '' : 'open_fulltime')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium border transition-colors ${
            statusFilter === 'open_fulltime'
              ? 'bg-green-600 text-white border-green-600'
              : 'bg-white text-gray-600 border-gray-200 hover:border-green-400 hover:text-green-700'
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${statusFilter === 'open_fulltime' ? 'bg-white' : 'bg-green-500'}`} />
          Open to full-time
        </button>

        <button
          onClick={() => setStatusFilter(statusFilter === 'open_parttime' ? '' : 'open_parttime')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium border transition-colors ${
            statusFilter === 'open_parttime'
              ? 'bg-yellow-500 text-white border-yellow-500'
              : 'bg-white text-gray-600 border-gray-200 hover:border-yellow-400 hover:text-yellow-700'
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${statusFilter === 'open_parttime' ? 'bg-white' : 'bg-yellow-500'}`} />
          Open to part-time
        </button>

        <button
          onClick={() => setImmediateFilter((v) => !v)}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium border transition-colors ${
            immediateFilter
              ? 'bg-teal-600 text-white border-teal-600'
              : 'bg-white text-gray-600 border-gray-200 hover:border-teal-400 hover:text-teal-700'
          }`}
        >
          <Calendar className="w-3.5 h-3.5" />
          Immediately available
        </button>

        {/* Available by month */}
        <div className="flex items-center gap-1.5">
          <label className="text-sm text-gray-500 whitespace-nowrap">Available by</label>
          <input
            type="month"
            value={availByFilter}
            min={minMonth()}
            onChange={(e) => setAvailByFilter(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
          />
          {availByFilter && (
            <button onClick={() => setAvailByFilter('')} className="p-1 rounded-lg hover:bg-gray-100">
              <X className="w-3.5 h-3.5 text-gray-400" />
            </button>
          )}
        </div>

        {anyFilter && (
          <button onClick={clearFilters} className="text-sm text-gray-400 hover:text-gray-600 flex items-center gap-1 underline">
            <X className="w-3.5 h-3.5" /> Clear all
          </button>
        )}
      </div>

      {/* ── Results ── */}
      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-52 bg-gray-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 bg-gradient-to-br from-teal-50 to-green-50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-teal-100">
            <Users className="w-8 h-8 text-teal-400" />
          </div>
          <p className="font-semibold text-gray-700">No Clinical Officers found</p>
          <p className="text-sm text-gray-400 mt-1">
            {anyFilter || search ? 'Try adjusting your filters.' : 'No COs have declared availability yet.'}
          </p>
          {(anyFilter || search) && (
            <button onClick={clearFilters} className="mt-4 text-sm text-teal-600 hover:underline font-medium">
              Clear filters
            </button>
          )}
        </Card>
      ) : (
        <>
          <p className="text-sm text-gray-400 mb-4">{filtered.length} Clinical Officer{filtered.length !== 1 ? 's' : ''} found</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((co) => (
              <COCard key={co.user_id} co={co} />
            ))}
          </div>
        </>
      )}
    </PageWrapper>
  );
}

function COCard({ co }) {
  const availFrom = formatAvailableFrom(co.available_from_immediately, co.available_from_date);

  const locationText = co.preferred_location === 'specific_region' && co.preferred_location_text
    ? co.preferred_location_text
    : LOCATION_LABELS[co.preferred_location] || null;

  return (
    <Card className="p-5 flex flex-col gap-3 hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Avatar src={co.users?.avatar_url} name={co.users?.display_name} size="md" />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 truncate">{co.users?.display_name || 'Clinical Officer'}</p>
          <p className="text-xs text-gray-400 mt-0.5">{co.specialization || 'General Practice'}</p>
          {co.verified && (
            <span className="inline-block text-[10px] font-semibold text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full mt-1">
              Verified CO
            </span>
          )}
        </div>
      </div>

      {/* Availability badge */}
      <AvailabilityBadge status={co.employment_availability_status} />

      {/* Details */}
      <div className="space-y-1.5 text-sm text-gray-600">
        {availFrom && (
          <div className="flex items-center gap-2">
            <Calendar className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <span>{availFrom}</span>
          </div>
        )}
        {locationText && (
          <div className="flex items-center gap-2">
            <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <span>{locationText}</span>
          </div>
        )}
        {co.current_employment_status && (
          <div className="flex items-center gap-2">
            <Briefcase className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <span className="text-xs">{EMPLOYMENT_LABELS[co.current_employment_status]}</span>
          </div>
        )}
      </div>

      {/* Bio excerpt */}
      {co.users?.bio && (
        <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">{co.users.bio}</p>
      )}

      {/* Note */}
      {co.availability_note && (
        <div className="bg-gray-50 rounded-lg px-3 py-2 text-xs text-gray-500 italic border border-gray-100">
          "{co.availability_note}"
        </div>
      )}

      {co.availability_last_updated_at && (
        <p className="text-[10px] text-gray-300 mt-auto pt-1">
          Updated {new Date(co.availability_last_updated_at).toLocaleDateString('en-TZ', { day: 'numeric', month: 'short', year: 'numeric' })}
        </p>
      )}
    </Card>
  );
}
