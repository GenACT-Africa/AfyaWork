import { useState } from 'react';

const SIZES = {
  xs: 'w-6 h-6 text-[9px]',
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-11 h-11 text-sm',
  xl: 'w-16 h-16 text-xl',
};

/**
 * Avatar component — shows a profile image when available, falls back to initials.
 *
 * Props:
 *   src      — image URL (optional)
 *   name     — display name used for initials fallback and alt text
 *   size     — 'xs' | 'sm' | 'md' | 'lg' | 'xl'  (default: 'md')
 *   shape    — 'circle' | 'rounded'  (default: 'circle')
 *   className — extra Tailwind classes
 */
export function Avatar({ src, name, size = 'md', shape = 'circle', className = '' }) {
  const [imgError, setImgError] = useState(false);

  const sizeClass  = SIZES[size] ?? SIZES.md;
  const shapeClass = shape === 'rounded' ? 'rounded-xl' : 'rounded-full';
  const initials   = (name || '?')
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  if (src && !imgError) {
    return (
      <img
        src={src}
        alt={name || 'Avatar'}
        onError={() => setImgError(true)}
        className={`${sizeClass} ${shapeClass} object-cover shrink-0 shadow-sm ${className}`}
      />
    );
  }

  return (
    <div
      className={`${sizeClass} ${shapeClass} bg-gradient-to-br from-teal-500 to-emerald-500 flex items-center justify-center text-white font-bold shrink-0 shadow-sm ${className}`}
    >
      {initials}
    </div>
  );
}
