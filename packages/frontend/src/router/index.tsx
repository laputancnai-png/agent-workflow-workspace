import { createBrowserRouter } from 'react-router-dom';

function ScaffoldPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--bg)] p-6 text-[var(--ink)]">
      <section className="w-full max-w-3xl">
        <p className="mb-3 text-sm font-medium uppercase tracking-[0.2em] text-[var(--teal)]">AWW</p>
        <h1 className="text-3xl font-semibold">Agent Workflow Workspace</h1>
        <p className="mt-4 max-w-xl text-sm leading-6 text-[var(--muted)]">
          Frontend shell is ready for the workflow UI, i18n, REST API, and SSE integration.
        </p>
      </section>
    </main>
  );
}

export const router = createBrowserRouter([
  {
    path: '*',
    element: <ScaffoldPage />
  }
]);
