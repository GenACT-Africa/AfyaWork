import { useEffect, useState } from 'react';
import { X, Star, Mail, Phone, MessageCircle, Check, Minus, EyeOff, Flag } from 'lucide-react';
import { Avatar } from '../common/Avatar';
import { formatDate, waLink } from './profileUtils';

// ── Account status ────────────────────────────────────────────────

const STATUS = {
  active:         { label: 'Active',         cls: 'bg-green-50 text-green-700 border-green-200', dot: 'bg-green-500' },
  pending_invite: { label: 'Invite pending', cls: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500' },
  expired:        { label: 'Invite expired', cls: 'bg-red-50 text-red-700 border-red-200',       dot: 'bg-red-500' },
};

export function AccountStatusBadge({ status = 'active' }) {
  const s = STATUS[status] || STATUS.active;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border whitespace-nowrap ${s.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full inline-block ${s.dot}`} />
      {s.label}
    </span>
  );
}

export function CompletenessBar({ result, showLabel = true, className = '' }) {
  const color = result.pct >= 100 ? 'bg-emerald-500' : result.pct >= 60 ? 'bg-teal-500' : result.pct >= 30 ? 'bg-amber-400' : 'bg-red-400';
  const missing = result.items.filter((i) => !i.done).map((i) => i.label);
  return (
    <div className={className} title={missing.length ? `Missing: ${missing.join(', ')}` : 'Profile complete'}>
      {showLabel && (
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-gray-500">Profile</span>
          <span className="font-semibold text-gray-700">{result.done}/{result.total}</span>
        </div>
      )}
      <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${result.pct}%` }} />
      </div>
    </div>
  );
}

export function ChecklistCard({ result }) {
  return (
    <ul className="space-y-1.5">
      {result.items.map((i) => (
        <li key={i.label} className="flex items-center gap-2 text-sm">
          {i.done
            ? <span className="w-4 h-4 rounded-full bg-emerald-100 flex items-center justify-center"><Check className="w-3 h-3 text-emerald-600" /></span>
            : <span className="w-4 h-4 rounded-full bg-gray-100 flex items-center justify-center"><Minus className="w-3 h-3 text-gray-400" /></span>}
          <span className={i.done ? 'text-gray-700' : 'text-gray-400'}>{i.label}</span>
        </li>
      ))}
    </ul>
  );
}

// ── Rating summary ────────────────────────────────────────────────

export function RatingPill({ rating }) {
  if (!rating?.count) return <span className="text-xs text-gray-400 whitespace-nowrap">No ratings</span>;
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-700 whitespace-nowrap">
      <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
      {rating.avg.toFixed(1)}
      <span className="font-normal text-gray-400">({rating.count})</span>
    </span>
  );
}

function Stars({ value }) {
  return (
    <span className="inline-flex">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={`w-3.5 h-3.5 ${n <= value ? 'fill-amber-400 text-amber-400' : 'text-gray-300'}`} />
      ))}
    </span>
  );
}

export function RatingsList({ ratings, emptyText = 'No ratings yet.' }) {
  if (!ratings?.length) return <p className="text-sm text-gray-400 italic">{emptyText}</p>;
  const visible = ratings.filter((r) => !r.hidden_by_admin);
  const avg = visible.length ? visible.reduce((t, r) => t + r.stars, 0) / visible.length : 0;
  return (
    <div>
      {visible.length > 0 && (
        <div className="flex items-center gap-3 mb-4">
          <span className="text-3xl font-bold text-gray-900">{avg.toFixed(1)}</span>
          <div>
            <Stars value={Math.round(avg)} />
            <p className="text-xs text-gray-400 mt-0.5">{visible.length} rating{visible.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
      )}
      <ul className="space-y-3">
        {ratings.map((r) => (
          <li key={r.id} className={`rounded-xl border px-4 py-3 ${r.hidden_by_admin ? 'border-dashed border-gray-200 bg-gray-50 opacity-70' : 'border-gray-100'}`}>
            <div className="flex items-center gap-2">
              <Avatar src={r.rater?.avatar_url} name={r.rater?.display_name} size="xs" shape={r.rater?.role === 'facility' ? 'rounded' : 'circle'} />
              <span className="text-sm font-medium text-gray-800 truncate">{r.rater?.display_name || 'Unknown'}</span>
              <span className="ml-auto"><Stars value={r.stars} /></span>
            </div>
            {r.comment && <p className="text-sm text-gray-600 mt-2 leading-relaxed">{r.comment}</p>}
            <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
              <span>{formatDate(r.published_at)}</span>
              {r.shifts?.shift_type && <span className="capitalize">{r.shifts.shift_type} shift · {formatDate(r.shifts.shift_date)}</span>}
              {r.hidden_by_admin && <span className="inline-flex items-center gap-1 text-gray-500"><EyeOff className="w-3 h-3" /> Hidden</span>}
              {r.reported && <span className="inline-flex items-center gap-1 text-red-500"><Flag className="w-3 h-3" /> Reported</span>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Layout pieces ─────────────────────────────────────────────────

export function Section({ icon: Icon, title, action, children, className = '' }) {
  return (
    <section className={`bg-white rounded-2xl border border-gray-100 shadow-sm p-5 ${className}`}>
      <div className="flex items-center gap-2 mb-4">
        {Icon && <Icon className="w-[18px] h-[18px] text-gray-400" />}
        <h3 className="font-semibold text-gray-900">{title}</h3>
        {action && <div className="ml-auto">{action}</div>}
      </div>
      {children}
    </section>
  );
}

/** Read-only field styled like the disabled inputs users see on their own profile page. */
export function Field({ label, value, mono = false }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      <span className={`text-sm px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 min-h-[38px] break-words ${value ? 'text-gray-800' : 'text-gray-400 italic'} ${mono ? 'font-mono' : ''}`}>
        {value || 'Not provided'}
      </span>
    </div>
  );
}

export function StatTile({ label, value, tone = 'gray' }) {
  const tones = {
    gray:   'bg-gray-50 text-gray-900',
    teal:   'bg-teal-50 text-teal-800',
    purple: 'bg-purple-50 text-purple-800',
    green:  'bg-emerald-50 text-emerald-800',
    red:    'bg-red-50 text-red-700',
    amber:  'bg-amber-50 text-amber-800',
  };
  return (
    <div className={`rounded-xl px-4 py-3 ${tones[tone]}`}>
      <p className="text-xl font-bold leading-tight">{value}</p>
      <p className="text-xs opacity-70 mt-0.5">{label}</p>
    </div>
  );
}

export function ContactButtons({ email, phone }) {
  const wa = waLink(phone);
  const btn = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors';
  return (
    <div className="flex flex-wrap gap-2">
      {email && (
        <a href={`mailto:${email}`} className={`${btn} border-gray-200 text-gray-700 hover:bg-gray-50`}>
          <Mail className="w-3.5 h-3.5" /> Email
        </a>
      )}
      {phone && (
        <a href={`tel:${phone.replace(/\s+/g, '')}`} className={`${btn} border-gray-200 text-gray-700 hover:bg-gray-50`}>
          <Phone className="w-3.5 h-3.5" /> Call
        </a>
      )}
      {wa && (
        <a href={wa} target="_blank" rel="noopener noreferrer" className={`${btn} border-green-200 text-green-700 bg-green-50 hover:bg-green-100`}>
          <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
        </a>
      )}
    </div>
  );
}

// ── Photo viewer ──────────────────────────────────────────────────

export function PhotoLightbox({ src, alt, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[70] bg-black/85 flex items-center justify-center p-6" onClick={onClose}>
      <button onClick={onClose} className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white" aria-label="Close photo">
        <X className="w-5 h-5" />
      </button>
      <img src={src} alt={alt} className="max-w-full max-h-full rounded-2xl shadow-2xl object-contain" onClick={(e) => e.stopPropagation()} />
    </div>
  );
}

/** Large profile photo; click to view full size. */
export function ProfilePhoto({ src, name, shape = 'circle' }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => src && setOpen(true)}
        className={`relative ring-4 ring-white shadow-md ${shape === 'rounded' ? 'rounded-2xl' : 'rounded-full'} ${src ? 'cursor-zoom-in' : 'cursor-default'}`}
        aria-label={src ? 'View full photo' : undefined}
      >
        <Avatar src={src} name={name} size="2xl" shape={shape} className="shadow-none" />
      </button>
      {open && <PhotoLightbox src={src} alt={name} onClose={() => setOpen(false)} />}
    </>
  );
}

// ── Drawer shell ──────────────────────────────────────────────────

export function ProfileDrawer({ onClose, children, footer }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <aside className="relative w-full max-w-4xl h-full bg-gray-50 shadow-2xl flex flex-col animate-[slideIn_.2s_ease-out]">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 p-2 rounded-full bg-white/80 hover:bg-white shadow-sm text-gray-600"
          aria-label="Close profile"
        >
          <X className="w-5 h-5" />
        </button>
        <div className="flex-1 overflow-y-auto">{children}</div>
        {footer && <div className="shrink-0 border-t border-gray-200 bg-white px-5 py-3">{footer}</div>}
      </aside>
      <style>{'@keyframes slideIn{from{transform:translateX(24px);opacity:.6}to{transform:none;opacity:1}}'}</style>
    </div>
  );
}

export function DrawerSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="h-32 bg-gradient-to-r from-teal-100 to-emerald-100" />
      <div className="px-6 -mt-12 flex items-end gap-4">
        <div className="w-24 h-24 rounded-full bg-gray-200 ring-4 ring-white" />
        <div className="space-y-2 pb-2"><div className="h-5 w-48 bg-gray-200 rounded" /><div className="h-3 w-32 bg-gray-200 rounded" /></div>
      </div>
      <div className="p-6 grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4"><div className="h-56 bg-gray-200 rounded-2xl" /><div className="h-40 bg-gray-200 rounded-2xl" /></div>
        <div className="space-y-4"><div className="h-40 bg-gray-200 rounded-2xl" /><div className="h-32 bg-gray-200 rounded-2xl" /></div>
      </div>
    </div>
  );
}
