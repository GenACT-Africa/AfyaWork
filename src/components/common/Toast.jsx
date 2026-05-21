import { useEffect, useState } from 'react';
import { CheckCircle, XCircle, X } from 'lucide-react';

export function Toast({ message, type = 'success', onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div className={`fixed bottom-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg text-white text-sm max-w-sm animate-slide-up
      ${type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
      {type === 'success' ? <CheckCircle className="w-5 h-5 shrink-0" /> : <XCircle className="w-5 h-5 shrink-0" />}
      <span className="flex-1">{message}</span>
      <button onClick={onClose} className="ml-2 hover:opacity-70"><X className="w-4 h-4" /></button>
    </div>
  );
}

export function useToast() {
  const [toast, setToast] = useState(null);
  const show = (message, type = 'success') => setToast({ message, type });
  const hide = () => setToast(null);
  const ToastComponent = toast ? <Toast {...toast} onClose={hide} /> : null;
  return { show, ToastComponent };
}
