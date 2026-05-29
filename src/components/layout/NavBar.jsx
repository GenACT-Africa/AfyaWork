import { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Menu, X, Stethoscope, LogOut, Bell, CheckCheck, MessageSquarePlus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { LanguageToggle } from '../common/LanguageToggle';
import { Avatar } from '../common/Avatar';
import { getNotifications, markAllNotificationsRead } from '../../lib/api';
import { supabase } from '../../lib/supabase';

export function NavBar() {
  const { user, role, signOut } = useAuth();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  // Notifications state
  const [notifOpen, setNotifOpen]         = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread]               = useState(0);
  const desktopNotifRef = useRef(null);
  const mobileNotifRef  = useRef(null);

  const coLinks = [
    { to: '/co/dashboard',    label: t('nav.dashboard') },
    { to: '/co/shifts',       label: t('nav.browse_shifts') },
    { to: '/co/applications', label: t('nav.my_applications') },
    { to: '/co/payments',     label: 'Payments' },
    { to: '/co/profile',      label: t('nav.profile') },
  ];

  const facilityLinks = [
    { to: '/facility/dashboard',  label: t('nav.dashboard') },
    { to: '/facility/post-shift', label: t('nav.post_shift') },
    { to: '/facility/shifts',     label: t('nav.my_shifts') },
    { to: '/facility/browse-cos', label: 'Find COs' },
    { to: '/facility/profile',    label: t('nav.profile') },
  ];

  const adminLinks = [
    { to: '/admin/dashboard',  label: t('nav.overview') },
    { to: '/admin/facilities', label: t('nav.facilities') },
    { to: '/admin/workers',    label: t('nav.workers') },
    { to: '/admin/shifts',     label: t('nav.all_shifts') },
    { to: '/admin/payments',   label: 'Payments' },
  ];

  const links = role === 'admin' ? adminLinks : role === 'co' ? coLinks : facilityLinks;

  // ── Notifications ──
  async function loadNotifications() {
    const { data } = await getNotifications(15);
    if (data) {
      setNotifications(data);
      setUnread(data.filter((n) => !n.read).length);
    }
  }

  useEffect(() => {
    if (!user?.id || role === 'admin') return;
    loadNotifications();

    const channel = supabase
      .channel(`notif-${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        () => loadNotifications()
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [user?.id, role]);

  // Close notification panel on outside click (handles desktop + mobile refs)
  useEffect(() => {
    function handleClick(e) {
      const inDesktop = desktopNotifRef.current?.contains(e.target);
      const inMobile  = mobileNotifRef.current?.contains(e.target);
      if (!inDesktop && !inMobile) setNotifOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  async function handleOpenNotif() {
    setNotifOpen((v) => !v);
    if (!notifOpen && unread > 0) {
      await markAllNotificationsRead();
      setUnread(0);
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    }
  }

  function handleNotifClick(notif) {
    setNotifOpen(false);
    if (notif.action_url) navigate(notif.action_url);
  }

  async function handleSignOut() {
    await signOut();
    navigate('/');
  }

  if (!user) return null;

  const showBell = role !== 'admin';

  return (
    <nav className="bg-white/95 backdrop-blur-sm border-b border-gray-100 sticky top-0 z-40 shadow-sm">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">

          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 shrink-0 group">
            <div className="w-8 h-8 bg-gradient-to-br from-teal-600 to-emerald-500 rounded-lg flex items-center justify-center shadow-sm group-hover:shadow transition-shadow">
              <Stethoscope className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-gray-900 text-base md:text-lg tracking-tight">
              Afya<span className="text-teal-600">Work</span>
            </span>
          </Link>

          {/* Desktop nav links */}
          <div className="hidden md:flex items-center gap-0.5">
            {links.map((l) => {
              const active = location.pathname === l.to || location.pathname.startsWith(l.to + '/');
              return (
                <Link
                  key={l.to}
                  to={l.to}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap
                    ${active ? 'bg-teal-50 text-teal-700' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'}`}
                >
                  {l.label}
                </Link>
              );
            })}
          </div>

          {/* Desktop right side */}
          <div className="hidden md:flex items-center gap-3">
            <LanguageToggle />

            {/* Notification bell */}
            {showBell && (
              <div className="relative" ref={desktopNotifRef}>
                <button
                  onClick={handleOpenNotif}
                  className="relative p-2 rounded-lg text-gray-400 hover:text-teal-600 hover:bg-teal-50 transition-colors"
                  aria-label="Notifications"
                >
                  <Bell className="w-5 h-5" />
                  {unread > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                      {unread > 9 ? '9+' : unread}
                    </span>
                  )}
                </button>

                {/* Dropdown */}
                {notifOpen && (
                  <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden z-50">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                      <p className="font-semibold text-gray-900 text-sm">Notifications</p>
                      {notifications.length > 0 && (
                        <button
                          onClick={async () => { await markAllNotificationsRead(); setUnread(0); setNotifications((prev) => prev.map((n) => ({ ...n, read: true }))); }}
                          className="text-xs text-teal-600 hover:text-teal-700 flex items-center gap-1"
                        >
                          <CheckCheck className="w-3 h-3" /> Mark all read
                        </button>
                      )}
                    </div>

                    <div className="max-h-80 overflow-y-auto divide-y divide-gray-50">
                      {notifications.length === 0 ? (
                        <div className="py-10 text-center">
                          <Bell className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                          <p className="text-sm text-gray-400">No notifications yet</p>
                        </div>
                      ) : notifications.map((notif) => (
                        <button
                          key={notif.id}
                          onClick={() => handleNotifClick(notif)}
                          className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors ${!notif.read ? 'bg-teal-50/40' : ''}`}
                        >
                          <div className="flex items-start gap-2">
                            {!notif.read && <span className="w-2 h-2 bg-teal-500 rounded-full mt-1.5 shrink-0" />}
                            <div className={!notif.read ? '' : 'ml-4'}>
                              <p className="text-sm font-semibold text-gray-900 leading-tight">{notif.title}</p>
                              {notif.body && (
                                <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{notif.body}</p>
                              )}
                              <p className="text-xs text-gray-400 mt-1">
                                {new Date(notif.created_at).toLocaleString('en-TZ', { dateStyle: 'short', timeStyle: 'short' })}
                              </p>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="h-5 w-px bg-gray-200" />
            <Link
              to="/feedback"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 transition-colors"
              title="Share beta feedback"
            >
              <MessageSquarePlus className="w-3.5 h-3.5" /> Beta Feedback
            </Link>
            <div className="h-5 w-px bg-gray-200" />
            <div className="flex items-center gap-2">
              <Avatar src={user.avatar_url} name={user.display_name || user.email} size="sm" />
              <span className="text-sm text-gray-600 max-w-[130px] truncate font-medium">
                {user.display_name || user.email}
              </span>
            </div>
            <button
              onClick={handleSignOut}
              title={t('nav.sign_out')}
              className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>

          {/* Mobile: bell + avatar + hamburger */}
          <div className="md:hidden flex items-center gap-1.5">
            <LanguageToggle />

            {showBell && (
              <div className="relative" ref={mobileNotifRef}>
                <button
                  onClick={handleOpenNotif}
                  className="relative p-2 rounded-lg text-gray-400 hover:text-teal-600 transition-colors"
                >
                  <Bell className="w-5 h-5" />
                  {unread > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                      {unread > 9 ? '9+' : unread}
                    </span>
                  )}
                </button>

                {notifOpen && (
                  <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden z-50">
                    <div className="px-4 py-3 border-b border-gray-100">
                      <p className="font-semibold text-gray-900 text-sm">Notifications</p>
                    </div>
                    <div className="max-h-64 overflow-y-auto divide-y divide-gray-50">
                      {notifications.length === 0 ? (
                        <div className="py-8 text-center">
                          <p className="text-sm text-gray-400">No notifications yet</p>
                        </div>
                      ) : notifications.map((notif) => (
                        <button
                          key={notif.id}
                          onClick={() => handleNotifClick(notif)}
                          className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors ${!notif.read ? 'bg-teal-50/40' : ''}`}
                        >
                          <div className="flex items-start gap-2">
                            {!notif.read && <span className="w-2 h-2 bg-teal-500 rounded-full mt-1.5 shrink-0" />}
                            <div className={!notif.read ? '' : 'ml-4'}>
                              <p className="text-xs font-semibold text-gray-900">{notif.title}</p>
                              {notif.body && <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{notif.body}</p>}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <Avatar src={user.avatar_url} name={user.display_name || user.email} size="sm" />
            <button
              className="p-2 rounded-lg hover:bg-gray-100 active:bg-gray-200 transition-colors"
              onClick={() => setOpen(!open)}
              aria-label="Toggle menu"
            >
              {open ? <X className="w-5 h-5 text-gray-600" /> : <Menu className="w-5 h-5 text-gray-600" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="md:hidden border-t border-gray-100 bg-white shadow-lg">
          <div className="px-4 py-3">
            <div className="flex items-center gap-3 px-3 py-3 mb-3 bg-gradient-to-r from-teal-50 to-emerald-50 rounded-xl border border-teal-100">
              <Avatar src={user.avatar_url} name={user.display_name || user.email} size="md" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{user.display_name || 'User'}</p>
                <p className="text-xs text-gray-400 truncate">{user.email}</p>
              </div>
            </div>

            <div className="space-y-0.5">
              {links.map((l) => {
                const active = location.pathname === l.to || location.pathname.startsWith(l.to + '/');
                return (
                  <Link
                    key={l.to}
                    to={l.to}
                    onClick={() => setOpen(false)}
                    className={`flex items-center px-3 py-3 rounded-xl text-sm font-medium transition-colors
                      ${active ? 'bg-teal-50 text-teal-700' : 'text-gray-700 hover:bg-gray-50'}`}
                  >
                    {l.label}
                  </Link>
                );
              })}
            </div>

            <div className="mt-3 pt-3 border-t border-gray-100 space-y-0.5">
              <Link
                to="/feedback"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-3 py-2.5 text-sm font-semibold text-teal-700 hover:bg-teal-50 rounded-xl transition-colors"
              >
                <MessageSquarePlus className="w-4 h-4" />
                Beta Feedback
              </Link>
              <button
                onClick={handleSignOut}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 rounded-xl transition-colors"
              >
                <LogOut className="w-4 h-4" />
                {t('nav.sign_out')}
              </button>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
