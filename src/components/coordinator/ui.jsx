import { useState } from 'react';
import { Phone, MessageCircle } from 'lucide-react';
import { intlDigits } from '../../lib/leadSteps';

/** Call + WhatsApp buttons (44 px targets). Greyed out without a number. */
export function ContactButtons({ phone, labels = false, className = '' }) {
  const d = intlDigits(phone);
  const base = 'h-11 min-w-11 px-3 rounded-xl inline-flex items-center justify-center gap-1.5 font-bold text-sm';
  const off = d ? '' : ' opacity-40 pointer-events-none';
  return (
    <div className={`flex gap-2 ${className}`} onClick={(e) => e.stopPropagation()}>
      <a href={d ? `tel:+${d}` : undefined} aria-label="Call" className={`${base} bg-teal-700 text-white${off}`}>
        <Phone className="w-4 h-4" />{labels && 'Call'}
      </a>
      <a href={d ? `https://wa.me/${d}` : undefined} target="_blank" rel="noreferrer" aria-label="WhatsApp"
        className={`${base} bg-[#1f9d57] text-white${off}`}>
        <MessageCircle className="w-4 h-4" />{labels && 'WhatsApp'}
      </a>
    </div>
  );
}

/**
 * Text field that saves on blur. While someone types, live updates from a colleague
 * never overwrite the field (the input is keyed to the value it had when focused).
 */
export function BlurField({ label, value, onSave, type = 'text', placeholder, multiline = false, inputMode, hint }) {
  const [editKey, setEditKey] = useState(null);
  const shown = value ?? '';
  const key = editKey ?? `v:${shown}`;
  const cls = 'w-full rounded-xl border-[1.5px] border-gray-200 bg-gray-50 px-3 text-base text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white';
  const props = {
    key,
    defaultValue: shown,
    placeholder,
    inputMode,
    onFocus: () => setEditKey(`v:${shown}`),
    onBlur: (e) => {
      setEditKey(null);
      const v = e.target.value.trim();
      if (v !== String(shown)) onSave(v);
    },
  };
  return (
    <label className="grid gap-1.5 text-[13.5px] font-bold text-gray-500">
      {label}
      {multiline
        ? <textarea {...props} rows={4} className={`${cls} py-2.5 min-h-[92px]`} />
        : <input {...props} type={type} className={`${cls} h-12`} />}
      {hint && <span className="text-xs font-medium text-gray-400">{hint}</span>}
    </label>
  );
}

export function Segmented({ options, value, onChange, danger }) {
  return (
    <div className={`grid gap-1.5`} style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map(([v, label]) => (
        <button key={v} type="button" onClick={() => onChange(v)}
          className={`h-11 rounded-xl border-[1.5px] text-sm font-bold ${value === v
            ? (danger === v ? 'bg-red-600 border-red-600 text-white' : 'bg-teal-700 border-teal-700 text-white')
            : 'bg-white border-gray-200 text-gray-700'}`}>
          {label}
        </button>
      ))}
    </div>
  );
}
