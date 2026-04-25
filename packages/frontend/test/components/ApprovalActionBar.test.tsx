import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it, vi } from 'vitest';
import { ApprovalActionBar } from '../../src/features/approval/ApprovalActionBar.js';
import i18n from '../../src/i18n/index.js';

function wrap(ui: ReactElement) {
  return render(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>);
}

describe('ApprovalActionBar', () => {
  it('renders all 5 action buttons', async () => {
    await i18n.changeLanguage('en');
    wrap(<ApprovalActionBar stepId="s_1" onDecision={vi.fn()} />);

    expect(screen.getByText('Approve')).toBeInTheDocument();
    expect(screen.getByText('Reject')).toBeInTheDocument();
    expect(screen.getByText('Request Changes')).toBeInTheDocument();
    expect(screen.getByText('Edit Output')).toBeInTheDocument();
    expect(screen.getByText('Take Over')).toBeInTheDocument();
  });

  it('calls onDecision with approve action', async () => {
    await i18n.changeLanguage('en');
    const onDecision = vi.fn();
    wrap(<ApprovalActionBar stepId="s_1" onDecision={onDecision} />);

    fireEvent.click(screen.getByText('Approve'));
    expect(onDecision).toHaveBeenCalledWith({ action: 'approve' });
  });
});
