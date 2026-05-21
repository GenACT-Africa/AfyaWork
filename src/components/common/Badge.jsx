const styles = {
  open:      'bg-green-100 text-green-800',
  filled:    'bg-blue-100 text-blue-800',
  cancelled: 'bg-gray-100 text-gray-600',
  pending:   'bg-yellow-100 text-yellow-800',
  approved:  'bg-green-100 text-green-800',
  rejected:  'bg-red-100 text-red-700',
  msingi:    'bg-gray-100 text-gray-700',
  daktari:   'bg-teal-100 text-teal-800',
  bingwa:    'bg-purple-100 text-purple-800',
};

const labels = {
  open: 'Open', filled: 'Filled', cancelled: 'Cancelled',
  pending: 'Pending', approved: 'Approved', rejected: 'Rejected',
  msingi: 'Msingi', daktari: 'Daktari', bingwa: 'Bingwa',
};

export function Badge({ status, className = '' }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[status] || 'bg-gray-100 text-gray-700'} ${className}`}>
      {labels[status] || status}
    </span>
  );
}
