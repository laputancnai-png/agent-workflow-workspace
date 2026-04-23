import { useTranslation } from 'react-i18next';

export function LoginPage() {
  const { t } = useTranslation('common');

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--bg)] p-6 text-[var(--ink)]">
      <section className="w-full max-w-sm">
        <p className="mb-3 text-sm font-medium uppercase text-[var(--teal)]">AWW</p>
        <h1 className="text-3xl font-semibold">{t('app_title')}</h1>
        <p className="mt-4 text-sm leading-6 text-[var(--muted)]">{t('loading')}</p>
      </section>
    </main>
  );
}
