import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button } from '../../src/components/ui/Button.js';

describe('Button', () => {
  it('renders children', () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('applies prototype button classes for the danger variant', () => {
    render(<Button variant="danger">Delete</Button>);
    expect(screen.getByRole('button').className).toContain('aww-btn');
    expect(screen.getByRole('button').className).toContain('aww-btn-danger');
  });

  it('is disabled when disabled prop set', () => {
    render(<Button disabled>Action</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });
});
