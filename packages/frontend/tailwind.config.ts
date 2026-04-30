import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        blue: 'var(--blue)',
        teal: 'var(--teal)',
        green: 'var(--green)',
        amber: 'var(--amber)',
        red: 'var(--red)',
        violet: 'var(--violet)'
      }
    }
  }
} satisfies Config;
