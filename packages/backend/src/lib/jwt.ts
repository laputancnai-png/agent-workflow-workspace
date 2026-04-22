import { createSigner, createVerifier } from 'fast-jwt';

export interface AccessPayload {
  sub: string;
  workspaceIds?: string[];
}

export interface RefreshPayload {
  sub: string;
}

function requireEnv(name: 'JWT_SECRET' | 'REFRESH_SECRET') {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

export function signAccess(payload: AccessPayload) {
  const accessSigner = createSigner({ key: requireEnv('JWT_SECRET'), expiresIn: '15m' });

  return accessSigner(payload);
}

export function signRefresh(payload: RefreshPayload) {
  const refreshSigner = createSigner({ key: requireEnv('REFRESH_SECRET'), expiresIn: '7d' });

  return refreshSigner(payload);
}

export function verifyAccess(token: string): AccessPayload {
  const accessVerifier = createVerifier({ key: requireEnv('JWT_SECRET') });

  return accessVerifier(token) as AccessPayload;
}

export function verifyRefresh(token: string): RefreshPayload {
  const refreshVerifier = createVerifier({ key: requireEnv('REFRESH_SECRET') });

  return refreshVerifier(token) as RefreshPayload;
}
