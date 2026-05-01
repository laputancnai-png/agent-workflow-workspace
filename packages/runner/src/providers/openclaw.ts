import { createPrivateKey, createPublicKey, randomUUID, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { WebSocket } from 'ws';

import type { CompletionRequest, CompletionResponse, LLMProvider } from './types.js';

interface GatewayMessage {
  kind: 'req' | 'res' | 'event';
  id?: string;
  method?: string;
  params?: Record<string, unknown>;
  result?: Record<string, unknown> | null;
  error?: { code?: string; message?: string };
}

interface OpenClawV3Message {
  type?: 'req' | 'res' | 'event';
  id?: string;
  event?: string;
  payload?: Record<string, unknown>;
  ok?: boolean;
  error?: { code?: string; message?: string };
}

interface OpenClawDeviceIdentity {
  deviceId: string;
  publicKeyPem: string;
  privateKeyPem: string;
}

interface OpenClawDeviceAuth {
  tokens?: {
    operator?: {
      token?: string;
      scopes?: string[];
    };
  };
}

const OPENCLAW_ERROR_LABELS: Record<string, string> = {
  rate_limit: 'Rate limit exceeded',
  auth_failed: 'Authentication failed - check api_key in config',
  invalid_model: 'Model not supported by this Gateway',
  context_length: 'Context length exceeded max_tokens',
};

function mapStopReason(value: unknown): CompletionResponse['stop_reason'] {
  return value === 'tool_use' || value === 'max_tokens' ? value : 'end_turn';
}

function asTextContent(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string') {
          return item;
        }

        if (item && typeof item === 'object' && 'text' in item) {
          return String((item as { text?: unknown }).text ?? '');
        }

        return '';
      })
      .join('');
  }

  return '';
}

function renderPrompt(req: CompletionRequest) {
  const system = req.system ? `System:\n${req.system}\n\n` : '';
  const messages = req.messages
    .map((message) => `${message.role.toUpperCase()}:\n${message.content}`)
    .join('\n\n');

  return `${system}${messages}`;
}

function readJson<T>(path: string): T | undefined {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch {
    return undefined;
  }
}

function base64Url(buffer: Buffer) {
  return buffer.toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}

function rawPublicKey(publicKeyPem: string) {
  const der = createPublicKey(publicKeyPem).export({ type: 'spki', format: 'der' });
  const prefix = Buffer.from('302a300506032b6570032100', 'hex');

  if (der.length === prefix.length + 32 && der.subarray(0, prefix.length).equals(prefix)) {
    return der.subarray(prefix.length);
  }

  return der;
}

export class OpenClawAdapter implements LLMProvider {
  readonly id = 'openclaw';

  constructor(private readonly cfg: { gateway_url?: string; api_key?: string; agent_id?: string }) {}

  private get gatewayUrl() {
    return this.cfg.gateway_url ?? 'ws://localhost:18789';
  }

  async isAvailable() {
    return new Promise<boolean>((resolve) => {
      const ws = new WebSocket(this.gatewayUrl);
      const timer = setTimeout(() => {
        ws.terminate();
        resolve(false);
      }, 2_000);

      ws.on('open', () => {
        clearTimeout(timer);
        ws.close();
        resolve(true);
      });
      ws.on('error', () => {
        clearTimeout(timer);
        resolve(false);
      });
    });
  }

  async complete(req: CompletionRequest): Promise<CompletionResponse> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.gatewayUrl);
      let settled = false;

      const timeout = setTimeout(() => {
        ws.terminate();
        reject(new Error('OpenClaw Gateway timeout after 120s'));
      }, 120_000);

      const settle = (fn: () => void) => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timeout);
        ws.close();
        fn();
      };

      ws.on('message', (data) => {
        const raw = JSON.parse(data.toString()) as GatewayMessage | OpenClawV3Message;

        if ('type' in raw || 'event' in raw || 'ok' in raw) {
          this.handleV3Message(raw as OpenClawV3Message, ws, req, resolve, reject, settle);
          return;
        }

        this.handleLegacyMessage(raw as GatewayMessage, ws, req, resolve, reject, settle);
      });

      ws.on('error', (error) => {
        settle(() => reject(error));
      });

      ws.on('close', () => {
        if (!settled) {
          settle(() => reject(new Error('OpenClaw Gateway disconnected')));
        }
      });
    });
  }

  private handleLegacyMessage(
    message: GatewayMessage,
    ws: WebSocket,
    req: CompletionRequest,
    resolve: (value: CompletionResponse) => void,
    reject: (reason?: unknown) => void,
    settle: (fn: () => void) => void,
  ) {
    const state = this.getLegacyState(ws);

    if (message.kind === 'event' && message.method === 'connect.challenge') {
      const params: Record<string, unknown> = { client: 'aww-runner', protocol: '1.0' };

      if (this.cfg.api_key) {
        params.api_key = this.cfg.api_key;
      }

      ws.send(JSON.stringify({ kind: 'req', id: state.connectId, method: 'connect', params }));
      return;
    }

    if (message.kind === 'res' && message.id === state.connectId) {
      if (message.error) {
        settle(() => reject(new Error(message.error?.message ?? 'OpenClaw connect failed')));
        return;
      }

      state.connected = true;
      ws.send(
        JSON.stringify({
          kind: 'req',
          id: state.completionId,
          method: 'llm.complete',
          params: {
            model: req.model,
            messages: req.messages,
            system: req.system,
            max_tokens: req.max_tokens,
            tools: req.tools,
          },
        }),
      );
      return;
    }

    if (message.kind === 'event' && message.method === 'llm.stream' && state.connected) {
      state.streamedContent += String(message.params?.chunk ?? '');
      return;
    }

    if (message.kind === 'res' && message.id === state.completionId && state.connected) {
      if (message.error) {
        const code = message.error.code ?? '';
        settle(() => reject(new Error(OPENCLAW_ERROR_LABELS[code] ?? message.error?.message ?? 'unknown error')));
        return;
      }

      settle(() =>
        resolve({
          content: state.streamedContent || String(message.result?.content ?? ''),
          stop_reason: mapStopReason(message.result?.stop_reason),
        }),
      );
    }
  }

  private handleV3Message(
    message: OpenClawV3Message,
    ws: WebSocket,
    req: CompletionRequest,
    resolve: (value: CompletionResponse) => void,
    reject: (reason?: unknown) => void,
    settle: (fn: () => void) => void,
  ) {
    const state = this.getV3State(ws);

    if (message.type === 'event' && message.event === 'connect.challenge') {
      ws.send(
        JSON.stringify({
          type: 'req',
          id: state.connectId,
          method: 'connect',
          params: this.buildV3ConnectParams(String(message.payload?.nonce ?? '')),
        }),
      );
      return;
    }

    if (message.type === 'res' && message.id === state.connectId) {
      if (!message.ok) {
        settle(() => reject(new Error(message.error?.message ?? 'OpenClaw connect failed')));
        return;
      }

      ws.send(
        JSON.stringify({
          type: 'req',
          id: state.createSessionId,
          method: 'sessions.create',
          params: { agentId: this.cfg.agent_id ?? 'main' },
        }),
      );
      return;
    }

    if (message.type === 'res' && message.id === state.createSessionId) {
      if (!message.ok) {
        settle(() => reject(new Error(message.error?.message ?? 'OpenClaw session create failed')));
        return;
      }

      state.sessionKey = String(message.payload?.key ?? '');

      if (!state.sessionKey) {
        settle(() => reject(new Error('OpenClaw session create did not return a session key')));
        return;
      }

      ws.send(
        JSON.stringify({
          type: 'req',
          id: state.subscribeId,
          method: 'sessions.messages.subscribe',
          params: { key: state.sessionKey },
        }),
      );
      return;
    }

    if (message.type === 'res' && message.id === state.subscribeId) {
      if (!message.ok) {
        settle(() => reject(new Error(message.error?.message ?? 'OpenClaw session subscribe failed')));
        return;
      }

      ws.send(
        JSON.stringify({
          type: 'req',
          id: state.sendId,
          method: 'sessions.send',
          params: { key: state.sessionKey, message: renderPrompt(req) },
        }),
      );
      return;
    }

    if (message.type === 'res' && message.id === state.sendId && !message.ok) {
      settle(() => reject(new Error(message.error?.message ?? 'OpenClaw session send failed')));
      return;
    }

    const chatMessage =
      message.event === 'chat' && message.payload?.state === 'final'
        ? (message.payload.message as Record<string, unknown> | undefined)
        : undefined;
    const sessionMessage =
      message.event === 'session.message'
        ? ((message.payload?.message as Record<string, unknown> | undefined) ?? undefined)
        : undefined;
    const finalMessage = chatMessage ?? sessionMessage;

    if (finalMessage?.role === 'assistant') {
      const content = asTextContent(finalMessage.content);

      if (content.length > 0) {
        settle(() =>
          resolve({
            content,
            stop_reason: mapStopReason(finalMessage.stopReason),
            tokens_used: (finalMessage.usage as { totalTokens?: number } | undefined)?.totalTokens,
          }),
        );
      }
    }
  }

  private buildV3ConnectParams(nonce: string) {
    const token = this.cfg.api_key ?? this.localOpenClawToken();
    const scopes = this.localOpenClawScopes();
    const params: Record<string, unknown> = {
      minProtocol: 3,
      maxProtocol: 3,
      client: { id: 'cli', version: '2026.3.12', platform: process.platform, mode: 'cli' },
      caps: [],
      commands: [],
      permissions: {},
      auth: { token: token ?? '' },
      role: 'operator',
      scopes,
    };
    const device = this.localOpenClawDevice();

    if (device && token) {
      const signedAt = Date.now();
      const payload = [
        'v3',
        device.deviceId,
        'cli',
        'cli',
        'operator',
        scopes.join(','),
        String(signedAt),
        token,
        nonce,
        process.platform.toLowerCase(),
        '',
      ].join('|');

      params.device = {
        id: device.deviceId,
        publicKey: base64Url(rawPublicKey(device.publicKeyPem)),
        signature: base64Url(sign(null, Buffer.from(payload, 'utf8'), createPrivateKey(device.privateKeyPem))),
        signedAt,
        nonce,
      };
    }

    return params;
  }

  private localOpenClawToken() {
    const cfg = readJson<{ gateway?: { auth?: { token?: string } } }>(join(homedir(), '.openclaw', 'openclaw.json'));
    const auth = readJson<OpenClawDeviceAuth>(join(homedir(), '.openclaw', 'identity', 'device-auth.json'));

    return auth?.tokens?.operator?.token ?? cfg?.gateway?.auth?.token;
  }

  private localOpenClawScopes() {
    const auth = readJson<OpenClawDeviceAuth>(join(homedir(), '.openclaw', 'identity', 'device-auth.json'));

    return auth?.tokens?.operator?.scopes ?? ['operator.admin', 'operator.read', 'operator.write', 'operator.approvals', 'operator.pairing'];
  }

  private localOpenClawDevice() {
    return readJson<OpenClawDeviceIdentity>(join(homedir(), '.openclaw', 'identity', 'device.json'));
  }

  private getLegacyState(ws: WebSocket) {
    const socket = ws as WebSocket & {
      __awwLegacyState?: { connectId: string; completionId: string; connected: boolean; streamedContent: string };
    };

    socket.__awwLegacyState ??= {
      connectId: randomUUID(),
      completionId: randomUUID(),
      connected: false,
      streamedContent: '',
    };

    return socket.__awwLegacyState;
  }

  private getV3State(ws: WebSocket) {
    const socket = ws as WebSocket & {
      __awwV3State?: {
        connectId: string;
        createSessionId: string;
        subscribeId: string;
        sendId: string;
        sessionKey: string;
      };
    };

    socket.__awwV3State ??= {
      connectId: randomUUID(),
      createSessionId: randomUUID(),
      subscribeId: randomUUID(),
      sendId: randomUUID(),
      sessionKey: '',
    };

    return socket.__awwV3State;
  }

}
