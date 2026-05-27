import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Stethoscope, MapPin, Clock, Building2, ArrowRight, Filter, Users, CalendarDays, Menu, X, Shield, Zap, Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { ShiftCardSkeleton } from '../components/common/Skeleton';
import { LanguageToggle } from '../components/common/LanguageToggle';

const SHIFT_TYPES = ['All', 'Day (8AM-4PM)', 'Evening (4PM-10PM)', 'Night (10PM-6AM)', '24-Hour', 'Weekend'];

export default function Landing() {
  const { t } = useTranslation();
  const { user, role, signOut, loading: authLoading } = useAuth();

  const dashboardUrl = role === 'co' ? '/co/dashboard' : role === 'facility' ? '/facility/dashboard' : '/admin/dashboard';
  const navigate = useNavigate();

const [shifts, setShifts] = useState([]);
  const [facilities, setFacilities] = useState([]);
  const [stats, setStats] = useState({ shifts: 0, facilities: 0 });
  const [filter, setFilter] = useState('All');
  const [loading, setLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    async function load() {
      const [{ data: rawShifts }, { data: facilitiesData }] = await Promise.all([
        supabase.from('shifts').select('*').eq('status', 'open').order('shift_date', { ascending: true }),
        supabase.from('facility_profiles').select('user_id, facility_name, facility_type, address').order('facility_name', { ascending: true }).limit(8),
      ]);
      const profileMap = Object.fromEntries((facilitiesData || []).map((p) => [p.user_id, p]));
      const shiftsData = (rawShifts || []).map((s) => ({ ...s, facility_profiles: profileMap[s.facility_id] || null }));
      setShifts(shiftsData);
      setFacilities(facilitiesData || []);
      setStats({ shifts: shiftsData.length, facilities: (facilitiesData || []).length });
      setLoading(false);
    }
    load();
  }, []);

  const filtered = filter === 'All' ? shifts : shifts.filter((s) => s.shift_type === filter);

  if (authLoading) return null;

  return (
    <div className="min-h-screen bg-white">
      {/* ── NAV ── */}
      <nav className="sticky top-0 z-40 bg-white/95 backdrop-blur-sm border-b border-gray-100 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 group">
            <div className="w-8 h-8 bg-gradient-to-br from-teal-600 to-emerald-500 rounded-lg flex items-center justify-center shadow-sm group-hover:shadow transition-shadow">
              <Stethoscope className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-gray-900 text-base md:text-lg tracking-tight">
              Afya<span className="text-teal-600">Work</span>
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-4">
            <LanguageToggle />
            <div className="h-5 w-px bg-gray-200" />
            {user ? (
              <>
                <button onClick={signOut} className="text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors">
                  Sign out
                </button>
                <Link to={dashboardUrl} className="bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-700 hover:to-teal-600 text-white text-sm font-semibold px-4 py-2 rounded-xl shadow-sm hover:shadow transition-all active:scale-95">
                  Dashboard
                </Link>
              </>
            ) : (
              <>
                <Link to="/auth/login" className="text-sm font-medium text-gray-600 hover:text-teal-600 transition-colors">
                  {t('landing.sign_in')}
                </Link>
                <Link to="/auth/register?role=facility" className="text-sm font-medium text-gray-600 hover:text-teal-600 transition-colors">
                  {t('landing.for_facilities')}
                </Link>
                <Link to="/auth/register?role=co" className="bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-700 hover:to-teal-600 text-white text-sm font-semibold px-4 py-2 rounded-xl shadow-sm hover:shadow transition-all active:scale-95">
                  {t('landing.join_as_worker')}
                </Link>
              </>
            )}
          </div>

          <div className="md:hidden flex items-center gap-2">
            <LanguageToggle />
            <button className="p-2 rounded-lg hover:bg-gray-100 transition-colors" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
              {mobileMenuOpen ? <X className="w-5 h-5 text-gray-600" /> : <Menu className="w-5 h-5 text-gray-600" />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden border-t border-gray-100 bg-white shadow-lg px-4 py-3 space-y-1">
            {user ? (
              <>
                <Link to={dashboardUrl} onClick={() => setMobileMenuOpen(false)} className="block px-4 py-3 text-sm font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-xl">Dashboard</Link>
                <button onClick={() => { signOut(); setMobileMenuOpen(false); }} className="block w-full text-left px-4 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50 rounded-xl">Sign out</button>
              </>
            ) : (
              <>
                <Link to="/auth/login" onClick={() => setMobileMenuOpen(false)} className="block px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-xl">{t('landing.sign_in')}</Link>
                <Link to="/auth/register?role=facility" onClick={() => setMobileMenuOpen(false)} className="block px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-xl">{t('landing.register_facility')}</Link>
                <Link to="/auth/register?role=co" onClick={() => setMobileMenuOpen(false)} className="block px-4 py-3 text-sm font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-xl">{t('landing.join_as_co')}</Link>
              </>
            )}
          </div>
        )}
      </nav>

      {/* ── HERO ── */}
      <section className="relative bg-gradient-to-br from-slate-900 via-slate-800 to-teal-900 text-white overflow-hidden">
        {/* Decorative circles */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-teal-500/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 w-64 h-64 bg-emerald-500/10 rounded-full translate-y-1/2 blur-3xl" />

        <div className="relative max-w-6xl mx-auto px-4 py-20 md:py-28">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 bg-teal-500/20 border border-teal-400/30 text-teal-300 text-xs font-semibold px-4 py-2 rounded-full mb-6">
              <span className="w-2 h-2 bg-teal-400 rounded-full animate-pulse" />
              {t('landing.badge')}
            </div>
            <h1 className="text-4xl md:text-6xl font-extrabold leading-tight mb-5 tracking-tight">
              {t('landing.hero_title').split('\n').map((line, i) => (
                <span key={i}>{i > 0 && <br />}{i === 0 ? line : <span className="text-teal-400">{line}</span>}</span>
              ))}
            </h1>
            <p className="text-slate-300 text-lg mb-8 max-w-lg leading-relaxed">
              {t('landing.hero_sub')}
            </p>
            <div className="flex flex-wrap gap-3">
              <Link to="/auth/register?role=co" className="flex items-center gap-2 bg-white text-slate-900 font-bold px-6 py-3.5 rounded-xl hover:bg-teal-50 transition-all shadow-lg hover:shadow-xl active:scale-95 text-sm">
                {t('landing.find_shifts')} <ArrowRight className="w-4 h-4" />
              </Link>
              <Link to="/auth/register?role=facility" className="flex items-center gap-2 bg-white/10 border border-white/20 text-white font-semibold px-6 py-3.5 rounded-xl hover:bg-white/20 transition-all text-sm">
                {t('landing.post_shift')}
              </Link>
            </div>

            {/* Trust badges */}
            <div className="flex flex-wrap gap-4 mt-8 pt-8 border-t border-white/10">
              <TrustBadge icon={Shield} text="Verified professionals" />
              <TrustBadge icon={Zap} text="Instant matching" />
              <TrustBadge icon={Star} text="Free to join" />
            </div>
          </div>
        </div>

        {/* Stats bar */}
        <div className="relative border-t border-white/10 bg-white/5 backdrop-blur-sm">
          <div className="max-w-6xl mx-auto px-4 py-4 flex flex-wrap gap-8">
            <StatPill icon={CalendarDays} label={t('landing.open_shifts')} value={loading ? '—' : stats.shifts} />
            <StatPill icon={Building2} label={t('landing.facilities')} value={loading ? '—' : stats.facilities} />
            <StatPill icon={Users} label={t('landing.free_to_join')} value="✓" />
          </div>
        </div>
      </section>

      {/* ── OPEN SHIFTS ── */}
      <section className="max-w-6xl mx-auto px-4 py-14">
        <div className="flex items-end justify-between mb-8">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900">{t('landing.open_shifts_section')}</h2>
            <p className="text-gray-500 text-sm mt-1">{t('landing.available_now')}</p>
          </div>
        </div>

        {/* Filter pills */}
        <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-2 scrollbar-hide">
          <Filter className="w-4 h-4 text-gray-400 shrink-0" />
          {SHIFT_TYPES.map((type) => (
            <button
              key={type}
              onClick={() => setFilter(type)}
              className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                filter === type
                  ? 'bg-teal-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {type === 'All' ? t('common.all') : type}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => <ShiftCardSkeleton key={i} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
            <CalendarDays className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="font-semibold text-gray-700">{t('landing.no_shifts')}</p>
            <p className="text-sm text-gray-400 mt-1">{t('landing.check_back')}</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((shift) => <PublicShiftCard key={shift.id} shift={shift} onApply={() => navigate('/auth/register?role=co')} t={t} />)}
          </div>
        )}
      </section>

      {/* ── PARTNERED FACILITIES ── */}
      {facilities.length > 0 && (
        <section className="bg-slate-50 border-t border-gray-100">
          <div className="max-w-6xl mx-auto px-4 py-14">
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">{t('landing.partnered_facilities')}</h2>
            <p className="text-gray-500 text-sm mb-8">{t('landing.facilities_sub')}</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {facilities.map((f) => <FacilityCard key={f.user_id} facility={f} />)}
            </div>
          </div>
        </section>
      )}

      {/* ── BOTTOM CTA ── */}
      {!user && (
        <section className="relative bg-gradient-to-br from-teal-600 to-emerald-700 text-white overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(255,255,255,0.1),_transparent)]" />
          <div className="relative max-w-4xl mx-auto px-4 py-20 text-center">
            <h2 className="text-3xl md:text-4xl font-extrabold mb-4 tracking-tight">{t('landing.ready')}</h2>
            <p className="text-teal-100 mb-10 max-w-md mx-auto text-lg leading-relaxed">{t('landing.join_hundreds')}</p>
            <div className="flex flex-wrap justify-center gap-4">
              <Link to="/auth/register?role=co" className="bg-white text-teal-700 font-bold px-8 py-4 rounded-xl hover:bg-teal-50 transition-all shadow-lg hover:shadow-xl active:scale-95 text-sm">
                {t('landing.im_co')}
              </Link>
              <Link to="/auth/register?role=facility" className="bg-white/15 border border-white/30 text-white font-bold px-8 py-4 rounded-xl hover:bg-white/25 transition-all text-sm">
                {t('landing.im_facility')}
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* ── FOOTER ── */}
      <footer className="border-t border-gray-100 bg-white">
        <div className="max-w-6xl mx-auto px-4 py-6 flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-gradient-to-br from-teal-600 to-emerald-500 rounded-md flex items-center justify-center">
              <Stethoscope className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-bold text-gray-800 text-sm">Afya<span className="text-teal-600">Work</span></span>
          </div>
          <p className="text-xs text-gray-400">{t('landing.footer')}</p>
        </div>
      </footer>
    </div>
  );
}

function TrustBadge({ icon: Icon, text }) {
  return (
    <div className="flex items-center gap-2 text-slate-300 text-sm">
      <Icon className="w-4 h-4 text-teal-400" />
      <span>{text}</span>
    </div>
  );
}

function StatPill({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-2.5 text-white">
      <div className="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center">
        <Icon className="w-4 h-4 text-teal-300" />
      </div>
      <div>
        <p className="font-bold text-lg leading-none">{value}</p>
        <p className="text-xs text-slate-400 mt-0.5">{label}</p>
      </div>
    </div>
  );
}

function PublicShiftCard({ shift, onApply, t }) {
  const facility = shift.facility_profiles;
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col gap-4 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
      <div>
        <div className="flex items-start justify-between gap-2 mb-1">
          <span className="inline-flex items-center px-2.5 py-1 bg-teal-50 text-teal-700 text-xs font-semibold rounded-lg">
            {shift.shift_type}
          </span>
          <span className="text-lg font-extrabold text-gray-900 shrink-0">
            TZS {shift.pay_amount.toLocaleString()}
          </span>
        </div>
        <p className="font-semibold text-gray-800 mt-2">{facility?.facility_name}</p>
        {facility?.facility_type && (
          <p className="text-xs text-gray-400 mt-0.5">{facility.facility_type}</p>
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
        <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2 line-clamp-2">{shift.description}</p>
      )}

      <div className="mt-auto">
        <button
          onClick={onApply}
          className="w-full bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-700 hover:to-teal-600 text-white text-sm font-semibold py-2.5 rounded-xl transition-all shadow-sm hover:shadow active:scale-95"
        >
          {t('landing.sign_up_to_apply')}
        </button>
      </div>
    </div>
  );
}

function FacilityCard({ facility }) {
  const initials = facility.facility_name?.slice(0, 2).toUpperCase() || '?';
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col gap-3 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-500 flex items-center justify-center text-white font-bold text-sm shadow-sm">
        {initials}
      </div>
      <div>
        <p className="font-semibold text-gray-900 text-sm leading-tight">{facility.facility_name}</p>
        {facility.facility_type && <p className="text-xs text-gray-400 mt-0.5">{facility.facility_type}</p>}
        {facility.address && (
          <p className="text-xs text-gray-400 flex items-center gap-1 mt-1.5">
            <MapPin className="w-3 h-3" />{facility.address}
          </p>
        )}
      </div>
    </div>
  );
}
