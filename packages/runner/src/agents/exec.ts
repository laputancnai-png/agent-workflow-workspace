import { exec, execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

export interface ExecResult {
  stdout: string;
  stderr: string;
  success: boolean;
}

export async function runCommand(command: string, cwd: string, timeoutMs = 5 * 60_000): Promise<ExecResult> {
  try {
    const { stdout, stderr } = await execAsync(command, { cwd, timeout: timeoutMs });
    return { stdout, stderr, success: true };
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string };
    return { stdout: err.stdout ?? '', stderr: err.stderr ?? '', success: false };
  }
}

export async function runSafe(bin: string, args: string[], cwd: string, timeoutMs = 5 * 60_000): Promise<ExecResult> {
  try {
    const { stdout, stderr } = await execFileAsync(bin, args, { cwd, timeout: timeoutMs });
    return { stdout, stderr, success: true };
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string };
    return { stdout: err.stdout ?? '', stderr: err.stderr ?? '', success: false };
  }
}
