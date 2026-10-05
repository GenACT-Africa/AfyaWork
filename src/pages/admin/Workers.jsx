import { useEffect, useMemo, useState } from 'react';
import { UserCircle, Mail, Phone, Search, Award, Plus, Pencil, Trash2, X, Send, Eye, LayoutGrid, List, BadgeCheck, ShieldCheck } from 'lucide-react';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Input, Select } from '../../components/common/Input';
import { Avatar } from '../../components/common/Avatar';
import { Badge, AvailabilityBadge } from '../../components/common/Badge';
import { COProfileView } from '../../components/admin/COProfileView';
import { MctStatusBadge } from '../../components/admin/MctVerification';
import { MCT_STATUS } from '../../components/admin/mctStatus';
import {
  AccountStatusBadge, CompletenessBar, RatingPill,
} from '../../components/admin/ProfileKit';
import { coCompleteness, formatDate } from '../../components/admin/profileUtils';
import {
  getAdminWorkers,
  adminCreateWorker,
  adminUpdateWorker,
  adminDeleteUser,
  adminResendInvite,
  adminCheckCOLicence,
} from '../../lib/api';

const BLANK = { email: '', display_name: '', license_number: '', specialization: '', phone: '' };

const FILTERS = [
  { key: 'all',        label: 'All' },
  { key: 'active',     label: 'Active' },
  { key: 'pending',    label: 'Invite pending' },
  { key: 'incomplete', label: 'Incomplete profile' },
  { key: 'no_ica',     label: 'Agreement not signed' },
  { key: 'no_mm',      label: 'No mobile money' },
  { key: 'to_review',  label: 'MCT valid — approve identity' },
  { key: 'mct_problem', label: 'MCT problem' },
  { key: 'unchecked',  label: 'MCT not checked' },
];

const MCT_OK = ['valid', 'grace'];
const MCT_PROBLEM = ['expired', 'not_licensed', 'suspended', 'not_found', 'wrong_profession'];

const SORTS = {
  newest: (a, b) => new Date(b.users?.created_at || 0) - new Date(a.users?.created_at || 0),
  oldest: (a, b) => new Date(a.users?.created_at || 0) - new Date(b.users?.created_at || 0),
  name:   (a, b) => (a.users?.display_name || '').localeCompare(b.users?.display_name || ''),
  complete: (a, b) => b._completeness.pct - a._completeness.pct,
};

function readView() {
  try { return localStorage.getItem('admin.workers.view') || 'grid'; } catch { return 'grid'; }
}
function saveView(v) {
  try { localStorage.setItem('admin.workers.view', v); } catch { /* ignore */ }
}

function Modal({ title, subtitle, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{title}</h2>
            {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

function IconAction({ title, onClick, disabled, hover, children }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={`p-1.5 rounded-lg text-gray-400 transition-colors disabled:opacity-50 ${hover}`}
    >
      {children}
    </button>
  );
}

export default function AdminWorkers() {
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('newest');
  const [view, setView] = useState(readView);

  const [viewing, setViewing] = useState(null);       // user_id of the profile open in the drawer
  const [viewKey, setViewKey] = useState(0);          // bump to reload the drawer after an edit

  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const [resendingId, setResendingId] = useState(null);
  const [checkingAll, setCheckingAll] = useState(false);
  const [toast, setToast] = useState('');

  async function load() {
    setLoading(true);
    const { data } = await getAdminWorkers();
    setWorkers((data || []).map((w) => ({ ...w, _completeness: coCompleteness(w) })));
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  }

  function changeView(v) { setView(v); saveView(v); }

  const counts = useMemo(() => {
    const c = { all: workers.length, active: 0, pending: 0, incomplete: 0, no_ica: 0, no_mm: 0, to_review: 0, mct_problem: 0, unchecked: 0 };
    workers.forEach((w) => {
      const st = w.users?.account_status || 'active';
      if (st === 'active') c.active++; else c.pending++;
      if (w._completeness.pct < 100) c.incomplete++;
      if (!w.ica_signed_at) c.no_ica++;
      if (!w.has_mobile_money) c.no_mm++;
      if (MCT_OK.includes(w.mct_status) && !w.verified) c.to_review++;
      if (MCT_PROBLEM.includes(w.mct_status)) c.mct_problem++;
      if (!w.mct_status || w.mct_status === 'unchecked' || w.mct_status === 'error') c.unchecked++;
    });
    return c;
  }, [workers]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return workers
      .filter((w) => {
        const st = w.users?.account_status || 'active';
        if (filter === 'active' && st !== 'active') return false;
        if (filter === 'pending' && st === 'active') return false;
        if (filter === 'incomplete' && w._completeness.pct >= 100) return false;
        if (filter === 'no_ica' && w.ica_signed_at) return false;
        if (filter === 'no_mm' && w.has_mobile_money) return false;
        if (filter === 'to_review' && !(MCT_OK.includes(w.mct_status) && !w.verified)) return false;
        if (filter === 'mct_problem' && !MCT_PROBLEM.includes(w.mct_status)) return false;
        if (filter === 'unchecked' && !(!w.mct_status || ['unchecked', 'error'].includes(w.mct_status))) return false;
        if (!q) return true;
        return (
          w.users?.display_name?.toLowerCase().includes(q) ||
          w.users?.email?.toLowerCase().includes(q) ||
          w.users?.phone?.toLowerCase().includes(q) ||
          w.license_number?.toLowerCase().includes(q) ||
          w.specialization?.toLowerCase().includes(q)
        );
      })
      .sort(SORTS[sort]);
  }, [workers, search, filter, sort]);

  function set(field) {
    return (e) => setForm((p) => ({ ...p, [field]: e.target.value }));
  }

  function openAdd() {
    setForm(BLANK);
    setFormError('');
    setModal({ mode: 'add' });
  }

  function openEdit(w) {
    setForm({
      email:          w.users?.email || '',
      display_name:   w.users?.display_name || '',
      license_number: w.license_number || '',
      specialization: w.specialization || '',
      phone:          w.users?.phone || '',
    });
    setFormError('');
    setModal({ mode: 'edit', userId: w.user_id });
  }

  async function handleSave(e) {
    e.preventDefault();
    setFormError('');
    if (!form.display_name.trim()) { setFormError('Full name is required.'); return; }
    if (!form.license_number.trim()) { setFormError('License number is required.'); return; }
    if (modal.mode === 'add' && !form.email.trim()) { setFormError('Email is required.'); return; }

    setSaving(true);
    const { error } = modal.mode === 'add'
      ? await adminCreateWorker(form)
      : await adminUpdateWorker(modal.userId, form);
    setSaving(false);

    if (error) { setFormError(error.message); return; }

    setModal(null);
    load();
    setViewKey((k) => k + 1);
    if (modal.mode === 'add') showToast('Worker created — invite email sent.');
  }

  async function handleDelete() {
    setDeleting(true);
    await adminDeleteUser(deleteTarget.user_id);
    setDeleting(false);
    if (viewing === deleteTarget.user_id) setViewing(null);
    setDeleteTarget(null);
    load();
  }

  async function handleResend(w) {
    setResendingId(w.user_id);
    const { error } = await adminResendInvite(w.user_id);
    setResendingId(null);
    if (error) {
      showToast(`Failed: ${error.message}`);
    } else {
      showToast(`Invite resent to ${w.users?.email}`);
      load();
    }
  }

  async function handleCheckAll() {
    setCheckingAll(true);
    const summary = {};
    let failed = 0;
    for (let i = 0; i < workers.length; i++) {
      setToast(`Checking MCT register… ${i + 1} of ${workers.length}`);
      const { data, error } = await adminCheckCOLicence(workers[i].user_id);
      if (error) failed++; else summary[data.status] = (summary[data.status] || 0) + 1;
    }
    setCheckingAll(false);
    const parts = Object.entries(summary).map(([k, n]) => `${n} ${(MCT_STATUS[k]?.label || k).toLowerCase()}`);
    showToast(`Checked ${workers.length}: ${parts.join(', ')}${failed ? `, ${failed} failed` : ''}`);
    load();
  }

  function actions(w) {
    const st = w.users?.account_status || 'active';
    const isPending = st === 'pending_invite' || st === 'expired';
    return (
      <div className="flex items-center gap-0.5 justify-end">
        <IconAction title="View profile" onClick={() => setViewing(w.user_id)} hover="hover:text-teal-600 hover:bg-teal-50">
          <Eye className="w-4 h-4" />
        </IconAction>
        {isPending && (
          <IconAction title="Resend invite" onClick={() => handleResend(w)} disabled={resendingId === w.user_id} hover="hover:text-amber-600 hover:bg-amber-50">
            <Send className="w-4 h-4" />
          </IconAction>
        )}
        <IconAction title="Edit" onClick={() => openEdit(w)} hover="hover:text-teal-600 hover:bg-teal-50">
          <Pencil className="w-4 h-4" />
        </IconAction>
        <IconAction title="Delete" onClick={() => setDeleteTarget(w)} hover="hover:text-red-600 hover:bg-red-50">
          <Trash2 className="w-4 h-4" />
        </IconAction>
      </div>
    );
  }

  return (
    <PageWrapper
      title="Clinical Officers"
      subtitle={`${workers.length} registered workers · ${counts.active} active · ${counts.pending} awaiting invite`}
      action={
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" loading={checkingAll} onClick={handleCheckAll} title="Look up every CO on the MCT register (HPRS)">
            <ShieldCheck className="w-4 h-4" /> Check all on MCT
          </Button>
          <Button size="sm" onClick={openAdd}>
            <Plus className="w-4 h-4" /> Add Worker
          </Button>
        </div>
      }
    >
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] bg-gray-900 text-white text-sm px-5 py-2.5 rounded-xl shadow-lg">
          {toast}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, phone, licence…"
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white shadow-sm"
          />
        </div>
        <div className="flex items-center gap-2 md:ml-auto">
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="py-2.5 pl-3 pr-8 rounded-xl border border-gray-200 text-sm bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            aria-label="Sort workers"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="name">Name A–Z</option>
            <option value="complete">Most complete profile</option>
          </select>
          <div className="flex rounded-xl border border-gray-200 bg-white shadow-sm p-0.5">
            <button onClick={() => changeView('grid')} className={`p-2 rounded-lg ${view === 'grid' ? 'bg-teal-50 text-teal-700' : 'text-gray-400 hover:text-gray-600'}`} aria-label="Card view" title="Card view">
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button onClick={() => changeView('list')} className={`p-2 rounded-lg ${view === 'list' ? 'bg-teal-50 text-teal-700' : 'text-gray-400 hover:text-gray-600'}`} aria-label="Table view" title="Table view">
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2 mb-6">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
              filter === f.key ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
            }`}
          >
            {f.label} <span className={filter === f.key ? 'text-teal-100' : 'text-gray-400'}>{counts[f.key]}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className={view === 'grid' ? 'grid sm:grid-cols-2 lg:grid-cols-3 gap-4' : 'space-y-3'}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className={`${view === 'grid' ? 'h-56' : 'h-20'} bg-gray-100 rounded-2xl animate-pulse`} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16 text-center">
          <UserCircle className="w-10 h-10 text-gray-300 mb-3" />
          <p className="text-gray-500 text-sm">{search || filter !== 'all' ? 'No workers match these filters.' : 'No workers yet.'}</p>
        </Card>
      ) : view === 'grid' ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((w) => (
            <div
              key={w.user_id}
              role="button"
              tabIndex={0}
              onClick={() => setViewing(w.user_id)}
              onKeyDown={(e) => e.key === 'Enter' && setViewing(w.user_id)}
              className="group bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-teal-200 transition-all cursor-pointer overflow-hidden flex flex-col"
            >
              <div className="p-5 flex-1">
                <div className="flex items-start gap-4">
                  <Avatar src={w.users?.avatar_url} name={w.users?.display_name} size="xl" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      <p className="font-semibold text-gray-900 truncate">{w.users?.display_name || '—'}</p>
                      {w.verified && <BadgeCheck className="w-4 h-4 text-green-600 shrink-0" aria-label="Verified" />}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1 truncate">
                      <Award className="w-3 h-3 shrink-0" />
                      {w.license_number} · {w.specialization || 'General'}
                    </p>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      <AccountStatusBadge status={w.users?.account_status || 'active'} />
                      <Badge status={w.subscription_tier || 'msingi'} className="!py-0.5" />
                      <MctStatusBadge status={w.mct_status} />
                    </div>
                  </div>
                </div>

                {w.users?.bio ? (
                  <p className="text-sm text-gray-600 mt-4 line-clamp-2 leading-relaxed">{w.users.bio}</p>
                ) : (
                  <p className="text-sm text-gray-300 italic mt-4">No bio yet</p>
                )}

                {w.employment_availability_status && w.employment_availability_status !== 'not_looking' && (
                  <AvailabilityBadge status={w.employment_availability_status} className="mt-3" />
                )}

                <div className="flex items-center gap-4 mt-4 text-xs text-gray-500">
                  <span><span className="font-semibold text-gray-800">{w.app_stats?.total || 0}</span> applied</span>
                  <span><span className="font-semibold text-purple-700">{w.app_stats?.approved || 0}</span> approved</span>
                  <span className="ml-auto"><RatingPill rating={w.rating} /></span>
                </div>
                <CompletenessBar result={w._completeness} className="mt-4" />
              </div>
              <div className="flex items-center justify-between px-5 py-2.5 border-t border-gray-50 bg-gray-50/60">
                <span className="text-xs text-gray-400">Joined {formatDate(w.users?.created_at)}</span>
                {actions(w)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-gray-100 shadow-sm bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs text-gray-400 uppercase tracking-wider">
                <th className="text-left px-5 py-4 font-semibold">Worker</th>
                <th className="text-left px-5 py-4 font-semibold">Contact</th>
                <th className="text-left px-5 py-4 font-semibold">Status</th>
                <th className="text-left px-5 py-4 font-semibold">Profile</th>
                <th className="text-left px-5 py-4 font-semibold">Applications</th>
                <th className="px-5 py-4" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((w) => (
                <tr key={w.user_id} onClick={() => setViewing(w.user_id)} className="hover:bg-teal-50/40 transition-colors cursor-pointer">
                  <td className="px-5 py-4 min-w-[260px]">
                    <div className="flex items-center gap-3">
                      <Avatar src={w.users?.avatar_url} name={w.users?.display_name} size="lg" />
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 flex items-center gap-1">
                          {w.users?.display_name || '—'}
                          {w.verified && <BadgeCheck className="w-4 h-4 text-green-600" />}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                          <Award className="w-3 h-3" />
                          {w.license_number} · {w.specialization || 'General'}
                        </p>
                        <Badge status={w.subscription_tier || 'msingi'} className="mt-1 !py-0 !px-1.5 !text-[10px]" />
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <p className="flex items-center gap-1.5 text-gray-600 max-w-[260px] truncate">
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
                    <AccountStatusBadge status={w.users?.account_status || 'active'} />
                    <MctStatusBadge status={w.mct_status} className="mt-1.5" />
                    <p className="text-xs text-gray-400 mt-1.5 whitespace-nowrap">Joined {formatDate(w.users?.created_at)}</p>
                  </td>
                  <td className="px-5 py-4 min-w-[120px]">
                    <CompletenessBar result={w._completeness} showLabel={false} />
                    <p className="text-xs text-gray-500 mt-1.5 whitespace-nowrap">{w._completeness.done}/{w._completeness.total} complete</p>
                  </td>
                  <td className="px-5 py-4">
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-50 text-purple-700 text-xs font-semibold">
                      {w.app_stats?.approved || 0} approved
                    </span>
                    <p className="text-xs text-gray-400 mt-1">{w.app_stats?.total || 0} total</p>
                    <div className="mt-1"><RatingPill rating={w.rating} /></div>
                  </td>
                  <td className="px-5 py-4">{actions(w)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Profile viewer */}
      {viewing && (
        <COProfileView
          key={`${viewing}-${viewKey}`}
          userId={viewing}
          onClose={() => setViewing(null)}
          onEdit={openEdit}
          onResend={handleResend}
          onDelete={setDeleteTarget}
          resending={resendingId === viewing}
          onVerificationChange={load}
        />
      )}

      {/* Add / Edit Modal */}
      {modal && (
        <Modal
          title={modal.mode === 'add' ? 'Add Clinical Officer' : 'Edit Clinical Officer'}
          subtitle={modal.mode === 'add' ? 'An invite email will be sent automatically.' : undefined}
          onClose={() => setModal(null)}
        >
          <form onSubmit={handleSave} className="space-y-4">
            {modal.mode === 'add' ? (
              <Input
                label="Email"
                type="email"
                value={form.email}
                onChange={set('email')}
                placeholder="doctor@example.com"
                required
              />
            ) : (
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-700">Email</label>
                <p className="text-sm text-gray-500 bg-gray-50 border border-gray-200 px-3 py-2 rounded-lg">{form.email}</p>
              </div>
            )}

            <Input
              label="Full Name"
              value={form.display_name}
              onChange={set('display_name')}
              placeholder="Dr. Amina Juma"
              required
            />
            <Input
              label="License Number"
              value={form.license_number}
              onChange={set('license_number')}
              placeholder="CO-12345"
              required
            />
            <Select label="Specialization" value={form.specialization} onChange={set('specialization')}>
              <option value="">Select specialization…</option>
              <option value="General">General</option>
              <option value="Paediatrics">Paediatrics</option>
              <option value="Maternity">Maternity</option>
              <option value="Surgery">Surgery</option>
              <option value="Emergency">Emergency</option>
            </Select>
            <Input label="Phone" type="tel" value={form.phone} onChange={set('phone')} placeholder="+255 7xx xxx xxx" />

            {formError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-100 px-4 py-3 rounded-xl">{formError}</p>
            )}

            <div className="flex gap-3 pt-2">
              <Button type="button" variant="secondary" className="flex-1" onClick={() => setModal(null)}>
                Cancel
              </Button>
              <Button type="submit" className="flex-1" loading={saving}>
                {modal.mode === 'add' ? 'Create & Send Invite' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete Confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="w-12 h-12 rounded-2xl bg-red-100 flex items-center justify-center mb-4">
              <Trash2 className="w-6 h-6 text-red-600" />
            </div>
            <h2 className="text-lg font-bold text-gray-900 mb-1">Delete Worker</h2>
            <p className="text-sm text-gray-500 mb-6">
              This will permanently delete <span className="font-semibold text-gray-800">{deleteTarget.users?.display_name || 'this worker'}</span> and all their application history. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setDeleteTarget(null)}>Cancel</Button>
              <Button variant="danger" className="flex-1" loading={deleting} onClick={handleDelete}>Delete</Button>
            </div>
          </div>
        </div>
      )}
    </PageWrapper>
  );
}
