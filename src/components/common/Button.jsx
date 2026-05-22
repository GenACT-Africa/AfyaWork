import { Link } from 'react-router-dom';

const base = 'inline-flex items-center justify-center font-semibold rounded-xl transition-all duration-150 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 focus:outline-none focus:ring-2 focus:ring-offset-2';

const variants = {
  primary:   'bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-700 hover:to-teal-600 text-white shadow-sm hover:shadow focus:ring-teal-500',
  secondary: 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300 shadow-sm focus:ring-gray-300',
  danger:    'bg-gradient-to-r from-red-600 to-red-500 hover:from-red-700 hover:to-red-600 text-white shadow-sm focus:ring-red-500',
  ghost:     'text-gray-600 hover:bg-gray-100 focus:ring-gray-300',
};

const sizes = {
  sm: 'text-sm px-4 py-2 gap-1',
  md: 'text-sm px-5 py-2.5 gap-1.5',
  lg: 'text-base px-6 py-3 gap-2',
};

export function Button({ children, variant = 'primary', size = 'md', className = '', disabled, loading, to, ...props }) {
  const classes = `${base} ${variants[variant]} ${sizes[size]} ${className}`;
  const spinner = loading && (
    <svg className="animate-spin w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
  if (to) return <Link to={to} className={classes} {...props}>{spinner}{children}</Link>;
  return <button className={classes} disabled={disabled || loading} {...props}>{spinner}{children}</button>;
}
