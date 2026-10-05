import { useEffect, useMemo, useState } from 'react';
import { Building2, MapPin, Phone, Mail, Search, Plus, Pencil, Trash2, X, Send, Eye, LayoutGrid, List } from 'lucide-react';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Input, Select } from '../../components/common/Input';
import { Avatar } from '../../components/common/Avatar';
import { FacilityProfileView } from '../../components/admin/FacilityProfileView';
import {
  AccountStatusBadge, CompletenessBar, RatingPill,
} from '../../components/admin/ProfileKit';
import { facilityCompleteness, formatDate } from '../../components/admin/profileUtils';
import {
  getAdminFacilities,
  adminCreateFacility,
  adminUpdateFacility,
  adminDeleteUser,
  adminResendInvite,
} from '../../lib/api';

const BLANK = { email: '', facility_name: '', facility_type: '', address: '', phone: '' };

const PLAN_LABELS = { payg: 'Pay-as-you-go', starter: 'Starter', growth: 'Growth', enterprise: 'Enterprise' };

const FILTERS = [
  { key: 'all',        label: 'All' },
  { key: 'active',     label: 'Active' },
  { key: 'pending',    label: 'Invite pending' },
  { key: 'posting',    label: 'Posting shifts' },
  { key: 'no_shifts',  label: 'No shifts yet' },
  { key: 'incomplete', label: 'Incomplete profile' },
];

const SORTS = {
  name:     (a, b) => (a.facility_name || '').localeCompare(b.facility_name || ''),
  newest:   (a, b) => new Date(b.users?.created_at || 0) - new Date(a.users?.created_at || 0),
  oldest:   (a, b) => new Date(a.users?.created_at || 0) - new Date(b.users?.created_at || 0),
  shifts:   (a, b) => (b.shift_stats?.total || 0) - (a.shift_stats?.total || 0),
};

function readView() {
  try { return localStorage.getItem('admin.facilities.view') || 'grid'; } catch { return 'grid'; }
}
function saveView(v) {
  try { localStorage.setItem('admin.facilities.view', v); } catch { /* ignore */ }
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

export default function AdminFacilities() {
  const [facilities, setFacilities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('name');
  const [view, setView] = useState(readView);

  const [viewing, setViewing] = useState(null);
  const [viewKey, setViewKey] = useState(0);

  const [modal, setModal] = useState(null); // null | { mode: 'add' | 'edit', userId?: string }
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const [resendingId, setResendingId] = useState(null);
  const [toast, setToast] = useState('');

  async function load() {
    setLoading(true);
    const { data } = await getAdminFacilities();
    setFacilities((data || []).map((f) => ({ ...f, _completeness: facilityCompleteness(f) })));
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  }

  function changeView(v) { setView(v); saveView(v); }

  const counts = useMemo(() => {
    const c = { all: facilities.length, active: 0, pending: 0, posting: 0, no_shifts: 0, incomplete: 0 };
    facilities.forEach((f) => {
      const st = f.users?.account_status || 'active';
      if (st === 'active') c.active++; else c.pending++;
      if (f.shift_stats?.total) c.posting++; else c.no_shifts++;
      if (f._completeness.pct < 100) c.incomplete++;
    });
    return c;
  }, [facilities]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return facilities
      .filter((f) => {
        const st = f.users?.account_status || 'active';
        if (filter === 'active' && st !== 'active') return false;
        if (filter === 'pending' && st === 'active') return false;
        if (filter === 'posting' && !f.shift_stats?.total) return false;
        if (filter === 'no_shifts' && f.shift_stats?.total) return false;
        if (filter === 'incomplete' && f._completeness.pct >= 100) return false;
        if (!q) return true;
        return (
          f.facility_name?.toLowerCase().includes(q) ||
          f.facility_type?.toLowerCase().includes(q) ||
          f.address?.toLowerCase().includes(q) ||
          f.users?.email?.toLowerCase().includes(q) ||
          f.users?.phone?.toLowerCase().includes(q)
        );
      })
      .sort(SORTS[sort]);
  }, [facilities, search, filter, sort]);

  function set(field) {
    return (e) => setForm((p) => ({ ...p, [field]: e.target.value }));
  }

  function openAdd() {
    setForm(BLANK);
    setFormError('');
    setModal({ mode: 'add' });
  }

  function openEdit(f) {
    setForm({
      email:         f.users?.email || '',
      facility_name: f.facility_name || '',
      facility_type: f.facility_type || '',
      address:       f.address || '',
      phone:         f.users?.phone || '',
    });
    setFormError('');
    setModal({ mode: 'edit', userId: f.user_id });
  }

  async function handleSave(e) {
    e.preventDefault();
    setFormError('');
    if (!form.facility_name.trim()) { setFormError('Facility name is required.'); return; }
    if (modal.mode === 'add' && !form.email.trim()) { setFormError('Email is required.'); return; }

    setSaving(true);
    const { error } = modal.mode === 'add'
      ? await adminCreateFacility(form)
      : await adminUpdateFacility(modal.userId, form);
    setSaving(false);

    if (error) { setFormError(error.message); return; }

    setModal(null);
    load();
    setViewKey((k) => k + 1);
    if (modal.mode === 'add') showToast('Facility created — invite email sent.');
  }

  async function handleDelete() {
    setDeleting(true);
    await adminDeleteUser(deleteTarget.user_id);
    setDeleting(false);
    if (viewing === deleteTarget.user_id) setViewing(null);
    setDeleteTarget(null);
    load();
  }

  async function handleResend(f) {
    setResendingId(f.user_id);
    const { error } = await adminResendInvite(f.user_id);
    setResendingId(null);
    if (error) {
      showToast(`Failed: ${error.message}`);
    } else {
      showToast(`Invite resent to ${f.users?.email}`);
      load();
    }
  }

  function actions(f) {
    const st = f.users?.account_status || 'active';
    const isPending = st === 'pending_invite' || st === 'expired';
    return (
      <div className="flex items-center gap-0.5 justify-end">
        <IconAction title="View profile" onClick={() => setViewing(f.user_id)} hover="hover:text-teal-600 hover:bg-teal-50">
          <Eye className="w-4 h-4" />
        </IconAction>
        {isPending && (
          <IconAction title="Resend invite" onClick={() => handleResend(f)} disabled={resendingId === f.user_id} hover="hover:text-amber-600 hover:bg-amber-50">
            <Send className="w-4 h-4" />
          </IconAction>
        )}
        <IconAction title="Edit" onClick={() => openEdit(f)} hover="hover:text-teal-600 hover:bg-teal-50">
          <Pencil className="w-4 h-4" />
        </IconAction>
        <IconAction title="Delete" onClick={() => setDeleteTarget(f)} hover="hover:text-red-600 hover:bg-red-50">
          <Trash2 className="w-4 h-4" />
        </IconAction>
      </div>
    );
  }

  return (
    <PageWrapper
      title="Facilities"
      subtitle={`${facilities.length} registered healthcare facilities · ${counts.posting} posting shifts`}
      action={
        <Button size="sm" onClick={openAdd}>
          <Plus className="w-4 h-4" /> Add Facility
        </Button>
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
            placeholder="Search name, type, area, email…"
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white shadow-sm"
          />
        </div>
        <div className="flex items-center gap-2 md:ml-auto">
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="py-2.5 pl-3 pr-8 rounded-xl border border-gray-200 text-sm bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            aria-label="Sort facilities"
          >
            <option value="name">Name A–Z</option>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="shifts">Most shifts</option>
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
          <Building2 className="w-10 h-10 text-gray-300 mb-3" />
          <p className="text-gray-500 text-sm">{search || filter !== 'all' ? 'No facilities match these filters.' : 'No facilities yet.'}</p>
        </Card>
      ) : view === 'grid' ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((f) => (
            <div
              key={f.user_id}
              role="button"
              tabIndex={0}
              onClick={() => setViewing(f.user_id)}
              onKeyDown={(e) => e.key === 'Enter' && setViewing(f.user_id)}
              className="group bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-teal-200 transition-all cursor-pointer overflow-hidden flex flex-col"
            >
              <div className="p-5 flex-1">
                <div className="flex items-start gap-4">
                  <Avatar src={f.users?.avatar_url} name={f.facility_name} size="xl" shape="rounded" />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-gray-900 truncate">{f.facility_name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{f.facility_type || 'Type not set'}</p>
                    {f.address && (
                      <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5 truncate">
                        <MapPin className="w-3 h-3 shrink-0" />{f.address}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      <AccountStatusBadge status={f.users?.account_status || 'active'} />
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-sky-50 text-sky-700 ring-1 ring-sky-200">
                        {PLAN_LABELS[f.subscription_plan] || 'Pay-as-you-go'}
                      </span>
                    </div>
                  </div>
                </div>

                {f.users?.bio ? (
                  <p className="text-sm text-gray-600 mt-4 line-clamp-2 leading-relaxed">{f.users.bio}</p>
                ) : (
                  <p className="text-sm text-gray-300 italic mt-4">No description yet</p>
                )}

                <div className="flex items-center gap-4 mt-4 text-xs text-gray-500">
                  <span><span className="font-semibold text-teal-700">{f.shift_stats?.open || 0}</span> open</span>
                  <span><span className="font-semibold text-gray-800">{f.shift_stats?.total || 0}</span> posted</span>
                  <span><span className="font-semibold text-emerald-700">{f.shift_stats?.completed || 0}</span> done</span>
                  <span className="ml-auto"><RatingPill rating={f.rating} /></span>
                </div>
                <CompletenessBar result={f._completeness} className="mt-4" />
              </div>
              <div className="flex items-center justify-between px-5 py-2.5 border-t border-gray-50 bg-gray-50/60">
                <span className="text-xs text-gray-400">Joined {formatDate(f.users?.created_at)}</span>
                {actions(f)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-gray-100 shadow-sm bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs text-gray-400 uppercase tracking-wider">
                <th className="text-left px-5 py-4 font-semibold">Facility</th>
                <th className="text-left px-5 py-4 font-semibold">Contact</th>
                <th className="text-left px-5 py-4 font-semibold">Status</th>
                <th className="text-left px-5 py-4 font-semibold">Profile</th>
                <th className="text-left px-5 py-4 font-semibold">Shifts</th>
                <th className="px-5 py-4" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((f) => (
                <tr key={f.user_id} onClick={() => setViewing(f.user_id)} className="hover:bg-teal-50/40 transition-colors cursor-pointer">
                  <td className="px-5 py-4 min-w-[260px]">
                    <div className="flex items-center gap-3">
                      <Avatar src={f.users?.avatar_url} name={f.facility_name} size="lg" shape="rounded" />
                      <div className="min-w-0">
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
                    <p className="flex items-center gap-1.5 text-gray-600 max-w-[260px] truncate">
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
                    <AccountStatusBadge status={f.users?.account_status || 'active'} />
                    <p className="text-xs text-gray-400 mt-1.5 whitespace-nowrap">Joined {formatDate(f.users?.created_at)}</p>
                  </td>
                  <td className="px-5 py-4 min-w-[120px]">
                    <CompletenessBar result={f._completeness} showLabel={false} />
                    <p className="text-xs text-gray-500 mt-1.5 whitespace-nowrap">{f._completeness.done}/{f._completeness.total} complete</p>
                  </td>
                  <td className="px-5 py-4">
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-teal-50 text-teal-700 text-xs font-semibold">
                      {f.shift_stats?.open || 0} open
                    </span>
                    <p className="text-xs text-gray-400 mt-1">{f.shift_stats?.total || 0} total</p>
                    <div className="mt-1"><RatingPill rating={f.rating} /></div>
                  </td>
                  <td className="px-5 py-4">{actions(f)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Profile viewer */}
      {viewing && (
        <FacilityProfileView
          key={`${viewing}-${viewKey}`}
          userId={viewing}
          onClose={() => setViewing(null)}
          onEdit={openEdit}
          onResend={handleResend}
          onDelete={setDeleteTarget}
          resending={resendingId === viewing}
        />
      )}

      {/* Add / Edit Modal */}
      {modal && (
        <Modal
          title={modal.mode === 'add' ? 'Add Facility' : 'Edit Facility'}
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
                placeholder="facility@example.com"
                required
              />
            ) : (
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-700">Email</label>
                <p className="text-sm text-gray-500 bg-gray-50 border border-gray-200 px-3 py-2 rounded-lg">{form.email}</p>
              </div>
            )}

            <Input
              label="Facility Name"
              value={form.facility_name}
              onChange={set('facility_name')}
              placeholder="Aga Khan Health Centre"
              required
            />
            <Select label="Facility Type" value={form.facility_type} onChange={set('facility_type')}>
              <option value="">Select type…</option>
              <option value="Private Clinic">Private Clinic</option>
              <option value="Hospital">Hospital</option>
              <option value="Dispensary">Dispensary</option>
              <option value="Diagnostic Centre">Diagnostic Centre</option>
            </Select>
            <Input label="Address" value={form.address} onChange={set('address')} placeholder="e.g. Upanga, Dar es Salaam" />
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
            <h2 className="text-lg font-bold text-gray-900 mb-1">Delete Facility</h2>
            <p className="text-sm text-gray-500 mb-6">
              This will permanently delete <span className="font-semibold text-gray-800">{deleteTarget.facility_name}</span> and all their shift data. This cannot be undone.
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
