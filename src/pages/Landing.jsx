import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Stethoscope, MapPin, Clock, Building2,
  ArrowRight, Search, Filter, Users, CalendarDays, Menu, X
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { ShiftCardSkeleton } from '../components/common/Skeleton';

const SHIFT_TYPES = ['All', 'Day (8AM-4PM)', 'Evening (4PM-10PM)', 'Night (10PM-6AM)', '24-Hour', 'Weekend'];

export default function Landing() {
  const { user, role, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  // Redirect signed-in users straight to their dashboard
  useEffect(() => {
    if (!authLoading && user && role) {
      navigate(role === 'co' ? '/co/dashboard' : '/facility/dashboard', { replace: true });
    }
  }, [user, role, authLoading, navigate]);

  const [shifts, setShifts] = useState([]);
  const [facilities, setFacilities] = useState([]);
  const [stats, setStats] = useState({ shifts: 0, facilities: 0 });
  const [filter, setFilter] = useState('All');
  const [loading, setLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    async function load() {
      // Fetch shifts and facility_profiles in separate queries (no direct FK between them)
      const [{ data: rawShifts }, { data: facilitiesData }] = await Promise.all([
        supabase
          .from('shifts')
          .select('*')
          .eq('status', 'open')
          .order('shift_date', { ascending: true }),
        supabase
          .from('facility_profiles')
          .select('user_id, facility_name, facility_type, address')
          .order('facility_name', { ascending: true })
          .limit(8),
      ]);

      // Attach facility info to each shift client-side
      const profileMap = Object.fromEntries(
        (facilitiesData || []).map((p) => [p.user_id, p])
      );
      const shiftsData = (rawShifts || []).map((s) => ({
        ...s,
        facility_profiles: profileMap[s.facility_id] || null,
      }));

      setShifts(shiftsData);
      setFacilities(facilitiesData || []);
      setStats({ shifts: shiftsData.length, facilities: (facilitiesData || []).length });
      setLoading(false);
    }
    load();
  }, []);

  const filtered = filter === 'All' ? shifts : shifts.filter((s) => s.shift_type === filter);

  function handleApply() {
    navigate('/auth/register?role=co');
  }

  // Don't flash the page while auth is resolving
  if (authLoading) return null;

  return (
    <div className="min-h-screen bg-white">
      {/* ── NAV (visitor-only — signed-in users are redirected to dashboard) ── */}
      <nav className="sticky top-0 z-40 bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 h-14 md:h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 font-bold text-teal-600 text-base md:text-lg">
            <Stethoscope className="w-5 h-5 md:w-6 md:h-6" />
            AfyaWork
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-3">
            <Link to="/auth/login" className="text-sm font-medium text-gray-600 hover:text-teal-600 transition-colors">
              Sign in
            </Link>
            <Link to="/auth/register?role=facility" className="text-sm font-medium text-gray-600 hover:text-teal-600 transition-colors">
              For Facilities
            </Link>
            <Link to="/auth/register?role=co" className="bg-teal-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-teal-700 transition-colors">
              Join as CO
            </Link>
          </div>

          {/* Mobile hamburger */}
          <button
            className="md:hidden p-2 rounded-lg hover:bg-gray-100 active:bg-gray-200 transition-colors"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5 text-gray-600" /> : <Menu className="w-5 h-5 text-gray-600" />}
          </button>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-gray-100 bg-white shadow-lg px-4 py-3 space-y-1">
            <Link to="/auth/login" onClick={() => setMobileMenuOpen(false)} className="block px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-xl">Sign in</Link>
            <Link to="/auth/register?role=facility" onClick={() => setMobileMenuOpen(false)} className="block px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-xl">Register as Facility</Link>
            <Link to="/auth/register?role=co" onClick={() => setMobileMenuOpen(false)} className="block px-4 py-3 text-sm font-medium text-teal-600 bg-teal-50 hover:bg-teal-100 rounded-xl">Join as Clinical Officer</Link>
          </div>
        )}
      </nav>

      {/* ── HERO ── */}
      <section className="bg-gradient-to-br from-teal-600 to-teal-800 text-white">
        <div className="max-w-6xl mx-auto px-4 py-16 md:py-20">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 bg-teal-500/40 text-teal-100 text-xs font-semibold px-3 py-1.5 rounded-full mb-5">
              <span className="w-1.5 h-1.5 bg-teal-300 rounded-full"></span>
              Dar es Salaam, Tanzania
            </div>
            <h1 className="text-3xl md:text-5xl font-extrabold leading-tight mb-4">
              Healthcare shifts,<br />done right.
            </h1>
            <p className="text-teal-100 text-lg mb-8 max-w-lg">
              AfyaWork connects verified Clinical Officers with private healthcare facilities. Browse open shifts or post your own — no WhatsApp groups needed.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link to="/auth/register?role=co" className="flex items-center gap-2 bg-white text-teal-700 font-semibold px-5 py-3 rounded-lg hover:bg-teal-50 transition-colors text-sm">
                Find Shifts <ArrowRight className="w-4 h-4" />
              </Link>
              <Link to="/auth/register?role=facility" className="flex items-center gap-2 bg-teal-500/40 text-white font-semibold px-5 py-3 rounded-lg hover:bg-teal-500/60 transition-colors text-sm border border-teal-400/50">
                Post a Shift
              </Link>
            </div>
          </div>
        </div>

        {/* Stats bar */}
        <div className="border-t border-teal-500/40">
          <div className="max-w-6xl mx-auto px-4 py-4 flex flex-wrap gap-6">
            <StatPill icon={CalendarDays} label="Open Shifts" value={loading ? '—' : stats.shifts} />
            <StatPill icon={Building2} label="Facilities" value={loading ? '—' : stats.facilities} />
            <StatPill icon={Users} label="Platform" value="Free to join" />
          </div>
        </div>
      </section>

      {/* ── OPEN SHIFTS ── */}
      <section className="max-w-6xl mx-auto px-4 py-12">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Open Shifts</h2>
            <p className="text-gray-500 text-sm mt-1">Available now in Dar es Salaam</p>
          </div>
          {user && role === 'co' && (
            <Link to="/co/shifts" className="text-sm text-teal-600 font-medium hover:underline flex items-center gap-1">
              View all <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          )}
        </div>

        {/* Filter pills */}
        <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-1">
          <Filter className="w-4 h-4 text-gray-400 shrink-0" />
          {SHIFT_TYPES.map((t) => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors
                ${filter === t ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              {t}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => <ShiftCardSkeleton key={i} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 bg-gray-50 rounded-xl border border-dashed border-gray-300">
            <Search className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="font-medium text-gray-700">No open shifts {filter !== 'All' ? `for "${filter}"` : 'right now'}</p>
            <p className="text-sm text-gray-400 mt-1">Check back soon — facilities post new shifts regularly.</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((shift) => (
              <PublicShiftCard
                key={shift.id}
                shift={shift}
                onApply={handleApply}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── PROVIDERS ── */}
      {facilities.length > 0 && (
        <section className="bg-gray-50 border-t border-gray-200">
          <div className="max-w-6xl mx-auto px-4 py-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Partnered Facilities</h2>
            <p className="text-gray-500 text-sm mb-6">Healthcare providers actively posting shifts on AfyaWork</p>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {facilities.map((f) => (
                <FacilityCard key={f.user_id} facility={f} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── BOTTOM CTA ── */}
      {!user && (
        <section className="bg-teal-600 text-white">
          <div className="max-w-4xl mx-auto px-4 py-16 text-center">
            <h2 className="text-3xl font-bold mb-3">Ready to get started?</h2>
            <p className="text-teal-100 mb-8 max-w-md mx-auto">
              Join hundreds of Clinical Officers and facilities already using AfyaWork.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Link to="/auth/register?role=co" className="bg-white text-teal-700 font-semibold px-6 py-3 rounded-lg hover:bg-teal-50 transition-colors text-sm">
                I'm a Clinical Officer
              </Link>
              <Link to="/auth/register?role=facility" className="bg-teal-500/40 border border-teal-400/50 text-white font-semibold px-6 py-3 rounded-lg hover:bg-teal-500/60 transition-colors text-sm">
                I'm a Healthcare Facility
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* ── FOOTER ── */}
      <footer className="border-t border-gray-200 bg-white">
        <div className="max-w-6xl mx-auto px-4 py-6 flex flex-col md:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-teal-600 font-bold text-sm">
            <Stethoscope className="w-4 h-4" />
            AfyaWork
          </div>
          <p className="text-xs text-gray-400">© 2026 AfyaWork. Healthcare workforce platform · Dar es Salaam, Tanzania</p>
        </div>
      </footer>
    </div>
  );
}

function StatPill({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-2 text-teal-100">
      <Icon className="w-4 h-4 text-teal-300" />
      <span className="font-bold text-white">{value}</span>
      <span className="text-sm">{label}</span>
    </div>
  );
}

function PublicShiftCard({ shift, onApply }) {
  const facility = shift.facility_profiles;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex flex-col gap-4 hover:shadow-md transition-shadow">
      <div>
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-gray-900">{shift.shift_type}</h3>
          <span className="text-lg font-bold text-teal-600 shrink-0">
            TZS {shift.pay_amount.toLocaleString()}
          </span>
        </div>
        <p className="text-sm font-medium text-gray-600 mt-1">{facility?.facility_name}</p>
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <Clock className="w-3.5 h-3.5" />
          {new Date(shift.shift_date + 'T00:00:00').toLocaleDateString('en-TZ', {
            weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
          })}
        </span>
        {facility?.address && (
          <span className="flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5" />
            {facility.address}
          </span>
        )}
      </div>

      {shift.description && (
        <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2 line-clamp-2">{shift.description}</p>
      )}

      <div className="mt-auto">
        <button
          onClick={onApply}
          className="w-full bg-teal-600 text-white text-sm font-medium py-2.5 rounded-lg hover:bg-teal-700 active:bg-teal-800 transition-colors"
        >
          Sign up to Apply
        </button>
      </div>
    </div>
  );
}

function FacilityCard({ facility }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col gap-2">
      <div className="w-10 h-10 rounded-lg bg-teal-50 flex items-center justify-center">
        <Building2 className="w-5 h-5 text-teal-600" />
      </div>
      <p className="font-semibold text-gray-900 text-sm leading-tight">{facility.facility_name}</p>
      {facility.facility_type && (
        <p className="text-xs text-gray-500">{facility.facility_type}</p>
      )}
      {facility.address && (
        <p className="text-xs text-gray-400 flex items-center gap-1">
          <MapPin className="w-3 h-3" />{facility.address}
        </p>
      )}
    </div>
  );
}
