import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Outlet, Link, useLocation } from 'react-router-dom';
import { LayoutList, CircleCheck, BookOpen, Plus, LogOut, Shield } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { getLeadBoard, getLeadStaff } from '../../lib/leadsApi';
import { todayEAT } from '../../lib/leadSteps';
import { LeadBoardContext } from '../../hooks/useLeadBoard';

/**
 * Mobile-first frame for the coordinator area: header with pipeline stats,
 * bottom tabs, live data shared by every page (refreshed on any change by a colleague).
 */
export default function CoordinatorShell() {
  const { user, role, signOut } = useAuth();
  const [leads, setLeads] = useState(null);
  const [staff, setStaff] = useState([]);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const timer = useRef(null);
  const toastTimer = useRef(null);
  const { pathname } = useLocation();

  const reload = useCallback(async () => {
    const { data, error: e } = await getLeadBoard();
    if (e) setError(e.message); else { setError(''); setLeads(data); }
  }, []);

  useEffect(() => {
    let alive = true;
    Promise.all([getLeadBoard(), getLeadStaff()]).then(([b, s]) => {
      if (!alive) return;
      if (b.error) setError(b.error.message); else setLeads(b.data);
      setStaff(s.data);
    });
    const soon = () => { clearTimeout(timer.current); timer.current = setTimeout(reload, 400); };
    const ch = supabase.channel('lead-board')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'facility_leads' }, soon)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lead_steps' }, soon)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lead_files' }, soon)
      .subscribe();
    return () => { alive = false; clearTimeout(timer.current); supabase.removeChannel(ch); };
  }, [reload]);

  const notify = useCallback((m) => {
    setToast(m);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2600);
  }, []);

  /** Optimistic local change, so ticks and saves feel instant on a slow connection. */
  const patchLead = useCallback((id, fn) => {
    setLeads((ls) => (ls || []).map((l) => (l.id === id ? fn(l) : l)));
  }, []);

  const staffName = useCallback((id) => staff.find((s) => s.id === id)?.display_name || '', [staff]);

  const value = useMemo(() => ({ leads, staff, staffName, reload, patchLead, notify, error, me: user, isAdmin: role === 'admin' }),
    [leads, staff, staffName, reload, patchLead, notify, error, user, role]);

  const open = (leads || []).filter((l) => l.status === 'open');
  const verified = open.filter((l) => l.auto?.['6g']).length;
  const posted = open.filter((l) => l.auto?.['7d']).length;
  // badge: my own follow-ups due today or overdue (the To do page opens on "My leads")
  const dueCount = (leads || []).filter((l) => l.status === 'open' && l.owner_id === user?.id && l.due_date && l.due_date <= todayEAT()).length;
  const showChrome = !pathname.startsWith('/coordinator/leads/') && pathname !== '/coordinator/new';

  return (
    <LeadBoardContext.Provider value={value}>
      <div className="min-h-screen bg-[#f4f7f5] text-gray-900">
        <div className="max-w-[640px] mx-auto pb-40 min-h-screen">
          {showChrome && (
            <header className="bg-[#07423a] text-white px-[18px] pt-3.5 pb-[18px] sticky top-0 z-20">
              <div className="flex items-center gap-2.5">
                <div className="w-[34px] h-[34px] rounded-[11px] bg-teal-400 grid place-items-center font-black text-[#07423a]">A</div>
                <div>
                  <h1 className="font-extrabold text-[21px] leading-none tracking-tight">AfyaWork</h1>
                  <small className="block text-[12.5px] opacity-80 font-medium mt-0.5">Facility pipeline · {user?.display_name}</small>
                </div>
                <div className="ml-auto flex gap-1.5">
                  {role === 'admin' && (
                    <Link to="/admin/leads" className="h-10 px-3 rounded-xl bg-white/15 text-xs font-bold flex items-center gap-1"><Shield className="w-4 h-4" />Admin</Link>
                  )}
                  <button onClick={signOut} aria-label="Sign out" className="w-10 h-10 rounded-xl bg-white/15 grid place-items-center"><LogOut className="w-4 h-4" /></button>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-3.5">
                {[[open.length, 'In pipeline'], [verified, 'Verified'], [posted, 'Posted a shift']].map(([n, l]) => (
                  <div key={l} className="bg-white/10 rounded-xl px-3 py-2">
                    <b className="block text-2xl font-extrabold leading-tight">{leads ? n : '–'}</b>
                    <span className="text-[12.5px] opacity-80">{l}</span>
                  </div>
                ))}
              </div>
            </header>
          )}

          {error && <p className="mx-4 mt-3 p-3 rounded-xl bg-red-50 text-red-700 text-sm font-semibold">{error}</p>}
          <Outlet />
        </div>

        {showChrome && (
          <>
            <Link to="/coordinator/new"
              className="fixed z-30 right-4 sm:right-[max(16px,calc(50%-304px))] bottom-[84px] h-14 rounded-full bg-amber-400 text-[#2e1f00] font-extrabold text-base pl-[18px] pr-[22px] flex items-center gap-2 shadow-lg">
              <Plus className="w-5 h-5" /> Add lead
            </Link>
            <nav className="fixed inset-x-0 bottom-0 z-30 bg-white border-t-[1.5px] border-gray-200 flex justify-center pb-[env(safe-area-inset-bottom)]">
              <div className="flex w-full max-w-[640px]">
                {[['/coordinator', 'Pipeline', LayoutList], ['/coordinator/todo', 'To do', CircleCheck], ['/coordinator/playbook', 'Playbook', BookOpen]].map(([to, label, Icon]) => (
                  <NavLink key={to} to={to} end
                    className={({ isActive }) => `relative flex-1 h-16 flex flex-col items-center justify-center gap-0.5 text-[12.5px] font-bold ${isActive ? 'text-teal-700' : 'text-gray-500'}`}>
                    <Icon className="w-6 h-6" />{label}
                    {to === '/coordinator/todo' && dueCount > 0 && (
                      <span className="absolute top-1.5 left-[calc(50%+8px)] min-w-5 h-5 px-1 rounded-full bg-red-600 text-white text-xs grid place-items-center">{dueCount}</span>
                    )}
                  </NavLink>
                ))}
              </div>
            </nav>
          </>
        )}
        {toast && (
          <div role="status" className="fixed left-1/2 -translate-x-1/2 bottom-[92px] z-50 bg-gray-900 text-white px-4 py-3 rounded-xl text-sm font-semibold max-w-[90vw] text-center">{toast}</div>
        )}
      </div>
    </LeadBoardContext.Provider>
  );
}
