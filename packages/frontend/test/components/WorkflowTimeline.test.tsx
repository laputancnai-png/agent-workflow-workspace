import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it, vi } from 'vitest';
import { WorkflowTimeline } from '../../src/features/workflow-run/WorkflowTimeline.js';
import i18n from '../../src/i18n/index.js';
import type { WorkflowStep } from '../../src/hooks/useRun.js';

const steps: WorkflowStep[] = [
  {
    id: 's_1',
    position: 1,
    name: 'Draft PRD',
    status: 'completed',
    owner_type: 'human',
    output_artifact_ids: [],
    updated_at: new Date().toISOString(),
  },
  {
    id: 's_2',
    position: 2,
    name: 'Approve Plan',
    status: 'running',
    owner_type: 'approval_gate',
    output_artifact_ids: [],
    updated_at: new Date().toISOString(),
  }
];

function wrap(ui: ReactElement) {
  return render(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>);
}

describe('WorkflowTimeline', () => {
  it('renders steps and calls onSelectStep', async () => {
    await i18n.changeLanguage('en');
    const onSelectStep = vi.fn();
    wrap(<WorkflowTimeline steps={steps} selectedStepId="s_1" onSelectStep={onSelectStep} />);

    fireEvent.click(screen.getByRole('button', { name: /approve plan/i }));
    expect(onSelectStep).toHaveBeenCalledWith('s_2');
  });

  it('uses prototype workflow step structure', async () => {
    await i18n.changeLanguage('en');
    wrap(<WorkflowTimeline steps={steps} selectedStepId="s_2" onSelectStep={vi.fn()} />);

    const activeStep = screen.getByRole('button', { name: /approve plan/i });
    expect(activeStep.className).toContain('workflow-step');
    expect(activeStep.className).toContain('is-selected');
    expect(activeStep.querySelector('.step-position')?.textContent).toBe('02');
    expect(activeStep.querySelector('.step-dot')).toBeInTheDocument();
  });
});
