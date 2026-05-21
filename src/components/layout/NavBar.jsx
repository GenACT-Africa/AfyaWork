import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Menu, X, Stethoscope, LogOut } from 'lucide-react';
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

  async function handleSignOut() {
    await signOut();
    navigate('/');
  }

  if (!user) return null;

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to={role === 'co' ? '/co/dashboard' : '/facility/dashboard'} className="flex items-center gap-2 font-bold text-teal-600 text-lg">
            <Stethoscope className="w-6 h-6" />
            AfyaWork
          </Link>

          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-1">
            {links.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors
                  ${location.pathname === l.to
                    ? 'bg-teal-50 text-teal-700'
                    : 'text-gray-600 hover:bg-gray-100'}`}
              >
                {l.label}
              </Link>
            ))}
          </div>

          {/* User + signout */}
          <div className="hidden md:flex items-center gap-3">
            <span className="text-sm text-gray-500">{user.display_name || user.email}</span>
            <button onClick={handleSignOut} className="flex items-center gap-1 text-sm text-gray-500 hover:text-red-600 transition-colors">
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
          </div>

          {/* Mobile hamburger */}
          <button className="md:hidden p-2 rounded-lg hover:bg-gray-100" onClick={() => setOpen(!open)}>
            {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden border-t border-gray-100 bg-white px-4 py-3 space-y-1">
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              onClick={() => setOpen(false)}
              className={`block px-3 py-2 rounded-lg text-sm font-medium
                ${location.pathname === l.to ? 'bg-teal-50 text-teal-700' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              {l.label}
            </Link>
          ))}
          <div className="pt-2 border-t border-gray-100">
            <p className="px-3 py-1 text-xs text-gray-400">{user.email}</p>
            <button onClick={handleSignOut} className="flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg w-full">
              <LogOut className="w-4 h-4" /> Sign out
            </button>
          </div>
        </div>
      )}
    </nav>
  );
}
