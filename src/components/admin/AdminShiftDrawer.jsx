import { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays, Building2, UserCircle, Users, History, Pencil, XCircle, UserMinus, AlertTriangle,
  BadgeCheck, Phone, Check, Undo2, X, UserPlus, Search,
} from 'lucide-react';
import { Badge } from '../common/Badge';
import { Button } from '../common/Button';
import { ProfileDrawer, DrawerSkeleton, Section } from './ProfileKit';
import { MctStatusBadge } from './MctVerification';
import { formatDate, formatTZS } from './profileUtils';
import { ShiftFormModal, ConfirmModal, Modal } from './ShiftAdminForms';
import { DirectionsLink } from '../common/DirectionsLink';
import {
  getAdminShiftDetail, getAdminCOOptions, adminUpdateShift, adminCancelShift, adminUnassignCO,
  adminApproveApplication, adminSetApplicationStatus, adminAddApplicant,
} from '../../lib/api';

const EDITABLE   = ['open', 'filled', 'confirmed'];
const CANCELABLE = ['open', 'filled', 'confirmed', 'pending_checkin_approval'];
const UNASSIGNABLE = ['filled', 'confirmed', 'pending_checkin_approval'];
const DISPUTED   = ['disputed_checkin', 'disputed_checkout'];

const ACTION_LABELS = {
  create: 'Posted shift', update: 'Edited shift', cancel: 'Cancelled shift', unassign: 'Removed CO',
  approve: 'Selected CO', reject: 'Rejected application', restore: 'Restored application', add_applicant: 'Added applicant',
};

const dateTime = (iso) => (iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

function describeChanges(detail) {
  if (!detail) return null;
  const parts = Object.entries(detail)
    .filter(([, v]) => Array.isArray(v))
    .map(([k, [from, to]]) => {
      const f = k === 'pay_amount' ? formatTZS(from) : k === 'shift_date' ? formatDate(from) : (from || '—');
      const t = k === 'pay_amount' ? formatTZS(to) : k === 'shift_date' ? formatDate(to) : (to || '—');
      return `${k.replace('_', ' ')}: ${f} → ${t}`;
    });
  return parts.length ? parts.join(' · ') : null;
}

function AddApplicantModal({ shift, onClose, onAdded }) {
  const [cos, setCos] = useState(null);
  const [q, setQ] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');
  const applied = useMemo(() => new Set(shift.applicants.filter((a) => a.status !== 'rejected').map((a) => a.co_id)), [shift]);

  useEffect(() => {
    let alive = true;
    getAdminCOOptions().then(({ data }) => { if (alive) setCos(data); });
    return () => { alive = false; };
  }, []);

  const list = (cos || []).filter((c) => {
    const s = q.trim().toLowerCase();
    return !s || c.name.toLowerCase().includes(s) || c.users?.phone?.includes(s) || c.license_number?.toLowerCase().includes(s);
  });

  async function add(c) {
    setBusyId(c.user_id); setError('');
    const { error: err } = await adminAddApplicant(shift.id, c.user_id);
    setBusyId(null);
    if (err) { setError(err.message); return; }
    onAdded(c.name);
    onClose();
  }

  return (
    <Modal title="Add a CO as applicant" subtitle="The CO and the facility are notified. The facility (or you) still selects who works." onClose={onClose} wide>
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, phone or licence number…"
          className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
        />
      </div>
      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 px-3 py-2 rounded-lg mb-3">{error}</p>}
      {cos === null ? (
        <div className="h-40 bg-gray-50 rounded-xl animate-pulse" />
      ) : (
        <ul className="divide-y divide-gray-100 max-h-[50vh] overflow-y-auto -mx-2">
          {list.map((c) => {
            const already = applied.has(c.user_id);
            const noIca = !c.ica_signed_at;
            return (
              <li key={c.user_id} className="flex items-center gap-3 px-2 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 flex items-center gap-1.5">
                    {c.name}{c.verified && <BadgeCheck className="w-4 h-4 text-green-600" />}
                  </p>
                  <p className="text-xs text-gray-400 flex flex-wrap items-center gap-x-2">
                    <span>{c.users?.phone || 'no phone'}</span>
                    <span className="font-mono">{c.license_number || '—'}</span>
                    {noIca && <span className="text-amber-700">ICA not signed</span>}
                  </p>
                </div>
                <MctStatusBadge status={c.mct_status} className="hidden sm:inline-flex" />
                <Button size="sm" variant="secondary" disabled={already || noIca} loading={busyId === c.user_id} onClick={() => add(c)}
                  title={already ? 'Already an applicant' : noIca ? 'This CO must sign the ICA first' : ''}>
                  {already ? 'Applied' : 'Add'}
                </Button>
              </li>
            );
          })}
          {list.length === 0 && <li className="text-sm text-gray-400 px-2 py-6 text-center">No COs match.</li>}
        </ul>
      )}
    </Modal>
  );
}

/**
 * Admin view of one shift: details, applicants and every admin action, with controls
 * to edit, cancel, remove the selected CO, select / reject / restore / add applicants.
 */
export function AdminShiftDrawer({ shiftId, onClose, onChanged, onResolveDispute, notify }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [dialog, setDialog] = useState(null);   // { kind, app? }

  useEffect(() => {
    let alive = true;
    getAdminShiftDetail(shiftId).then(({ data: d, error: e }) => {
      if (!alive) return;
      if (e) setError(e.message); else setData(d);
    });
    return () => { alive = false; };
  }, [shiftId, reloadKey]);

  function changed(message) {
    setReloadKey((k) => k + 1);
    onChanged?.();
    if (message) notify?.(message);
  }

  const s = data;
  const open = s?.status === 'open';
  const pending = s?.applicants.filter((a) => a.status === 'pending').length ?? 0;

  const footer = s && (
    <div className="flex flex-wrap items-center gap-2">
      <p className="text-xs text-gray-400 mr-auto hidden md:block">Every change is logged and the people affected are notified.</p>
      {DISPUTED.includes(s.status) && (
        <Button size="sm" className="bg-amber-500 hover:bg-amber-600" onClick={() => onResolveDispute?.(s)}>
          <AlertTriangle className="w-4 h-4" /> Resolve dispute
        </Button>
      )}
      {EDITABLE.includes(s.status) && (
        <Button size="sm" variant="secondary" onClick={() => setDialog({ kind: 'edit' })}>
          <Pencil className="w-4 h-4" /> Edit
        </Button>
      )}
      {UNASSIGNABLE.includes(s.status) && s.assigned_co_id && (
        <Button size="sm" variant="secondary" onClick={() => setDialog({ kind: 'unassign' })}>
          <UserMinus className="w-4 h-4" /> Remove CO
        </Button>
      )}
      {CANCELABLE.includes(s.status) && (
        <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" onClick={() => setDialog({ kind: 'cancel' })}>
          <XCircle className="w-4 h-4" /> Cancel shift
        </Button>
      )}
    </div>
  );

  return (
    <ProfileDrawer onClose={onClose} footer={footer}>
      {error ? (
        <div className="p-10 text-center text-sm text-red-600">Could not load shift: {error}</div>
      ) : !s ? (
        <DrawerSkeleton />
      ) : (
        <>
          {/* Header */}
          <div className="bg-white px-6 pt-6 pb-5 border-b border-gray-200">
            <div className="flex items-start gap-4 pr-10">
              <div className="w-12 h-12 rounded-xl bg-teal-50 flex items-center justify-center shrink-0">
                <CalendarDays className="w-6 h-6 text-teal-600" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-xl font-bold text-gray-900">{s.shift_type}</h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  {formatDate(s.shift_date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })} · {formatTZS(s.pay_amount)}
                </p>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <Badge status={s.status} />
                  <span className="text-xs text-gray-400">Posted {dateTime(s.created_at)}</span>
                </div>
              </div>
            </div>
            {s.status === 'cancelled' && (
              <p className="mt-4 text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                Cancelled by {s.cancelled_by === 'admin' ? 'AfyaWork' : s.cancelled_by === 'co' ? 'the CO' : 'the facility'}
                {s.cancellation_reason ? <> — <span className="italic">"{s.cancellation_reason}"</span></> : ''}
              </p>
            )}
            {DISPUTED.includes(s.status) && s.dispute_reason && (
              <p className="mt-4 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Dispute: <span className="italic">"{s.dispute_reason}"</span>
              </p>
            )}
          </div>

          <div className="p-6 grid lg:grid-cols-5 gap-5">
            <div className="lg:col-span-3 space-y-5">
              {/* Applicants */}
              <Section
                icon={Users}
                title={`Applicants (${s.applicants.length})`}
                action={open && (
                  <Button size="sm" variant="secondary" onClick={() => setDialog({ kind: 'add' })}>
                    <UserPlus className="w-4 h-4" /> Add CO
                  </Button>
                )}
              >
                {s.applicants.length === 0 ? (
                  <p className="text-sm text-gray-400 italic">No applicants yet.</p>
                ) : (
                  <ul className="divide-y divide-gray-100 -mx-1">
                    {s.applicants.map((a) => (
                      <li key={a.id} className="px-1 py-3 flex flex-col sm:flex-row sm:items-center gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                            {a.user?.display_name || 'Unnamed CO'}
                            {a.co?.verified && <BadgeCheck className="w-4 h-4 text-green-600" aria-label="Verified" />}
                          </p>
                          <p className="text-xs text-gray-400 flex flex-wrap items-center gap-x-2 mt-0.5">
                            {a.user?.phone && <a href={`tel:${a.user.phone}`} className="inline-flex items-center gap-1 hover:text-teal-700"><Phone className="w-3 h-3" />{a.user.phone}</a>}
                            <span>applied {dateTime(a.applied_at)}</span>
                            {!a.co?.ica_signed_at && <span className="text-amber-700">ICA not signed</span>}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <MctStatusBadge status={a.co?.mct_status} />
                          <Badge status={a.status} />
                        </div>
                        {open && (
                          <div className="flex gap-1">
                            {a.status !== 'approved' && (
                              <Button size="sm" onClick={() => setDialog({ kind: 'approve', app: a })} title="Offer the shift to this CO">
                                <Check className="w-4 h-4" /> Select
                              </Button>
                            )}
                            {a.status === 'pending' && (
                              <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" onClick={() => setDialog({ kind: 'reject', app: a })} title="Reject">
                                <X className="w-4 h-4" />
                              </Button>
                            )}
                            {a.status === 'rejected' && (
                              <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: 'restore', app: a })} title="Restore to pending">
                                <Undo2 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {!open && s.applicants.length > 0 && (
                  <p className="text-xs text-gray-400 mt-3">
                    {CANCELABLE.includes(s.status) && s.assigned_co_id
                      ? 'A CO is selected. Use Remove CO to reopen the shift and choose someone else.'
                      : 'Applicants can only be changed while the shift is open.'}
                  </p>
                )}
              </Section>

              {/* Admin activity */}
              <Section icon={History} title="AfyaWork actions">
                {s.log.length === 0 ? (
                  <p className="text-sm text-gray-400 italic">No admin changes on this shift.</p>
                ) : (
                  <ol className="space-y-3">
                    {s.log.map((l) => (
                      <li key={l.id} className="text-sm">
                        <p className="text-gray-900">
                          <span className="font-medium">{ACTION_LABELS[l.action] || l.action}</span>
                          {l.co_name && <span className="text-gray-600"> · {l.co_name}</span>}
                        </p>
                        {describeChanges(l.detail) && <p className="text-xs text-gray-500">{describeChanges(l.detail)}</p>}
                        {l.note && <p className="text-xs text-gray-500 italic">"{l.note}"</p>}
                        <p className="text-xs text-gray-400">{dateTime(l.created_at)}{l.admin_name ? ` · ${l.admin_name}` : ''}</p>
                      </li>
                    ))}
                  </ol>
                )}
              </Section>
            </div>

            <div className="lg:col-span-2 space-y-5">
              <Section icon={Building2} title="Facility">
                <p className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                  {s.facility?.facility_name || '—'}
                  {s.facility?.verified && <BadgeCheck className="w-4 h-4 text-green-600" />}
                </p>
                {s.facility?.address && <p className="text-xs text-gray-500 mt-0.5">{s.facility.address}</p>}
                <div className="text-xs mt-1">
                  {s.facility && (s.facility.location_url || s.facility.location_lat != null)
                    ? <DirectionsLink facility={s.facility} />
                    : <span className="text-red-600">No Google Maps location</span>}
                </div>
                {s.facility?.users?.phone && (
                  <a href={`tel:${s.facility.users.phone}`} className="text-xs text-teal-700 inline-flex items-center gap-1 mt-1.5 hover:underline">
                    <Phone className="w-3 h-3" /> {s.facility.users.phone}
                  </a>
                )}
              </Section>

              <Section icon={UserCircle} title="Selected CO">
                {s.co_user ? (
                  <>
                    <p className="text-sm font-semibold text-gray-900">{s.co_user.display_name}</p>
                    {s.co_user.phone && (
                      <a href={`tel:${s.co_user.phone}`} className="text-xs text-teal-700 inline-flex items-center gap-1 mt-1 hover:underline">
                        <Phone className="w-3 h-3" /> {s.co_user.phone}
                      </a>
                    )}
                    <dl className="text-xs grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 mt-3">
                      {s.status === 'filled' && <><dt className="text-gray-500">Offer expires</dt><dd className="text-gray-800">{dateTime(s.offer_expires_at)}</dd></>}
                      <dt className="text-gray-500">Accepted</dt><dd className="text-gray-800">{dateTime(s.offer_responded_at)}</dd>
                      <dt className="text-gray-500">Checked in</dt><dd className="text-gray-800">{dateTime(s.checkin_at)}</dd>
                      <dt className="text-gray-500">Checked out</dt><dd className="text-gray-800">{dateTime(s.checkout_at)}</dd>
                    </dl>
                  </>
                ) : (
                  <p className="text-sm text-gray-400 italic">{open ? `Nobody selected yet · ${pending} pending` : 'None'}</p>
                )}
              </Section>

              <Section icon={CalendarDays} title="Notes for COs">
                {s.description
                  ? <p className="text-sm text-gray-700 whitespace-pre-wrap">{s.description}</p>
                  : <p className="text-sm text-gray-400 italic">None</p>}
              </Section>
            </div>
          </div>
        </>
      )}

      {/* Dialogs */}
      {s && dialog?.kind === 'edit' && (
        <ShiftFormModal
          initial={s}
          onClose={() => setDialog(null)}
          onSubmit={async (f) => {
            const r = await adminUpdateShift(s.id, f);
            if (!r.error) changed('Shift updated — facility and COs notified.');
            return r;
          }}
        />
      )}
      {s && dialog?.kind === 'cancel' && (
        <ConfirmModal
          title="Cancel this shift?"
          body={<>The facility{s.assigned_co_id ? ', the selected CO' : ''}{pending ? ` and ${pending} pending applicant${pending === 1 ? '' : 's'}` : ''} will be told AfyaWork cancelled it, with your reason. This cannot be undone.</>}
          reasonLabel="Reason (shown to them)" reasonRequired confirmLabel="Cancel shift" danger
          onClose={() => setDialog(null)}
          onConfirm={async (reason) => {
            const r = await adminCancelShift(s.id, reason);
            if (!r.error) changed('Shift cancelled.');
            return r;
          }}
        />
      )}
      {s && dialog?.kind === 'unassign' && (
        <ConfirmModal
          title={`Remove ${s.co_user?.display_name || 'the CO'}?`}
          body="The shift goes back to open. Their application is marked rejected, other applicants become pending again, and both the CO and the facility are notified."
          reasonLabel="Reason (shown to them)" confirmLabel="Remove CO" danger
          onClose={() => setDialog(null)}
          onConfirm={async (reason) => {
            const r = await adminUnassignCO(s.id, reason);
            if (!r.error) changed('CO removed — the shift is open again.');
            return r;
          }}
        />
      )}
      {s && dialog?.kind === 'approve' && (
        <ConfirmModal
          title={`Select ${dialog.app.user?.display_name || 'this CO'}?`}
          body="They get the offer and have 24 hours to accept. Other pending applicants are marked not selected. The facility is told AfyaWork made the selection."
          reasonLabel="Internal note" confirmLabel="Select CO"
          onClose={() => setDialog(null)}
          onConfirm={async (note) => {
            const r = await adminApproveApplication(dialog.app.id, note);
            if (!r.error) changed('CO selected — offer sent.');
            return r;
          }}
        />
      )}
      {s && dialog?.kind === 'reject' && (
        <ConfirmModal
          title={`Reject ${dialog.app.user?.display_name || 'this application'}?`}
          body="The CO is told their application was not selected. You can restore it later while the shift is open."
          reasonLabel="Reason (shown to the CO)" confirmLabel="Reject" danger
          onClose={() => setDialog(null)}
          onConfirm={async (note) => {
            const r = await adminSetApplicationStatus(dialog.app.id, 'rejected', note);
            if (!r.error) changed('Application rejected.');
            return r;
          }}
        />
      )}
      {s && dialog?.kind === 'restore' && (
        <ConfirmModal
          title={`Restore ${dialog.app.user?.display_name || 'this application'}?`}
          body="It goes back to pending so the facility can select this CO."
          reasonLabel="Internal note" confirmLabel="Restore"
          onClose={() => setDialog(null)}
          onConfirm={async (note) => {
            const r = await adminSetApplicationStatus(dialog.app.id, 'pending', note);
            if (!r.error) changed('Application restored.');
            return r;
          }}
        />
      )}
      {s && dialog?.kind === 'add' && (
        <AddApplicantModal shift={s} onClose={() => setDialog(null)} onAdded={(name) => changed(`${name} added as an applicant.`)} />
      )}
    </ProfileDrawer>
  );
}
