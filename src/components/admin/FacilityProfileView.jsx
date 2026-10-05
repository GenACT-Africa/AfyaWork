import { useEffect, useState } from 'react';
import { Building2, MapPin, CreditCard, Calendar, Info, Star, CalendarDays, Pencil, Send, Trash2, CheckCircle2 } from 'lucide-react';
import { getAdminFacilityDetail } from '../../lib/api';
import { Badge } from '../common/Badge';
import { Button } from '../common/Button';
import {
  ProfileDrawer, DrawerSkeleton, ProfilePhoto, Section, Field, StatTile, ContactButtons,
  AccountStatusBadge, RatingsList, ChecklistCard, CompletenessBar,
} from './ProfileKit';
import { facilityCompleteness, formatDate, formatTZS } from './profileUtils';

// Mirrors the plans on the facility's own Profile page
const PLANS = [
  { key: 'payg',       label: 'Pay-as-you-go', price: 'TZS 0/mo',       fee: '18.6% of CO pay' },
  { key: 'starter',    label: 'Starter',       price: 'TZS 30,000/mo',  fee: 'TZS 8,000 flat per shift' },
  { key: 'growth',     label: 'Growth',        price: 'TZS 60,000/mo',  fee: 'TZS 6,000 flat per shift' },
  { key: 'enterprise', label: 'Enterprise',    price: 'TZS 100,000/mo', fee: 'TZS 4,000 flat per shift' },
];

export function FacilityProfileView({ userId, onClose, onEdit, onResend, onDelete, resending }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('profile');

  useEffect(() => {
    let alive = true;
    getAdminFacilityDetail(userId).then(({ data, error }) => {
      if (!alive) return;
      if (error) setError(error.message); else setData(data);
    });
    return () => { alive = false; };
  }, [userId]);

  const f = data?.profile;
  const u = f?.users || {};
  const status = u.account_status || 'active';
  const isPending = status === 'pending_invite' || status === 'expired';
  const completeness = f ? facilityCompleteness(f) : null;
  const plan = f?.subscription_plan || 'payg';

  const footer = f && (
    <div className="flex items-center gap-2">
      <p className="text-xs text-gray-400 mr-auto hidden sm:block">Read-only view of what this facility has on its profile.</p>
      {isPending && (
        <Button size="sm" variant="secondary" loading={resending} onClick={() => onResend(f)}>
          <Send className="w-4 h-4" /> Resend invite
        </Button>
      )}
      <Button size="sm" variant="secondary" onClick={() => onEdit(f)}>
        <Pencil className="w-4 h-4" /> Edit
      </Button>
      <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" onClick={() => onDelete(f)}>
        <Trash2 className="w-4 h-4" /> Delete
      </Button>
    </div>
  );

  const tabs = [
    { key: 'profile', label: 'Profile' },
    { key: 'shifts',  label: `Shifts posted (${data?.shifts.length ?? 0})` },
    { key: 'ratings', label: `Ratings (${data?.ratings.length ?? 0})` },
  ];

  return (
    <ProfileDrawer onClose={onClose} footer={footer}>
      {error ? (
        <div className="p-10 text-center text-sm text-red-600">Could not load profile: {error}</div>
      ) : !f ? (
        <DrawerSkeleton />
      ) : (
        <>
          <div className="bg-white">
            <div className="h-28 bg-gradient-to-r from-sky-700 via-teal-600 to-emerald-500" />
            <div className="px-6 pb-5">
              <div className="flex items-end justify-between gap-4 -mt-12">
                <ProfilePhoto src={u.avatar_url} name={f.facility_name} shape="rounded" />
                <div className="pb-1 hidden sm:block"><ContactButtons email={u.email} phone={u.phone} /></div>
              </div>
              <div className="mt-3 min-w-0">
                <h2 className="text-2xl font-bold text-gray-900">{f.facility_name}</h2>
                <p className="text-sm text-gray-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                  <Building2 className="w-4 h-4 text-gray-400" /> {f.facility_type || 'Type not set'}
                  {f.address && <><span className="text-gray-300">·</span><MapPin className="w-4 h-4 text-gray-400" /> {f.address}</>}
                </p>
              </div>
              <div className="sm:hidden mt-3"><ContactButtons email={u.email} phone={u.phone} /></div>
              <div className="flex flex-wrap items-center gap-2 mt-3">
                <AccountStatusBadge status={status} />
                <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-sky-50 text-sky-700 ring-1 ring-sky-200">
                  {PLANS.find((p) => p.key === plan)?.label || plan}
                </span>
                <span className="text-xs text-gray-400 ml-1">Joined {formatDate(u.created_at)}</span>
              </div>
            </div>
            <div className="flex gap-1 border-b border-gray-200 px-6">
              {tabs.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`px-3 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === t.key ? 'border-teal-600 text-teal-700' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="p-6">
            {tab === 'profile' && (
              <div className="grid lg:grid-cols-3 gap-5">
                <div className="lg:col-span-2 space-y-5">
                  <Section icon={Building2} title="Facility Information">
                    <div className="grid sm:grid-cols-2 gap-4">
                      <Field label="Facility Name" value={f.facility_name} />
                      <Field label="Facility Type" value={f.facility_type} />
                      <Field label="Contact Email" value={u.email} />
                      <Field label="Contact Phone" value={u.phone} />
                      <div className="sm:col-span-2"><Field label="Address" value={f.address} /></div>
                    </div>
                    <div className="mt-4">
                      <span className="text-sm font-medium text-gray-700">About</span>
                      {u.bio ? (
                        <p className="mt-1 text-sm text-gray-700 leading-relaxed whitespace-pre-wrap bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5">{u.bio}</p>
                      ) : (
                        <p className="mt-1 text-sm text-gray-400 italic">No description yet.</p>
                      )}
                    </div>
                  </Section>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <StatTile label="Shifts posted" value={data.stats.total} />
                    <StatTile label="Open now" value={data.stats.open} tone="teal" />
                    <StatTile label="Completed" value={data.stats.completed} tone="green" />
                    <StatTile label="TZS paid to COs" value={Number(data.stats.spend).toLocaleString('en-US')} tone="purple" />
                  </div>

                  <Section icon={CheckCircle2} title="Legal">
                    <p className="text-sm text-gray-700">
                      Terms of Service & Privacy Policy:{' '}
                      <span className={u.tos_agreed_at ? 'text-green-700 font-medium' : 'text-gray-400'}>
                        {u.tos_agreed_at ? `accepted ${formatDate(u.tos_agreed_at)}` : 'not recorded'}
                      </span>
                    </p>
                  </Section>
                </div>

                <div className="space-y-5">
                  <Section icon={Info} title="Profile completeness">
                    <CompletenessBar result={completeness} className="mb-4" />
                    <ChecklistCard result={completeness} />
                  </Section>

                  <Section icon={CreditCard} title="Subscription Plan">
                    <div className="space-y-2">
                      {PLANS.map((p) => {
                        const current = plan === p.key;
                        return (
                          <div key={p.key} className={`p-3 rounded-lg border ${current ? 'border-teal-300 bg-teal-50' : 'border-gray-200 opacity-60'}`}>
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-semibold text-gray-900">{p.label}</span>
                              {current && <span className="text-xs text-teal-600 font-medium">Current</span>}
                            </div>
                            <p className="text-xs text-gray-500">{p.fee} · {p.price}</p>
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
                    </dl>
                  </Section>
                </div>
              </div>
            )}

            {tab === 'shifts' && (
              <Section icon={CalendarDays} title="Shifts posted">
                {data.shifts.length === 0 ? (
                  <p className="text-sm text-gray-400 italic">This facility has not posted any shifts yet.</p>
                ) : (
                  <div className="overflow-x-auto -mx-5">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-gray-400 uppercase tracking-wider border-b border-gray-100">
                          <th className="text-left font-semibold px-5 py-2">Date</th>
                          <th className="text-left font-semibold px-5 py-2">Type</th>
                          <th className="text-left font-semibold px-5 py-2">Pay</th>
                          <th className="text-left font-semibold px-5 py-2">Assigned CO</th>
                          <th className="text-left font-semibold px-5 py-2">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {data.shifts.map((s) => (
                          <tr key={s.id}>
                            <td className="px-5 py-2.5 text-gray-800 whitespace-nowrap">{formatDate(s.shift_date)}</td>
                            <td className="px-5 py-2.5 text-gray-600 capitalize">{s.shift_type}</td>
                            <td className="px-5 py-2.5 text-gray-700 whitespace-nowrap">{formatTZS(s.pay_amount)}</td>
                            <td className="px-5 py-2.5 text-gray-700">{s.co_name || <span className="text-gray-400">—</span>}</td>
                            <td className="px-5 py-2.5"><Badge status={s.status} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Section>
            )}

            {tab === 'ratings' && (
              <Section icon={Star} title="Ratings from Clinical Officers">
                <RatingsList ratings={data.ratings} emptyText="No CO has rated this facility yet." />
              </Section>
            )}
          </div>
        </>
      )}
    </ProfileDrawer>
  );
}
