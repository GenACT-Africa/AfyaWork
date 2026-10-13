import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Stethoscope } from 'lucide-react';
import { dashboardFor } from '../../lib/roles';

function Spinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="flex flex-col items-center gap-3 text-teal-600">
        <Stethoscope className="w-8 h-8 animate-pulse" />
        <p className="text-sm text-gray-500">Loading…</p>
      </div>
    </div>
  );
}


export function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/auth/login" state={{ from: location }} replace />;
  return children;
}

export function RequireCO({ children }) {
  const { user, role, accountStatus, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/auth/login" state={{ from: location }} replace />;
  if (accountStatus === 'pending_invite') return <Navigate to="/invite/pending" replace />;
  if (role !== 'co') return <Navigate to={dashboardFor(role)} replace />;
  return children;
}

export function RequireFacility({ children }) {
  const { user, role, accountStatus, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/auth/login" state={{ from: location }} replace />;
  if (accountStatus === 'pending_invite') return <Navigate to="/invite/pending" replace />;
  if (role !== 'facility') return <Navigate to={dashboardFor(role)} replace />;
  return children;
}

function AccessRemoved() {
  const { signOut } = useAuth();
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-6 text-center">
      <div className="max-w-sm">
        <Stethoscope className="w-10 h-10 text-gray-400 mx-auto mb-3" />
        <h1 className="text-lg font-bold text-gray-900">Your access has been removed</h1>
        <p className="text-sm text-gray-500 mt-2">This AfyaWork account is no longer active. Contact AfyaWork if you think this is a mistake.</p>
        <button onClick={signOut} className="mt-5 px-4 py-2.5 rounded-xl bg-teal-600 text-white text-sm font-semibold">Sign out</button>
      </div>
    </div>
  );
}

/** Coordinator area: active coordinators and admins. */
export function RequireCoordinator({ children }) {
  const { user, role, accountStatus, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/auth/login" state={{ from: location }} replace />;
  if (accountStatus === 'disabled') return <AccessRemoved />;
  if (accountStatus === 'pending_invite') return <Navigate to="/invite/pending" replace />;
  if (role !== 'coordinator' && role !== 'admin') return <Navigate to={dashboardFor(role)} replace />;
  return children;
}

export function RequireAdmin({ children }) {
  const { user, role, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/auth/login" state={{ from: location }} replace />;
  if (role !== 'admin') return <Navigate to={dashboardFor(role)} replace />;
  return children;
}
