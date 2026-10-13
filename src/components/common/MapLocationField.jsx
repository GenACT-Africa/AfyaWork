import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MapPin, LocateFixed, ExternalLink } from 'lucide-react';
import { isGoogleMapsUrl, coordsFromMapsUrl, mapUrl } from '../../lib/maps';

/**
 * Facility location: a Google Maps link and/or the GPS position of the device.
 * value = { location_url, location_lat, location_lng }; onChange gets the next value.
 */
export function MapLocationField({ value, onChange, required = false, error }) {
  const { t } = useTranslation();
  const [gps, setGps] = useState({ busy: false, msg: '', bad: false });
  const url = value?.location_url || '';
  const lat = value?.location_lat;
  const lng = value?.location_lng;
  const hasCoords = lat != null && lat !== '' && lng != null && lng !== '';
  const badLink = url.trim() !== '' && !isGoogleMapsUrl(url);
  const preview = mapUrl({ location_url: badLink ? null : url.trim() || null, location_lat: hasCoords ? lat : null, location_lng: hasCoords ? lng : null });

  function setUrl(next) {
    const c = isGoogleMapsUrl(next) ? coordsFromMapsUrl(next) : null;
    if (hasCoords && gps.msg && !gps.bad) setGps({ busy: false, msg: t('location.gps_replaced'), bad: false });
    // coordinates always follow the link, so an old pin can't point somewhere else
    onChange({ location_url: next, location_lat: c ? c.lat : null, location_lng: c ? c.lng : null });
  }

  function useGps() {
    if (!navigator.geolocation) { setGps({ busy: false, msg: t('location.gps_unavailable'), bad: true }); return; }
    setGps({ busy: true, msg: '', bad: false });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const la = Math.round(pos.coords.latitude * 1e6) / 1e6;
        const ln = Math.round(pos.coords.longitude * 1e6) / 1e6;
        onChange({ location_url: badLink ? '' : url, location_lat: la, location_lng: ln });
        setGps({ busy: false, bad: false,
          msg: t('location.gps_saved', { lat: la.toFixed(5), lng: ln.toFixed(5), acc: Math.round(pos.coords.accuracy) }) });
      },
      (err) => setGps({ busy: false, bad: true, msg: t(err.code === 1 ? 'location.gps_denied' : 'location.gps_unavailable') }),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-gray-700">{t('location.label')}{required && <span className="text-red-500"> *</span>}</label>
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="url"
            inputMode="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={t('location.placeholder')}
            className={`w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent ${badLink || error ? 'border-red-300' : 'border-gray-300'}`}
          />
        </div>
        <button
          type="button"
          onClick={useGps}
          disabled={gps.busy}
          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-teal-200 bg-teal-50 text-teal-700 text-sm font-medium hover:bg-teal-100 disabled:opacity-60 whitespace-nowrap"
        >
          <LocateFixed className="w-4 h-4" /> {gps.busy ? t('location.locating') : t('location.use_gps')}
        </button>
      </div>
      {badLink ? (
        <p className="text-xs text-red-600">{t('location.err_invalid')}</p>
      ) : error ? (
        <p className="text-xs text-red-600">{error}</p>
      ) : gps.msg ? (
        <p className={`text-xs ${gps.bad ? 'text-amber-700' : 'text-green-700'}`}>{gps.msg}</p>
      ) : hasCoords && !gps.msg ? (
        <p className="text-xs text-green-700">{t('location.coords_saved', { lat: Number(lat).toFixed(5), lng: Number(lng).toFixed(5) })}</p>
      ) : (
        <p className="text-xs text-gray-400">{t('location.help')}</p>
      )}
      {preview && !badLink && (
        <a href={preview} target="_blank" rel="noreferrer" className="text-xs text-teal-700 hover:underline inline-flex items-center gap-1 w-fit">
          {t('location.view_map')} <ExternalLink className="w-3 h-3" />
        </a>
      )}
    </div>
  );
}

