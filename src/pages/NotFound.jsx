import { Link } from 'react-router-dom';
import { Stethoscope, ArrowLeft } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function NotFound() {
  const { user, role } = useAuth();
  const home = user ? (role === 'facility' ? '/facility/dashboard' : '/co/dashboard') : '/';

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 text-center">
      <Stethoscope className="w-12 h-12 text-teal-600 mb-4" />
      <h1 className="text-6xl font-extrabold text-gray-900 mb-2">404</h1>
      <p className="text-xl font-semibold text-gray-700 mb-2">Page not found</p>
      <p className="text-gray-400 mb-8 max-w-sm">The page you're looking for doesn't exist or has been moved.</p>
      <Link
        to={home}
        className="inline-flex items-center gap-2 bg-teal-600 text-white text-sm font-medium px-5 py-2.5 rounded-lg hover:bg-teal-700 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Go home
      </Link>
    </div>
  );
}
