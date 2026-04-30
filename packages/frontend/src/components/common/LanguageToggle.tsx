import { useTranslation } from 'react-i18next';

export function LanguageToggle() {
  const { i18n } = useTranslation();
  const isZh = i18n.language === 'zh-CN';

  const toggle = () => {
    const next = isZh ? 'en' : 'zh-CN';
    i18n.changeLanguage(next);
    localStorage.setItem('aww-lang', next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className="rounded border border-[var(--line)] px-2 py-1 text-xs font-medium text-[var(--muted)] transition-colors hover:border-[var(--line-strong)] hover:text-[var(--ink)]"
      title={isZh ? 'Switch to English' : '切换为中文'}
    >
      {isZh ? 'EN' : '中'}
    </button>
  );
}
