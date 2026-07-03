/**
 * Language switcher for the dashboard.
 * Toggles between English and Vietnamese using i18next.
 */
import { useTranslation } from 'react-i18next';

export function LanguageSwitcher() {
  const { i18n } = useTranslation();

  const toggleLanguage = () => {
    const next = i18n.language === 'vi' ? 'en' : 'vi';
    i18n.changeLanguage(next);
  };

  return (
    <button
      onClick={toggleLanguage}
      className="p-2 text-muted hover:text-white rounded-lg hover:bg-bg-border transition-colors min-h-touch min-w-touch flex items-center justify-center text-xs font-semibold tracking-wide"
      aria-label={i18n.language === 'vi' ? 'Switch to English' : 'Chuyển sang tiếng Việt'}
    >
      {i18n.language === 'vi' ? 'EN' : 'VI'}
    </button>
  );
}
