import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from '../src/App.js';

describe('App scaffold', () => {
  it('renders the public login route when unauthenticated', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /agent workflow workspace/i })).toBeInTheDocument();
  });
});
