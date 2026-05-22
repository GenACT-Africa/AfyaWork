import { useTranslation } from 'react-i18next';

export function LanguageToggle({ variant = 'default' }) {
  const { i18n } = useTranslation();
  const lang = i18n.language;

  function setLang(l) {
    i18n.changeLanguage(l);
    localStorage.setItem('afyawork_lang', l);
  }

  if (variant === 'pill') {
    return (
      <div className="inline-flex items-center rounded-full border border-white/30 overflow-hidden text-xs font-semibold">
        <button
          onClick={() => setLang('en')}
          className={`px-3 py-1.5 transition-colors ${lang === 'en' ? 'bg-white text-teal-700' : 'text-white/80 hover:text-white hover:bg-white/10'}`}
        >
          EN
        </button>
        <button
          onClick={() => setLang('sw')}
          className={`px-3 py-1.5 transition-colors ${lang === 'sw' ? 'bg-white text-teal-700' : 'text-white/80 hover:text-white hover:bg-white/10'}`}
        >
          SW
        </button>
      </div>
    );
  }

  return (
    <div className="inline-flex items-center rounded-lg border border-gray-200 overflow-hidden text-xs font-semibold">
      <button
        onClick={() => setLang('en')}
        className={`px-2.5 py-1.5 transition-colors ${lang === 'en' ? 'bg-teal-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
      >
        EN
      </button>
      <button
        onClick={() => setLang('sw')}
        className={`px-2.5 py-1.5 transition-colors ${lang === 'sw' ? 'bg-teal-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
      >
        SW
      </button>
    </div>
  );
}
