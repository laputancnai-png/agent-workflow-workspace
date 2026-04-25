import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it, vi } from 'vitest';
import { FTUEWizard } from '../../src/features/onboarding/FTUEWizard.js';
import i18n from '../../src/i18n/index.js';

function renderWithI18n(ui: ReactElement) {
  return render(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>);
}

describe('FTUEWizard', () => {
  it('shows step 1 initially', async () => {
    await i18n.changeLanguage('en');
    renderWithI18n(<FTUEWizard onComplete={vi.fn()} />);
    expect(screen.getByPlaceholderText(/workspace name/i)).toBeInTheDocument();
  });

  it('disables Next when workspace name empty on step 1', async () => {
    await i18n.changeLanguage('en');
    renderWithI18n(<FTUEWizard onComplete={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('enables Next after typing workspace name', async () => {
    await i18n.changeLanguage('en');
    renderWithI18n(<FTUEWizard onComplete={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/workspace name/i), { target: { value: 'My Project' } });
    expect(screen.getByRole('button', { name: 'Next' })).not.toBeDisabled();
  });

  it('calls onComplete on final step submit', async () => {
    await i18n.changeLanguage('en');
    const onComplete = vi.fn();
    renderWithI18n(<FTUEWizard onComplete={onComplete} />);

    fireEvent.change(screen.getByPlaceholderText(/workspace name/i), { target: { value: 'My Project' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Some PRD content' } });
    fireEvent.click(screen.getByRole('button', { name: /create workspace/i }));

    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ name: 'My Project' }));
  });
});
