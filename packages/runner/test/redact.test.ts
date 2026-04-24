import { describe, expect, it } from 'vitest';
import { redactSecrets } from '../src/redact.js';

describe('redactSecrets', () => {
  it('redacts Anthropic API keys', () => {
    const text = 'Authorization: Bearer sk-ant-api03-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
    expect(redactSecrets(text)).toContain('[REDACTED]');
    expect(redactSecrets(text)).not.toContain('sk-ant');
  });

  it('redacts OpenAI API keys', () => {
    const text = 'key = sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
    expect(redactSecrets(text)).toContain('[REDACTED]');
    expect(redactSecrets(text)).not.toContain('sk-proj');
  });

  it('redacts generic sk- prefixed keys', () => {
    const text = 'OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwx1234567890123456';
    expect(redactSecrets(text)).toContain('[REDACTED]');
  });

  it('redacts URL credentials', () => {
    const text = 'postgres://user:supersecretpassword123456@localhost:5432/db';
    expect(redactSecrets(text)).toContain('[REDACTED]');
    expect(redactSecrets(text)).not.toContain('supersecretpassword123456');
  });

  it('redacts Bearer tokens', () => {
    const text = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
    expect(redactSecrets(text)).toContain('[REDACTED]');
    expect(redactSecrets(text)).not.toContain('eyJhbGci');
  });

  it('does not alter text without secrets', () => {
    const text = 'pnpm test -- --reporter=verbose\n✓ all tests passed';
    expect(redactSecrets(text)).toBe(text);
  });

  it('handles empty string', () => {
    expect(redactSecrets('')).toBe('');
  });

  it('redacts multiple secrets in one string', () => {
    const text = 'sk-key1111111111111111111111111111 and sk-key2222222222222222222222222222';
    const result = redactSecrets(text);
    expect(result.match(/\[REDACTED\]/g)?.length).toBe(2);
  });
});
