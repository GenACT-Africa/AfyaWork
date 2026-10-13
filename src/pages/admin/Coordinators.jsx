import { useEffect, useState } from 'react';
import { UserPlus, Send, Ban, RotateCcw, Users, Phone, Mail, ArrowRightLeft } from 'lucide-react';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Modal } from '../../components/admin/ShiftAdminForms';
import { useToast } from '../../components/common/Toast';
import { formatDate } from '../../components/admin/profileUtils';
import { adminResendInvite } from '../../lib/api';
import { normaliseTzPhone, phoneProblem } from '../../lib/phone';
import { listCoordinators, inviteCoordinator, setCoordinatorAccess, reassignLeads, getLeadStaff } from '../../lib/leadsApi';

const STATUS = {
  active:         ['Active', 'bg-emerald-50 text-emerald-700 ring-emerald-200'],
  pending_invite: ['Invite sent', 'bg-amber-50 text-amber-700 ring-amber-200'],
  expired:        ['Invite expired', 'bg-gray-100 text-gray-600 ring-gray-200'],
  disabled:       ['Access removed', 'bg-red-50 text-red-700 ring-red-200'],
};

const ago = (iso) => {
  if (!iso) return 'Never';
  const m = Math.round((Date.now() - new Date(iso)) / 60000);
  if (m < 60) return `${m} min ago`;
  if (m < 1440) return `${Math.round(m / 60)} h ago`;
  return formatDate(iso);
};

function ReassignModal({ from, staff, onClose, onDone }) {
  const options = staff.filter((s) => s.id !== from.id && s.account_status === 'active');
  const [to, setTo] = useState(options[0]?.id || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function go() {
    setBusy(true); setError('');
    const { data, error: err } = await reassignLeads(from.id, to || null);
    setBusy(false);
    if (err) { setError(err.message); return; }
    onDone(data);
    onClose();
  }
  return (
    <Modal title={`Reassign ${from.display_name}'s leads`} subtitle={`${from.leads?.total ?? 0} lead(s), including cold and declined ones.`} onClose={onClose}>
      <div className="space-y-4">
        <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
          New owner
          <select value={to} onChange={(e) => setTo(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
            {options.map((s) => <option key={s.id} value={s.id}>{s.display_name} ({s.role})</option>)}
            <option value="">Nobody (unassigned)</option>
          </select>
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={onClose}>Later</Button>
          <Button className="flex-1" loading={busy} onClick={go}><ArrowRightLeft className="w-4 h-4" /> Reassign</Button>
        </div>
      </div>
    </Modal>
  );
}

export default function AdminCoordinators() {
  const { show, ToastComponent } = useToast();
  const [list, setList] = useState(null);
  const [staff, setStaff] = useState([]);
  const [error, setError] = useState('');
  const [inviting, setInviting] = useState(false);
  const [form, setForm] = useState({ display_name: '', email: '', phone: '' });
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState('');
  const [confirmRevoke, setConfirmRevoke] = useState(null);
  const [reassign, setReassign] = useState(null);

  async function load() {
    const [{ data, error: e }, { data: st }] = await Promise.all([listCoordinators(), getLeadStaff()]);
    if (e) setError(e.message);
    setList(data);
    setStaff(st);
  }
  useEffect(() => {
    let alive = true;
    Promise.all([listCoordinators(), getLeadStaff()]).then(([{ data, error: e }, { data: st }]) => {
      if (!alive) return;
      if (e) setError(e.message);
      setList(data); setStaff(st);
    });
    return () => { alive = false; };
  }, []);

  async function invite(e) {
    e.preventDefault();
    setFormError('');
    const phone = form.phone.trim() ? normaliseTzPhone(form.phone) : '';
    if (form.phone.trim() && !phone) { setFormError(phoneProblem(form.phone)); return; }
    setBusy('invite');
    const { error: err, mailError } = await inviteCoordinator({ ...form, phone });
    setBusy('');
    if (err) { setFormError(err.message); return; }
    setInviting(false);
    setForm({ display_name: '', email: '', phone: '' });
    show(mailError ? 'Account created, but the email failed — use Resend.' : `Invite sent to ${form.email}`, mailError ? 'error' : 'success');
    load();
  }

  async function resend(c) {
    setBusy(`resend-${c.id}`);
    const { error: err } = await adminResendInvite(c.id);
    setBusy('');
    show(err ? err.message : `Invite resent to ${c.email}`, err ? 'error' : 'success');
    load();
  }

  async function access(c, revoke) {
    setBusy(`access-${c.id}`);
    const { data, error: err } = await setCoordinatorAccess(c.id, revoke);
    setBusy('');
    setConfirmRevoke(null);
    if (err) { show(err.message, 'error'); return; }
    show(revoke ? `${c.display_name} can no longer sign in.` : `${c.display_name} can sign in again.`, 'success');
    await load();
    if (revoke && data?.owned_leads > 0) setReassign({ ...c, leads: { total: data.owned_leads } });
  }

  return (
    <PageWrapper
      title="Coordinators"
      subtitle="Staff who take facilities from lead to first shift. They see the lead pipeline only — no CO, facility or payment data."
      action={<Button size="sm" onClick={() => setInviting(true)}><UserPlus className="w-4 h-4" /> Invite coordinator</Button>}
    >
      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
      {list === null ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-20 bg-gray-100 rounded-2xl animate-pulse" />)}</div>
      ) : list.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16 text-center">
          <Users className="w-10 h-10 text-gray-300 mb-3" />
          <p className="text-gray-500 text-sm">No coordinators yet. Invite one with their work email.</p>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-gray-100 shadow-sm bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs text-gray-400 uppercase tracking-wider">
                <th className="text-left px-5 py-3 font-semibold">Coordinator</th>
                <th className="text-left px-5 py-3 font-semibold">Status</th>
                <th className="text-left px-5 py-3 font-semibold">Leads</th>
                <th className="text-left px-5 py-3 font-semibold">Last active</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {list.map((c) => {
                const [label, cls] = STATUS[c.account_status] || [c.account_status, 'bg-gray-100 text-gray-600 ring-gray-200'];
                return (
                  <tr key={c.id}>
                    <td className="px-5 py-3">
                      <p className="font-semibold text-gray-900">{c.display_name}</p>
                      <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5"><Mail className="w-3 h-3" />{c.email}</p>
                      {c.phone && <p className="text-xs text-gray-500 flex items-center gap-1"><Phone className="w-3 h-3" />{c.phone}</p>}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-semibold ring-1 ${cls}`}>{label}</span>
                      <p className="text-xs text-gray-400 mt-1">Invited {formatDate(c.invited_at || c.created_at)}</p>
                    </td>
                    <td className="px-5 py-3 text-gray-700">{c.leads.open} open <span className="text-gray-400">/ {c.leads.total}</span></td>
                    <td className="px-5 py-3 text-gray-600 whitespace-nowrap">{ago(c.last_sign_in_at)}</td>
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap gap-1.5 justify-end">
                        {['pending_invite', 'expired'].includes(c.account_status) && (
                          <Button size="sm" variant="secondary" loading={busy === `resend-${c.id}`} onClick={() => resend(c)}>
                            <Send className="w-4 h-4" /> Resend
                          </Button>
                        )}
                        {c.leads.total > 0 && (
                          <Button size="sm" variant="secondary" onClick={() => setReassign(c)}>
                            <ArrowRightLeft className="w-4 h-4" /> Reassign
                          </Button>
                        )}
                        {c.account_status === 'disabled' ? (
                          <Button size="sm" variant="secondary" loading={busy === `access-${c.id}`} onClick={() => access(c, false)}>
                            <RotateCcw className="w-4 h-4" /> Restore
                          </Button>
                        ) : (
                          <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" onClick={() => setConfirmRevoke(c)}>
                            <Ban className="w-4 h-4" /> Revoke
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {inviting && (
        <Modal title="Invite a coordinator" subtitle="They get an email to set a password. The link works once and expires after 7 days." onClose={() => setInviting(false)}>
          <form onSubmit={invite} className="space-y-4">
            <Input label="Full name" value={form.display_name} onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))} required />
            <Input label="Work email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} required />
            <Input label="Phone (optional)" type="tel" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="0748 795 514 or +255 748 795 514" />
            {formError && <p className="text-sm text-red-600 bg-red-50 border border-red-100 px-4 py-3 rounded-xl">{formError}</p>}
            <div className="flex gap-3">
              <Button type="button" variant="secondary" className="flex-1" onClick={() => setInviting(false)}>Cancel</Button>
              <Button type="submit" className="flex-1" loading={busy === 'invite'}>Send invite</Button>
            </div>
          </form>
        </Modal>
      )}

      {confirmRevoke && (
        <Modal title={`Revoke ${confirmRevoke.display_name}?`} onClose={() => setConfirmRevoke(null)}>
          <div className="space-y-4 text-sm text-gray-600">
            <p>They are signed out at their next token refresh (within the hour) and can no longer sign in or see any lead. Their history stays.</p>
            {confirmRevoke.leads.total > 0 && <p>They own {confirmRevoke.leads.total} lead(s). You'll be asked who takes them over.</p>}
            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setConfirmRevoke(null)}>Back</Button>
              <Button variant="danger" className="flex-1" loading={busy === `access-${confirmRevoke.id}`} onClick={() => access(confirmRevoke, true)}>
                <Ban className="w-4 h-4" /> Revoke access
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {reassign && (
        <ReassignModal from={reassign} staff={staff} onClose={() => setReassign(null)}
          onDone={(n) => { show(`${n} lead(s) reassigned.`, 'success'); load(); }} />
      )}
      {ToastComponent}
    </PageWrapper>
  );
}
