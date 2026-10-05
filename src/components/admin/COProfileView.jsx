import { useEffect, useState } from 'react';
import {
  UserCircle, Briefcase, Smartphone, FileText, ShieldCheck, CheckCircle2, AlertTriangle,
  Calendar, MapPin, Clock, Award, Stethoscope, Star, Zap, ClipboardList, Pencil, Send, Trash2, BadgeCheck, Info,
} from 'lucide-react';
import { getAdminWorkerDetail } from '../../lib/api';
import { Badge, AvailabilityBadge } from '../common/Badge';
import { Button } from '../common/Button';
import {
  ProfileDrawer, DrawerSkeleton, ProfilePhoto, Section, Field, StatTile, ContactButtons,
  AccountStatusBadge, RatingsList, ChecklistCard, CompletenessBar,
} from './ProfileKit';
import { coCompleteness, formatDate, formatTZS } from './profileUtils';
import { MctVerificationPanel, MctStatusBadge } from './MctVerification';

// Mirrors the options on the CO's own Profile page
const TIERS = [
  { key: 'msingi',  label: 'Msingi (Free)', price: 'TZS 0/mo',      desc: 'Standard matching — shifts visible 30 min after paid tiers', icon: Stethoscope },
  { key: 'daktari', label: 'Daktari',       price: 'TZS 15,000/mo', desc: 'Priority matching — 30 min early access to new shifts', icon: Star },
  { key: 'bingwa',  label: 'Bingwa',        price: 'TZS 30,000/mo', desc: 'First access to emergency shifts + Verified badge', icon: Zap },
];
const LOCATION_LABELS = { dar_only: 'Dar es Salaam only', open_regions: 'Open to all regions' };
const EMPLOYMENT_LABELS = {
  employed_looking: 'Currently employed, looking to move',
  locum_only:       'Currently doing locum shifts only',
  unemployed:       'Unemployed / between roles',
};
const MM_LABELS = { mpesa: 'M-Pesa', mixx_by_yas: 'Mixx by Yas', airtel_money: 'Airtel Money', halopesa: 'Halopesa' };

function availableFrom(immediately, date) {
  if (immediately) return 'Immediately available';
  if (date) return 'From ' + new Date(date + 'T00:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  return '—';
}

function Tabs({ tab, setTab, counts }) {
  const items = [
    { key: 'profile',  label: 'Profile' },
    { key: 'activity', label: `Shift activity (${counts.activity})` },
    { key: 'ratings',  label: `Ratings (${counts.ratings})` },
  ];
  return (
    <div className="flex gap-1 border-b border-gray-200 px-6">
      {items.map((t) => (
        <button
          key={t.key}
          onClick={() => setTab(t.key)}
          className={`px-3 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === t.key ? 'border-teal-600 text-teal-700' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function COProfileView({ userId, onClose, onEdit, onResend, onDelete, resending, onVerificationChange }) {
  const [data, setData] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('profile');

  useEffect(() => {
    let alive = true;
    getAdminWorkerDetail(userId).then(({ data, error }) => {
      if (!alive) return;
      if (error) setError(error.message); else setData(data);
    });
    return () => { alive = false; };
  }, [userId, reloadKey]);

  function verificationChanged() {
    setReloadKey((k) => k + 1);
    onVerificationChange?.();
  }

  const p = data?.profile;
  const u = p?.users || {};
  const status = u.account_status || 'active';
  const isPending = status === 'pending_invite' || status === 'expired';
  const completeness = p ? coCompleteness({ ...p, mobileMoney: data.mobileMoney }) : null;
  const tier = p?.subscription_tier || 'msingi';
  const isOpen = ['open_fulltime', 'open_parttime'].includes(p?.employment_availability_status);

  const footer = p && (
    <div className="flex items-center gap-2">
      <p className="text-xs text-gray-400 mr-auto hidden sm:block">Read-only view of what this Clinical Officer has on their profile.</p>
      {isPending && (
        <Button size="sm" variant="secondary" loading={resending} onClick={() => onResend(p)}>
          <Send className="w-4 h-4" /> Resend invite
        </Button>
      )}
      <Button size="sm" variant="secondary" onClick={() => onEdit(p)}>
        <Pencil className="w-4 h-4" /> Edit
      </Button>
      <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" onClick={() => onDelete(p)}>
        <Trash2 className="w-4 h-4" /> Delete
      </Button>
    </div>
  );

  return (
    <ProfileDrawer onClose={onClose} footer={footer}>
      {error ? (
        <div className="p-10 text-center text-sm text-red-600">Could not load profile: {error}</div>
      ) : !p ? (
        <DrawerSkeleton />
      ) : (
        <>
          {/* ── Header ── */}
          <div className="bg-white">
            <div className="h-28 bg-gradient-to-r from-teal-600 via-teal-500 to-emerald-400" />
            <div className="px-6 pb-5">
              <div className="flex items-end justify-between gap-4 -mt-12">
                <ProfilePhoto src={u.avatar_url} name={u.display_name} />
                <div className="pb-1 hidden sm:block"><ContactButtons email={u.email} phone={u.phone} /></div>
              </div>
              <div className="mt-3 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-2xl font-bold text-gray-900">{u.display_name || '—'}</h2>
                  {p.verified && (
                    <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full font-medium">
                      <BadgeCheck className="w-3.5 h-3.5" /> Verified CO
                    </span>
                  )}
                  <MctStatusBadge status={p.mct_status} />
                </div>
                <p className="text-sm text-gray-500 mt-0.5 flex items-center gap-1.5">
                  <Award className="w-4 h-4 text-gray-400" />
                  {p.license_number || 'No licence number'} · {p.specialization || 'General'}
                </p>
              </div>
              <div className="sm:hidden mt-3"><ContactButtons email={u.email} phone={u.phone} /></div>
              <div className="flex flex-wrap items-center gap-2 mt-3">
                <AccountStatusBadge status={status} />
                <Badge status={tier} />
                <AvailabilityBadge status={p.employment_availability_status} />
                <span className="text-xs text-gray-400 ml-1">Joined {formatDate(u.created_at)}</span>
              </div>
            </div>
            <Tabs tab={tab} setTab={setTab} counts={{ activity: data.applications.length, ratings: data.ratings.length }} />
          </div>

          <div className="p-6">
            {tab === 'profile' && (
              <div className="grid lg:grid-cols-3 gap-5">
                <div className="lg:col-span-2 space-y-5">
                  <MctVerificationPanel profile={p} onChanged={verificationChanged} />

                  <Section icon={UserCircle} title="Personal Information">
                    <div className="grid sm:grid-cols-2 gap-4">
                      <Field label="Full Name" value={u.display_name} />
                      <Field label="Email" value={u.email} />
                      <Field label="Phone" value={u.phone} />
                      <Field label="License Number" value={p.license_number} mono />
                      <Field label="Specialization" value={p.specialization} />
                    </div>
                    <div className="mt-4">
                      <span className="text-sm font-medium text-gray-700">About</span>
                      {u.bio ? (
                        <p className="mt-1 text-sm text-gray-700 leading-relaxed whitespace-pre-wrap bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5">{u.bio}</p>
                      ) : (
                        <p className="mt-1 text-sm text-gray-400 italic">No bio yet.</p>
                      )}
                    </div>
                  </Section>

                  <Section icon={Briefcase} title="Employment Availability">
                    {!p.employment_availability_status ? (
                      <p className="text-sm text-gray-400 italic">Not set yet.</p>
                    ) : p.employment_availability_status === 'not_looking' ? (
                      <p className="flex items-center gap-2 text-sm text-gray-500">
                        <span className="w-2 h-2 rounded-full bg-gray-400" /> Not currently looking for full-time or permanent roles.
                        <span className="text-xs text-gray-400">(Hidden from facility search)</span>
                      </p>
                    ) : (
                      <div className="space-y-3">
                        <AvailabilityBadge status={p.employment_availability_status} />
                        <div className="grid sm:grid-cols-2 gap-3 text-sm">
                          <div className="flex items-start gap-2 text-gray-600">
                            <Calendar className="w-4 h-4 text-gray-400 mt-0.5" />
                            <div><p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Available from</p><p>{availableFrom(p.available_from_immediately, p.available_from_date)}</p></div>
                          </div>
                          <div className="flex items-start gap-2 text-gray-600">
                            <MapPin className="w-4 h-4 text-gray-400 mt-0.5" />
                            <div><p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Preferred location</p>
                              <p>{p.preferred_location === 'specific_region' ? (p.preferred_location_text || '—') : (LOCATION_LABELS[p.preferred_location] || '—')}</p></div>
                          </div>
                        </div>
                        {p.availability_note && (
                          <div className="bg-gray-50 rounded-lg px-4 py-3 text-sm text-gray-600 italic border border-gray-100">"{p.availability_note}"</div>
                        )}
                      </div>
                    )}
                    {p.current_employment_status && (
                      <div className="flex items-start gap-2 text-sm text-gray-600 mt-3">
                        <Clock className="w-4 h-4 text-gray-400 mt-0.5" />
                        <div><p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Current situation</p><p>{EMPLOYMENT_LABELS[p.current_employment_status]}</p></div>
                      </div>
                    )}
                    {p.availability_last_updated_at && (
                      <p className="text-xs text-gray-400 mt-3">Last updated {formatDate(p.availability_last_updated_at)}</p>
                    )}
                    {isOpen && <p className="text-xs text-green-700 mt-2">Visible in facility search.</p>}
                  </Section>

                  <Section
                    icon={Smartphone}
                    title="Mobile Money"
                    action={data.mobileMoney
                      ? <span className="flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full font-medium"><CheckCircle2 className="w-3 h-3" /> Saved</span>
                      : <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full font-medium">Missing — cannot be paid</span>}
                  >
                    {data.mobileMoney ? (
                      <>
                        <div className="grid sm:grid-cols-3 gap-4">
                          <Field label="Provider" value={MM_LABELS[data.mobileMoney.mobile_money_provider]} />
                          <Field label="Number" value={data.mobileMoney.mobile_money_number} mono />
                          <Field label="Account Name" value={data.mobileMoney.account_name} />
                        </div>
                        <div className="flex flex-wrap gap-3 mt-3 text-xs">
                          <span className={data.mobileMoney.number_verified ? 'text-emerald-700' : 'text-gray-400'}>
                            {data.mobileMoney.number_verified ? '✓ Number verified' : 'Number not verified'}
                          </span>
                          {data.mobileMoney.provider_mismatch_warning_shown && (
                            <span className="inline-flex items-center gap-1 text-amber-700"><AlertTriangle className="w-3 h-3" /> CO saved despite a provider/number mismatch warning</span>
                          )}
                          <span className="text-gray-400">Updated {formatDate(data.mobileMoney.updated_at)}</span>
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-gray-400 italic">No mobile money details saved yet.</p>
                    )}
                  </Section>

                  <Section icon={FileText} title="Legal & Contracts">
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${p.ica_signed_at ? 'bg-green-50' : 'bg-amber-50'}`}>
                          {p.ica_signed_at ? <ShieldCheck className="w-5 h-5 text-green-600" /> : <FileText className="w-5 h-5 text-amber-500" />}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900">Independent Contractor Agreement</p>
                          <p className={`text-xs ${p.ica_signed_at ? 'text-green-700' : 'text-amber-700'}`}>
                            {p.ica_signed_at ? `Signed ${formatDate(p.ica_signed_at)}` : 'Not yet signed — cannot apply for shifts'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${u.tos_agreed_at ? 'bg-green-50' : 'bg-gray-100'}`}>
                          <CheckCircle2 className={`w-5 h-5 ${u.tos_agreed_at ? 'text-green-600' : 'text-gray-400'}`} />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900">Terms of Service & Privacy Policy</p>
                          <p className="text-xs text-gray-500">{u.tos_agreed_at ? `Accepted ${formatDate(u.tos_agreed_at)}` : 'Not recorded'}</p>
                        </div>
                      </div>
                    </div>
                  </Section>
                </div>

                {/* ── Sidebar ── */}
                <div className="space-y-5">
                  <Section icon={Info} title="Profile completeness">
                    <CompletenessBar result={completeness} className="mb-4" />
                    <ChecklistCard result={completeness} />
                  </Section>

                  <Section icon={Star} title="Subscription Tier">
                    <div className="space-y-2">
                      {TIERS.map((t) => {
                        const Icon = t.icon;
                        const current = tier === t.key;
                        return (
                          <div key={t.key} className={`p-3 rounded-lg border ${current ? 'border-teal-300 bg-teal-50' : 'border-gray-200 opacity-60'}`}>
                            <div className="flex items-center gap-2">
                              <Icon className="w-4 h-4 text-teal-600" />
                              <span className="text-sm font-semibold text-gray-900">{t.label}</span>
                              {current && <span className="text-xs text-teal-600 font-medium ml-auto">Current</span>}
                            </div>
                            <p className="text-xs text-gray-500 mt-1">{t.desc}</p>
                          </div>
                        );
                      })}
                    </div>
                  </Section>

                  <Section icon={Calendar} title="Account">
                    <dl className="text-sm space-y-2">
                      <div className="flex justify-between"><dt className="text-gray-500">Status</dt><dd><AccountStatusBadge status={status} /></dd></div>
                      <div className="flex justify-between"><dt className="text-gray-500">Created</dt><dd className="text-gray-800">{formatDate(u.created_at)}</dd></div>
                      <div className="flex justify-between"><dt className="text-gray-500">Invited</dt><dd className="text-gray-800">{formatDate(u.invited_at)}</dd></div>
                      <div className="flex justify-between"><dt className="text-gray-500">Activated</dt><dd className="text-gray-800">{formatDate(u.activated_at)}</dd></div>
                      <div className="flex justify-between"><dt className="text-gray-500">Verified</dt><dd className="text-gray-800">{p.verified ? formatDate(p.verified_at) : 'No'}</dd></div>
                    </dl>
                  </Section>
                </div>
              </div>
            )}

            {tab === 'activity' && (
              <div className="space-y-5">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <StatTile label="Applications" value={data.stats.applied} />
                  <StatTile label="Approved" value={data.stats.approved} tone="purple" />
                  <StatTile label="Shifts completed" value={data.stats.completed} tone="green" />
                  <StatTile label="No-shows" value={data.stats.noShows} tone={data.stats.noShows ? 'red' : 'gray'} />
                </div>
                <Section icon={ClipboardList} title="Applications">
                  {data.applications.length === 0 ? (
                    <p className="text-sm text-gray-400 italic">This CO has not applied for any shifts yet.</p>
                  ) : (
                    <div className="overflow-x-auto -mx-5">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-xs text-gray-400 uppercase tracking-wider border-b border-gray-100">
                            <th className="text-left font-semibold px-5 py-2">Shift</th>
                            <th className="text-left font-semibold px-5 py-2">Facility</th>
                            <th className="text-left font-semibold px-5 py-2">Pay</th>
                            <th className="text-left font-semibold px-5 py-2">Application</th>
                            <th className="text-left font-semibold px-5 py-2">Shift status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {data.applications.map((a) => (
                            <tr key={a.id}>
                              <td className="px-5 py-2.5">
                                <p className="text-gray-800">{formatDate(a.shifts?.shift_date)}</p>
                                <p className="text-xs text-gray-400 capitalize">{a.shifts?.shift_type} · applied {formatDate(a.applied_at)}</p>
                              </td>
                              <td className="px-5 py-2.5 text-gray-700">{a.facility_name || '—'}</td>
                              <td className="px-5 py-2.5 text-gray-700 whitespace-nowrap">{a.shifts ? formatTZS(a.shifts.pay_amount) : '—'}</td>
                              <td className="px-5 py-2.5"><Badge status={a.status} /></td>
                              <td className="px-5 py-2.5">{a.shifts?.status ? <Badge status={a.shifts.status} /> : '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Section>
              </div>
            )}

            {tab === 'ratings' && (
              <Section icon={Star} title="Ratings from facilities">
                <RatingsList ratings={data.ratings} emptyText="No facility has rated this CO yet." />
              </Section>
            )}
          </div>
        </>
      )}
    </ProfileDrawer>
  );
}
