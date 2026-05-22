import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Stethoscope } from 'lucide-react';

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

export function dashboardFor(role) {
  if (role === 'admin') return '/admin/dashboard';
  if (role === 'facility') return '/facility/dashboard';
  return '/co/dashboard';
}

export function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/auth/login" state={{ from: location }} replace />;
  return children;
}

export function RequireCO({ children }) {
  const { user, role, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/auth/login" state={{ from: location }} replace />;
  if (role !== 'co') return <Navigate to={dashboardFor(role)} replace />;
  return children;
}

export function RequireFacility({ children }) {
  const { user, role, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/auth/login" state={{ from: location }} replace />;
  if (role !== 'facility') return <Navigate to={dashboardFor(role)} replace />;
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
