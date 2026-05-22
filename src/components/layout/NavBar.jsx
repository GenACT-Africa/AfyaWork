import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Menu, X, Stethoscope, LogOut } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { LanguageToggle } from '../common/LanguageToggle';

export function NavBar() {
  const { user, role, signOut } = useAuth();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const coLinks = [
    { to: '/co/dashboard',    label: t('nav.dashboard') },
    { to: '/co/shifts',       label: t('nav.browse_shifts') },
    { to: '/co/applications', label: t('nav.my_applications') },
    { to: '/co/profile',      label: t('nav.profile') },
  ];

  const facilityLinks = [
    { to: '/facility/dashboard',  label: t('nav.dashboard') },
    { to: '/facility/post-shift', label: t('nav.post_shift') },
    { to: '/facility/shifts',     label: t('nav.my_shifts') },
    { to: '/facility/profile',    label: t('nav.profile') },
  ];

  const links = role === 'co' ? coLinks : facilityLinks;
  const initials = (user?.display_name || user?.email || '?')
    .split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  async function handleSignOut() {
    await signOut();
    navigate('/');
  }

  if (!user) return null;

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
                    ${active
                      ? 'bg-teal-50 text-teal-700'
                      : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'}`}
                >
                  {l.label}
                </Link>
              );
            })}
          </div>

          {/* Desktop right side */}
          <div className="hidden md:flex items-center gap-3">
            <LanguageToggle />
            <div className="h-5 w-px bg-gray-200" />
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-teal-500 to-emerald-500 text-white text-xs font-bold flex items-center justify-center shadow-sm shrink-0">
                {initials}
              </div>
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

          {/* Mobile: avatar + hamburger */}
          <div className="md:hidden flex items-center gap-2">
            <LanguageToggle />
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-teal-500 to-emerald-500 text-white text-xs font-bold flex items-center justify-center">
              {initials}
            </div>
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
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-teal-500 to-emerald-500 text-white text-sm font-bold flex items-center justify-center shrink-0 shadow-sm">
                {initials}
              </div>
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

            <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
              <button
                onClick={handleSignOut}
                className="flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 rounded-xl transition-colors"
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
