/**
 * Google Maps helpers for facility locations.
 * A facility gives either a Google Maps link (shared from the app) or its GPS position
 * (the "Use my current location" button). Coordinates are pulled out of full links when
 * present; short links (maps.app.goo.gl/…) are kept as they are and opened directly.
 */

const GOOGLE_TLD = '(?:com|[a-z]{2}|co\\.[a-z]{2}|com\\.[a-z]{2})';
const MAPS_HOST = new RegExp(`^(?:www\\.)?(?:google\\.${GOOGLE_TLD}|maps\\.google\\.${GOOGLE_TLD}|maps\\.app\\.goo\\.gl|goo\\.gl|g\\.co)$`, 'i');

// True for links Google Maps can open: google.<tld>/maps, maps.google.<tld>, maps.app.goo.gl, goo.gl/maps, g.co/kgs
export function isGoogleMapsUrl(raw) {
  let u;
  try { u = new URL(String(raw || '').trim()); } catch { return false; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
  if (!MAPS_HOST.test(u.hostname)) return false;
  const h = u.hostname.toLowerCase();
  if (h === 'maps.app.goo.gl' || h.startsWith('maps.google.')) return true;
  if (h === 'goo.gl') return u.pathname.startsWith('/maps');
  if (h === 'g.co') return u.pathname.startsWith('/kgs');
  return u.pathname.startsWith('/maps');
}

const valid = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
  && !(lat === 0 && lng === 0);

/** {lat, lng} from a full Google Maps link, or null (e.g. short links). */
export function coordsFromMapsUrl(raw) {
  const s = decodeURIComponent(String(raw || ''));
  const num = '(-?\\d{1,3}\\.\\d+)';
  const patterns = [
    new RegExp(`!3d${num}!4d${num}`),                                    // place pin (most precise)
    new RegExp(`[?&](?:q|query|ll|destination|center)=${num},\\s*${num}`), // ?q=lat,lng
    new RegExp(`/@${num},${num}`),                                        // map view centre
    new RegExp(`/(?:place|search|dir)/${num},\\s*${num}`),
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (m) {
      const lat = Number(m[1]), lng = Number(m[2]);
      if (valid(lat, lng)) return { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 };
    }
  }
  return null;
}

/** Link that opens Google Maps with directions to the facility, or null if it has no location. */
export function directionsUrl(f) {
  if (!f) return null;
  const lat = f.location_lat != null ? Number(f.location_lat) : null;
  const lng = f.location_lng != null ? Number(f.location_lng) : null;
  if (valid(lat, lng)) return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  return f.location_url || null;
}

/** Link that shows the facility on the map (pin), or null. */
export function mapUrl(f) {
  if (!f) return null;
  if (f.location_url) return f.location_url;
  const lat = Number(f.location_lat), lng = Number(f.location_lng);
  return valid(lat, lng) ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}` : null;
}

export const hasLocation = (f) => !!(f && (f.location_url || (f.location_lat != null && f.location_lng != null)));

/** Validation for forms: '' when OK, otherwise the i18n key of the problem. */
export function locationProblem(v) {
  const url = (v?.location_url || '').trim();
  if (url && !isGoogleMapsUrl(url)) return 'location.err_invalid';
  const hasCoords = v?.location_lat != null && v?.location_lat !== '' && v?.location_lng != null && v?.location_lng !== '';
  if (!url && !hasCoords) return 'location.err_required';
  return '';
}

/** Payload for the database (trimmed link, numbers or nulls). */
export function locationPayload(v) {
  const url = (v?.location_url || '').trim();
  const has = v?.location_lat != null && v?.location_lat !== '' && v?.location_lng != null && v?.location_lng !== '';
  return {
    location_url: url || null,
    location_lat: has ? Number(v.location_lat) : null,
    location_lng: has ? Number(v.location_lng) : null,
  };
}
