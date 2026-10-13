import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, CheckCircle2, Users, XCircle, Plus, ChevronRight, ShieldCheck, ShieldAlert, MapPin } from 'lucide-react';
import { hasLocation } from '../../lib/maps';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { getFacilityDashboardStats, getFacilityShifts, getFacilityProfile, checkMyFacilityHfr } from '../../lib/api';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { StatCard } from '../../components/common/Card';
import { StatCardSkeleton, ShiftCardSkeleton } from '../../components/common/Skeleton';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import {
  ActiveShiftsBanner, ACTIVE_SHIFT_SET, normalizeFacilityShift,
} from '../../components/shifts/ShiftProgressCard';

function HfrBanner({ profile, t }) {
  const problem = profile.hfr_code && ['not_found', 'not_operating'].includes(profile.hfr_status);
  const pending = profile.hfr_code && profile.hfr_status === 'operating';
  if (pending) {
    return (
      <div className="mb-6 rounded-2xl border border-teal-200 bg-teal-50 px-5 py-4 flex items-start gap-3 text-sm text-teal-800">
        <ShieldCheck className="w-5 h-5 shrink-0 mt-0.5" /><p>{t('facility.hfr_pending')}</p>
      </div>
    );
  }
  if (profile.hfr_code && !problem) return null;   // checking / check failed: nothing to do yet
  return (
    <div className={`mb-6 rounded-2xl border px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3 text-sm ${problem ? 'border-red-200 bg-red-50 text-red-800' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
      <div className="flex items-start gap-3 flex-1">
        <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" />
        <div>
          {!problem && <p className="font-semibold">{t('facility.hfr_banner_title')}</p>}
          <p>{problem ? t('facility.hfr_problem') : t('facility.hfr_banner_body')}</p>
        </div>
      </div>
      <Button to="/facility/profile" size="sm" variant="secondary">{t('facility.hfr_banner_cta')}</Button>
    </div>
  );
}

export default function FacilityDashboard() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [stats, setStats]           = useState(null);
  const [allShifts, setAllShifts]   = useState([]);
  const [recentShifts, setRecentShifts] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [profile, setProfile]       = useState(null);

  useEffect(() => {
    if (!user?.id) return;
    Promise.all([
      getFacilityDashboardStats(user.id),
      getFacilityShifts(user.id),
      getFacilityProfile(user.id),
    ]).then(([statsRes, shiftsRes, profileRes]) => {
      const p = profileRes.data;
      setProfile(p);
      // HFR code given at signup but never checked: look it up now (server rate-limits this)
      if (p?.hfr_code && (!p.hfr_status || p.hfr_status === 'unchecked')) {
        checkMyFacilityHfr('signup').then(() => getFacilityProfile(user.id)).then(({ data }) => data && setProfile(data));
      }
      setStats(statsRes);
      const shifts = shiftsRes.data || [];
      setAllShifts(shifts);
      setRecentShifts(shifts.slice(0, 5));
    }).finally(() => setLoading(false));
  }, [user?.id]);

  const activeShifts = allShifts
    .filter((s) => ACTIVE_SHIFT_SET.has(s.status))
    .map(normalizeFacilityShift);

  return (
    <PageWrapper
      title={t('facility.welcome', { name: user?.display_name || '' })}
      subtitle={t('facility.overview')}
      action={<Button to="/facility/post-shift"><Plus className="w-4 h-4" />{t('facility.post_shift')}</Button>}
    >
      {/* ── Google Maps location (needed to post shifts) ── */}
      {profile && !hasLocation(profile) && (
        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 text-red-800 px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3 text-sm">
          <div className="flex items-start gap-3 flex-1">
            <MapPin className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">{t('location.banner_title')}</p>
              <p>{t('location.banner_body')}</p>
            </div>
          </div>
          <Button to="/facility/profile" size="sm" variant="secondary">{t('location.banner_cta')}</Button>
        </div>
      )}

      {/* ── Facility verification (HFR) ── */}
      {profile && !profile.verified && (
        <HfrBanner profile={profile} t={t} />
      )}

      {/* ── Active shifts live tracker ── */}
      <ActiveShiftsBanner
        shifts={activeShifts}
        role="facility"
        viewAllLink="/facility/shifts"
        loading={loading}
      />

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <StatCard label={t('facility.open_shifts')}        value={stats?.openShifts ?? 0}        icon={CalendarDays}  color="teal"   to="/facility/shifts" />
            <StatCard label={t('facility.filled_shifts')}      value={stats?.filledShifts ?? 0}      icon={CheckCircle2}  color="blue"   to="/facility/shifts" />
            <StatCard label={t('facility.pending_applicants')} value={stats?.pendingApplicants ?? 0} icon={Users}         color="yellow" to="/facility/shifts" />
            <StatCard label={t('facility.cancelled')}          value={stats?.cancelledShifts ?? 0}   icon={XCircle}       color="red"    to="/facility/shifts" />
          </>
        )}
      </div>

      {/* Recent shifts */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">{t('facility.recent_shifts')}</h2>
          <Link to="/facility/shifts" className="text-sm text-teal-600 hover:underline font-medium">{t('facility.view_all')}</Link>
        </div>

        {loading ? (
          <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <ShiftCardSkeleton key={i} />)}</div>
        ) : recentShifts.length === 0 ? (
          <EmptyShifts t={t} />
        ) : (
          <div className="space-y-3">
            {recentShifts.map((shift) => <FacilityShiftRow key={shift.id} shift={shift} t={t} />)}
          </div>
        )}
      </div>
    </PageWrapper>
  );
}

function FacilityShiftRow({ shift, t }) {
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

function EmptyShifts({ t }) {
  return (
    <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-gray-200">
      <div className="w-16 h-16 bg-gradient-to-br from-teal-50 to-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-teal-100">
        <CalendarDays className="w-8 h-8 text-teal-500" />
      </div>
      <p className="font-semibold text-gray-700">{t('facility.no_shifts_yet')}</p>
      <p className="text-sm text-gray-400 mt-1 mb-5">{t('facility.post_first')}</p>
      <Button to="/facility/post-shift" size="sm"><Plus className="w-4 h-4" />{t('facility.post_first_btn')}</Button>
    </div>
  );
}
