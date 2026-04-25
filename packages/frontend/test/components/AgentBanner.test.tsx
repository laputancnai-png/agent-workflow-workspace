import { act, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgentBanner } from '../../src/features/workflow-run/AgentBanner.js';
import i18n from '../../src/i18n/index.js';

afterEach(() => {
  vi.useRealTimers();
});

function wrap(ui: ReactElement) {
  return render(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>);
}

describe('AgentBanner', () => {
  it('shows agent role label', async () => {
    await i18n.changeLanguage('en');
    wrap(<AgentBanner agentRole="planner" startedAt={new Date()} />);
    expect(screen.getByText(/Planner Agent/i)).toBeInTheDocument();
  });

  it('shows warning badge after 90s', async () => {
    vi.useFakeTimers();
    await i18n.changeLanguage('en');
    wrap(<AgentBanner agentRole="coder" startedAt={new Date()} />);
    act(() => {
      vi.advanceTimersByTime(91_000);
    });
    expect(screen.getByText(/May not respond/i)).toBeInTheDocument();
  });

  it('does not show warning badge before 90s', async () => {
    vi.useFakeTimers();
    await i18n.changeLanguage('en');
    wrap(<AgentBanner agentRole="coder" startedAt={new Date()} />);
    act(() => {
      vi.advanceTimersByTime(80_000);
    });
    expect(screen.queryByText(/May not respond/i)).toBeNull();
  });
});
