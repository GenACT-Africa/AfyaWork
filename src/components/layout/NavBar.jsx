import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Menu, X, Stethoscope, LogOut, ChevronDown } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const coLinks = [
  { to: '/co/dashboard', label: 'Dashboard' },
  { to: '/co/shifts', label: 'Browse Shifts' },
  { to: '/co/applications', label: 'My Applications' },
  { to: '/co/profile', label: 'Profile' },
];

const facilityLinks = [
  { to: '/facility/dashboard', label: 'Dashboard' },
  { to: '/facility/post-shift', label: 'Post Shift' },
  { to: '/facility/shifts', label: 'My Shifts' },
  { to: '/facility/profile', label: 'Profile' },
];

export function NavBar() {
  const { user, role, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const links = role === 'co' ? coLinks : facilityLinks;
  const initials = (user?.display_name || user?.email || '?')
    .split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  async function handleSignOut() {
    await signOut();
    navigate('/');
  }

  if (!user) return null;

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex items-center justify-between h-14 md:h-16">

          {/* Logo → always goes to homepage */}
          <Link to="/" className="flex items-center gap-2 font-bold text-teal-600 text-base md:text-lg shrink-0">
            <Stethoscope className="w-5 h-5 md:w-6 md:h-6" />
            <span>AfyaWork</span>
          </Link>

          {/* Desktop nav links */}
          <div className="hidden md:flex items-center gap-0.5">
            {links.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap
                  ${location.pathname === l.to || location.pathname.startsWith(l.to + '/')
                    ? 'bg-teal-50 text-teal-700'
                    : 'text-gray-600 hover:bg-gray-100'}`}
              >
                {l.label}
              </Link>
            ))}
          </div>

          {/* Desktop user area */}
          <div className="hidden md:flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-teal-600 text-white text-xs font-bold flex items-center justify-center shrink-0">
                {initials}
              </div>
              <span className="text-sm text-gray-600 max-w-[140px] truncate">
                {user.display_name || user.email}
              </span>
            </div>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-1 text-sm text-gray-400 hover:text-red-600 transition-colors px-2 py-1 rounded-lg hover:bg-red-50"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign out</span>
            </button>
          </div>

          {/* Mobile: avatar + hamburger */}
          <div className="md:hidden flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-teal-600 text-white text-xs font-bold flex items-center justify-center">
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
            {/* User info */}
            <div className="flex items-center gap-3 px-3 py-3 mb-2 bg-gray-50 rounded-xl">
              <div className="w-10 h-10 rounded-full bg-teal-600 text-white text-sm font-bold flex items-center justify-center shrink-0">
                {initials}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{user.display_name || 'User'}</p>
                <p className="text-xs text-gray-400 truncate">{user.email}</p>
              </div>
            </div>

            {/* Nav links */}
            <div className="space-y-0.5">
              {links.map((l) => (
                <Link
                  key={l.to}
                  to={l.to}
                  onClick={() => setOpen(false)}
                  className={`flex items-center px-3 py-3 rounded-xl text-sm font-medium transition-colors
                    ${location.pathname === l.to || location.pathname.startsWith(l.to + '/')
                      ? 'bg-teal-50 text-teal-700'
                      : 'text-gray-700 hover:bg-gray-100'}`}
                >
                  {l.label}
                </Link>
              ))}
            </div>

            {/* Sign out */}
            <div className="mt-3 pt-3 border-t border-gray-100">
              <button
                onClick={handleSignOut}
                className="flex items-center gap-2 w-full px-3 py-3 text-sm font-medium text-red-600 hover:bg-red-50 rounded-xl transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
