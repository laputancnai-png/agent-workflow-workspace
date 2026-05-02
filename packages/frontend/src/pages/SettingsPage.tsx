import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useWorkspace, useUpdateWorkspace } from '../hooks/useWorkspace.js';
import { Button } from '../components/ui/Button.js';
import { getApiClient } from '../lib/api-client.js';

const PROVIDER_OPTIONS = [
  { value: 'openclaw', label: 'Openclaw (本地)' },
  { value: 'anthropic', label: 'Anthropic Claude' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'hermes', label: 'Hermes (本地)' },
] as const;

const MODEL_SUGGESTIONS: Record<string, string[]> = {
  openclaw: [
    'nvidia/qwen/qwen3-next-80b-a3b-instruct',
    'nvidia/qwen/qwen3-coder-480b-a35b-instruct',
    'nvidia/meta/llama-3.3-70b-instruct',
  ],
  anthropic: [
    'claude-haiku-4-5-20251001',
    'claude-sonnet-4-6',
    'claude-opus-4-7',
  ],
  openai: [
    'gpt-4o',
    'gpt-4o-mini',
    'gpt-4-turbo',
  ],
  hermes: [
    'hermes-default',
  ],
};

interface FormState {
  name: string;
  githubRepoUrl: string;
  defaultBranch: string;
  preferredProvider: string;
  preferredModel: string;
}

interface TestResult {
  ok: boolean;
  response?: string;
  error?: string;
  provider?: string;
}

export function SettingsPage() {
  const { workspaceSlug = '' } = useParams<{ workspaceSlug: string }>();
  const { data: workspace, isLoading, isError } = useWorkspace(workspaceSlug);
  const updateWorkspace = useUpdateWorkspace(workspaceSlug);

  const [form, setForm] = useState<FormState>({
    name: '',
    githubRepoUrl: '',
    defaultBranch: 'main',
    preferredProvider: 'openclaw',
    preferredModel: 'nvidia/qwen/qwen3-next-80b-a3b-instruct',
  });
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [testState, setTestState] = useState<'idle' | 'loading'>('idle');
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  useEffect(() => {
    if (!workspace) return;
    setForm({
      name: workspace.name,
      githubRepoUrl: workspace.githubRepoUrl ?? '',
      defaultBranch: workspace.defaultBranch ?? 'main',
      preferredProvider: workspace.preferredProvider ?? 'openclaw',
      preferredModel: workspace.preferredModel ?? 'nvidia/qwen/qwen3-next-80b-a3b-instruct',
    });
    setDirty(false);
    setTestResult(null);
  }, [workspace]);

  function handleChange(key: keyof FormState, value: string) {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'preferredProvider') {
        const suggestions = MODEL_SUGGESTIONS[value];
        if (suggestions && !suggestions.includes(prev.preferredModel)) {
          next.preferredModel = suggestions[0] ?? '';
        }
        setTestResult(null);
      }
      return next;
    });
    setDirty(true);
    setSaved(false);
  }

  async function handleSave() {
    if (!workspace) return;
    await updateWorkspace.mutateAsync({
      name: form.name || undefined,
      githubRepoUrl: form.githubRepoUrl.trim() || null,
      defaultBranch: form.defaultBranch || undefined,
      preferredProvider: form.preferredProvider || undefined,
      preferredModel: form.preferredModel || undefined,
    });
    setSaved(true);
    setDirty(false);
  }

  async function handleTest() {
    if (!workspace) return;
    setTestState('loading');
    setTestResult(null);
    try {
      const result = await getApiClient().post<TestResult>(
        `/api/v1/workspaces/${workspaceSlug}/test-provider`,
      );
      setTestResult(result);
    } catch (err) {
      setTestResult({ ok: false, error: err instanceof Error ? err.message : '请求失败' });
    } finally {
      setTestState('idle');
    }
  }

  if (isLoading) {
    return (
      <section className="h-full overflow-auto p-6">
        <p className="text-sm text-[var(--muted)]">加载中...</p>
      </section>
    );
  }

  if (isError || !workspace) {
    return (
      <section className="h-full overflow-auto p-6">
        <p className="text-sm text-[var(--red)]">无法加载 Workspace 设置</p>
      </section>
    );
  }

  const modelSuggestions = MODEL_SUGGESTIONS[form.preferredProvider] ?? [];

  return (
    <section className="h-full overflow-auto p-6">
      <h1 className="mb-6 text-[17px] font-extrabold text-[var(--ink)]">设置</h1>

      <div className="flex max-w-lg flex-col gap-5">
        {/* 只读信息 */}
        <div className="glass-panel p-4">
          <div className="mb-0.5 text-[9.5px] font-extrabold uppercase tracking-[0.08em] text-[var(--subtle)]">Slug</div>
          <div className="font-mono text-[13px] text-[var(--ink)]">{workspace.slug}</div>
        </div>

        <FieldGroup label="工作区名称">
          <input
            type="text"
            value={form.name}
            onChange={(e) => handleChange('name', e.target.value)}
            className="settings-input"
          />
        </FieldGroup>

        <FieldGroup label="GitHub 仓库 URL">
          <input
            type="text"
            value={form.githubRepoUrl}
            onChange={(e) => handleChange('githubRepoUrl', e.target.value)}
            placeholder="https://github.com/owner/repo"
            className="settings-input"
          />
        </FieldGroup>

        <FieldGroup label="默认分支">
          <input
            type="text"
            value={form.defaultBranch}
            onChange={(e) => handleChange('defaultBranch', e.target.value)}
            placeholder="main"
            className="settings-input"
          />
        </FieldGroup>

        <FieldGroup label="AI Provider">
          <select
            value={form.preferredProvider}
            onChange={(e) => handleChange('preferredProvider', e.target.value)}
            className="settings-input"
          >
            {PROVIDER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </FieldGroup>

        <FieldGroup label="AI 模型">
          <input
            type="text"
            list="model-suggestions"
            value={form.preferredModel}
            onChange={(e) => handleChange('preferredModel', e.target.value)}
            placeholder="输入或选择模型名称"
            className="settings-input"
          />
          <datalist id="model-suggestions">
            {modelSuggestions.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
          {modelSuggestions.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {modelSuggestions.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => handleChange('preferredModel', m)}
                  className={`rounded px-2 py-0.5 text-[11px] font-mono transition-colors ${
                    form.preferredModel === m
                      ? 'bg-[var(--accent)] text-white'
                      : 'bg-[var(--surface-2)] text-[var(--muted)] hover:text-[var(--ink)]'
                  }`}
                >
                  {m.split('/').pop()}
                </button>
              ))}
            </div>
          )}

          {/* 测试连接 */}
          <div className="mt-3 border-t border-[var(--line)] pt-3">
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void handleTest()}
                disabled={testState === 'loading'}
              >
                {testState === 'loading' ? '测试中...' : '测试连接'}
              </Button>
              <span className="text-[11px] text-[var(--muted)]">
                发送 Hi，验证 {PROVIDER_OPTIONS.find((o) => o.value === form.preferredProvider)?.label ?? form.preferredProvider} 是否在线
              </span>
            </div>

            {testResult && (
              <div className={`mt-2 rounded-lg px-3 py-2 text-[12px] ${testResult.ok ? 'bg-[color-mix(in_oklch,var(--green),transparent_88%)] text-[var(--green)]' : 'bg-[color-mix(in_oklch,var(--red),transparent_88%)] text-[var(--red)]'}`}>
                {testResult.ok ? (
                  <>
                    <span className="font-semibold">已连接</span>
                    {testResult.response && (
                      <span className="ml-1 text-[var(--ink)]">— {testResult.response}</span>
                    )}
                  </>
                ) : (
                  <>
                    <span className="font-semibold">连接失败</span>
                    {testResult.error && (
                      <span className="ml-1">{testResult.error}</span>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </FieldGroup>

        {/* 保存按钮 */}
        <div className="flex items-center gap-3">
          <Button
            variant="primary"
            size="md"
            onClick={() => void handleSave()}
            disabled={!dirty || updateWorkspace.isPending}
          >
            {updateWorkspace.isPending ? '保存中...' : '保存设置'}
          </Button>
          {saved && !dirty && (
            <span className="text-[12px] text-[var(--green)]">已保存</span>
          )}
          {updateWorkspace.isError && (
            <span className="text-[12px] text-[var(--red)]">保存失败，请重试</span>
          )}
        </div>
      </div>
    </section>
  );
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="glass-panel p-4">
      <div className="mb-1.5 text-[9.5px] font-extrabold uppercase tracking-[0.08em] text-[var(--subtle)]">{label}</div>
      {children}
    </div>
  );
}
