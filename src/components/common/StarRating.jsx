import { useState } from 'react';
import { Star } from 'lucide-react';

const SIZES = {
  sm:  'w-4 h-4',
  md:  'w-5 h-5',
  lg:  'w-7 h-7',
};

/**
 * StarRating — interactive or read-only star display.
 *
 * Props:
 *   value    {number}   current star count (0–5)
 *   onChange {function} called with new star count when user clicks; omit for readonly
 *   size     {'sm'|'md'|'lg'}
 *   readonly {boolean}  disables interaction
 *   className {string}
 */
export function StarRating({ value = 0, onChange = null, size = 'md', readonly = false, className = '' }) {
  const [hover, setHover] = useState(0);
  const sz = SIZES[size] ?? SIZES.md;

  return (
    <div className={`flex items-center gap-0.5 ${className}`}>
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = star <= (hover || value);
        return (
          <button
            key={star}
            type="button"
            disabled={readonly || !onChange}
            onClick={() => onChange && onChange(star)}
            onMouseEnter={() => !readonly && onChange && setHover(star)}
            onMouseLeave={() => !readonly && onChange && setHover(0)}
            className={`p-0.5 transition-transform ${
              readonly || !onChange
                ? 'cursor-default'
                : 'cursor-pointer hover:scale-110 active:scale-95'
            }`}
            aria-label={`${star} star${star !== 1 ? 's' : ''}`}
          >
            <Star
              className={`${sz} transition-colors duration-100 ${
                filled ? 'fill-amber-400 text-amber-400' : 'fill-none text-gray-300'
              }`}
            />
          </button>
        );
      })}
    </div>
  );
}
