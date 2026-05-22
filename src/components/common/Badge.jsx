import { useTranslation } from 'react-i18next';

const styles = {
  open:      'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  filled:    'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
  cancelled: 'bg-gray-100 text-gray-500 ring-1 ring-gray-200',
  pending:   'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  approved:  'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  rejected:  'bg-red-50 text-red-600 ring-1 ring-red-200',
  msingi:    'bg-gray-100 text-gray-600 ring-1 ring-gray-200',
  daktari:   'bg-teal-50 text-teal-700 ring-1 ring-teal-200',
  bingwa:    'bg-purple-50 text-purple-700 ring-1 ring-purple-200',
};

const dots = {
  open: 'bg-emerald-500', filled: 'bg-blue-500', cancelled: 'bg-gray-400',
  pending: 'bg-amber-500', approved: 'bg-emerald-500', rejected: 'bg-red-500',
};

export function Badge({ status, className = '' }) {
  const { t } = useTranslation();
  const label = t(`status.${status}`, { defaultValue: status });
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold ${styles[status] || 'bg-gray-100 text-gray-600'} ${className}`}>
      {dots[status] && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dots[status]}`} />}
      {label}
    </span>
  );
}
