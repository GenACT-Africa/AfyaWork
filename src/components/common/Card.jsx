import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

export function Card({ children, className = '', ...props }) {
  return (
    <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm ${className}`} {...props}>
      {children}
    </div>
  );
}

const gradients = {
  teal:   { bg: 'from-teal-500 to-emerald-500',   text: 'text-teal-600',   light: 'bg-teal-50'   },
  blue:   { bg: 'from-blue-500 to-indigo-500',    text: 'text-blue-600',   light: 'bg-blue-50'   },
  yellow: { bg: 'from-amber-400 to-orange-400',   text: 'text-amber-600',  light: 'bg-amber-50'  },
  red:    { bg: 'from-red-500 to-rose-500',        text: 'text-red-600',    light: 'bg-red-50'    },
  purple: { bg: 'from-purple-500 to-violet-500',  text: 'text-purple-600', light: 'bg-purple-50' },
  orange: { bg: 'from-orange-500 to-amber-500',   text: 'text-orange-600', light: 'bg-orange-50' },
};

/**
 * StatCard — clickable when `to` is supplied.
 * Props:
 *   label   — stat description
 *   value   — the number / string to display prominently
 *   icon    — lucide icon component
 *   color   — 'teal' | 'blue' | 'yellow' | 'red' | 'purple' | 'orange'
 *   to      — (optional) react-router path; wraps card in <Link>
 */
export function StatCard({ label, value, icon: Icon, color = 'teal', to }) {
  const g = gradients[color] || gradients.teal;

  const cls = [
    'relative bg-white rounded-2xl border border-gray-100 shadow-sm p-5 overflow-hidden',
    'group transition-all duration-200',
    to ? 'hover:shadow-md hover:border-gray-200 cursor-pointer' : 'hover:shadow-md',
  ].join(' ');

  const inner = (
    <>
      {/* Decorative glow circle */}
      <div className={`absolute -top-4 -right-4 w-20 h-20 rounded-full bg-gradient-to-br ${g.bg} opacity-10 group-hover:opacity-20 transition-opacity`} />

      {/* Icon badge */}
      <div className={`inline-flex p-2.5 rounded-xl bg-gradient-to-br ${g.bg} mb-4 shadow-sm`}>
        <Icon className="w-5 h-5 text-white" />
      </div>

      {/* Value */}
      <p className="text-3xl font-bold text-gray-900 leading-none">{value}</p>

      {/* Label */}
      <p className="text-sm text-gray-500 mt-1.5 font-medium">{label}</p>

      {/* Arrow hint — only for linked cards */}
      {to && (
        <div className={`absolute bottom-3 right-3 w-5 h-5 rounded-full ${g.light} flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity`}>
          <ChevronRight className={`w-3 h-3 ${g.text}`} />
        </div>
      )}
    </>
  );

  return to
    ? <Link to={to} className={cls}>{inner}</Link>
    : <div className={cls}>{inner}</div>;
}
