import { describe, expect, it } from 'vitest';

import { buildCliProgram } from '../src/cli.js';

describe('runner CLI', () => {
  it('registers runner commands', () => {
    const program = buildCliProgram();
    const commandNames = program.commands.map((command) => command.name());

    expect(commandNames).toContain('runner:register');
    expect(commandNames).toContain('runner:start');
  });
});
