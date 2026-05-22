export function Card({ children, className = '', ...props }) {
  return (
    <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm ${className}`} {...props}>
      {children}
    </div>
  );
}

const gradients = {
  teal:   { bg: 'from-teal-500 to-emerald-500', text: 'text-teal-600', light: 'bg-teal-50' },
  blue:   { bg: 'from-blue-500 to-indigo-500',  text: 'text-blue-600',  light: 'bg-blue-50' },
  yellow: { bg: 'from-amber-400 to-orange-400', text: 'text-amber-600', light: 'bg-amber-50' },
  red:    { bg: 'from-red-500 to-rose-500',     text: 'text-red-600',   light: 'bg-red-50' },
  purple: { bg: 'from-purple-500 to-violet-500',text: 'text-purple-600',light: 'bg-purple-50' },
};

export function StatCard({ label, value, icon: Icon, color = 'teal' }) {
  const g = gradients[color] || gradients.teal;
  return (
    <div className="relative bg-white rounded-2xl border border-gray-100 shadow-sm p-5 overflow-hidden group hover:shadow-md transition-shadow">
      <div className={`absolute -top-4 -right-4 w-20 h-20 rounded-full bg-gradient-to-br ${g.bg} opacity-10 group-hover:opacity-15 transition-opacity`} />
      <div className={`inline-flex p-2.5 rounded-xl bg-gradient-to-br ${g.bg} mb-4 shadow-sm`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <p className="text-3xl font-bold text-gray-900 leading-none">{value}</p>
      <p className="text-sm text-gray-500 mt-1.5 font-medium">{label}</p>
    </div>
  );
}
