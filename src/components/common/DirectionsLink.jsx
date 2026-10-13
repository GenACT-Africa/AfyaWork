import { useTranslation } from 'react-i18next';
import { Navigation } from 'lucide-react';
import { directionsUrl } from '../../lib/maps';

/** "Directions" link that opens Google Maps to the facility. Renders nothing if the facility has no location. */
export function DirectionsLink({ facility, variant = 'link', className = '' }) {
  const { t } = useTranslation();
  const href = directionsUrl(facility);
  if (!href) return null;
  const styles = variant === 'button'
    ? 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-teal-200 bg-white text-teal-700 text-sm font-semibold hover:bg-teal-50'
    : 'inline-flex items-center gap-1 text-teal-700 font-medium hover:underline';
  return (
    <a href={href} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className={`${styles} ${className}`}>
      <Navigation className="w-3.5 h-3.5" /> {t('location.directions')}
    </a>
  );
}
