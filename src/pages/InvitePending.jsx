import { useNavigate } from 'react-router-dom';
import { Stethoscope, MailOpen, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function InvitePending() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  async function handleSignOut() {
    await signOut();
    navigate('/', { replace: true });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-50 to-emerald-50 px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-teal-600 flex items-center justify-center shadow-md">
              <Stethoscope className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold text-gray-900">AfyaWork</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-amber-100 flex items-center justify-center mx-auto mb-5">
            <MailOpen className="w-8 h-8 text-amber-600" />
          </div>

          <h1 className="text-xl font-bold text-gray-900 mb-2">Check your email</h1>
          <p className="text-sm text-gray-500 mb-1">
            Your account is pending activation.
          </p>
          {user?.email && (
            <p className="text-sm font-semibold text-gray-700 mb-4">{user.email}</p>
          )}
          <p className="text-sm text-gray-500 mb-8">
            An invitation email was sent to you with a link to set your password. Once you activate your account, you'll be taken straight to your dashboard.
          </p>

          <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 mb-6 text-left">
            <p className="text-xs text-amber-700 font-medium mb-1">Can't find the email?</p>
            <ul className="text-xs text-amber-600 space-y-0.5 list-disc list-inside">
              <li>Check your spam or junk folder</li>
              <li>The link expires after 7 days</li>
              <li>Contact your admin to resend the invite</li>
            </ul>
          </div>

          <button
            onClick={handleSignOut}
            className="w-full flex items-center justify-center gap-2 border border-gray-200 text-gray-600 hover:bg-gray-50 font-medium py-2.5 rounded-xl text-sm transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          Need help?{' '}
          <a href="mailto:admin@genactafrica.org" className="text-teal-600 hover:underline">
            admin@genactafrica.org
          </a>
        </p>
      </div>
    </div>
  );
}
