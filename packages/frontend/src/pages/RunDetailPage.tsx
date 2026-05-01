import { useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { Badge } from '../components/ui/Badge.js';
import { Button } from '../components/ui/Button.js';
import { showToast } from '../components/ui/Toast.js';
import { EditOutputModal } from '../features/edit-output/EditOutputModal.js';
import { FindingSel } from '../features/finding/FindingSel.js';
import { TakeOverModal } from '../features/take-over/TakeOverModal.js';
import { AgentBanner } from '../features/workflow-run/AgentBanner.js';
import { useSubmitDecision, type DecisionAction } from '../hooks/useDecision.js';
import { useStepChangeNotifications } from '../hooks/useNotifications.js';
import { useArtifact } from '../hooks/useArtifact.js';
import { useRun, type WorkflowStep } from '../hooks/useRun.js';
import { useUIStore } from '../stores/ui.store.js';

const flowMeta = [
  { label: '空状态', hint: '首次打开', human: false },
  { label: '创建向导', hint: '3步向导', human: true },
  { label: 'PRD确认', hint: '等待人工', human: true },
  { label: '生成计划', hint: 'Agent', human: false },
  { label: '审批计划', hint: '等待人工', human: true },
  { label: '任务拆解', hint: 'Agent', human: false },
  { label: '代码实现', hint: 'Agent', human: false },
  { label: '运行测试', hint: 'Agent', human: false },
  { label: '代码审查', hint: 'Agent', human: false },
  { label: '最终审查', hint: '等待人工', human: true },
  { label: 'PR完成', hint: '全部完成', human: false }
];

const diffFiles = [
  {
    name: 'src/cart/CartService.ts',
    adds: 68,
    dels: 4,
    lines: [
      ['ctx', '  private storage: Storage;'],
      ['del', '-  async save() { }'],
      ['add', '+  async persist(cart: Cart): Promise<void> {'],
      ['add', '+    this.storage.setItem("cart", JSON.stringify(cart));'],
      ['add', '+    await this.syncToServer(cart);'],
      ['ctx', '  async syncToServer(cart: Cart) {']
    ]
  },
  {
    name: 'src/api/cart.ts',
    adds: 34,
    dels: 0,
    lines: [
      ['ctx', "import { Router } from 'express';"],
      ['add', '+const router = Router();'],
      ['add', "+router.post('/cart/sync', auth, async (req, res) => {"],
      ['add', '+  await CartStore.save(req.user.id, req.body);'],
      ['add', '+  res.json({ ok: true });']
    ]
  },
  {
    name: 'src/hooks/useCart.ts',
    adds: 22,
    dels: 3,
    lines: [
      ['ctx', '  const [cart, setCart] = useState<Cart>(() => {'],
      ['del', "-    return JSON.parse(localStorage.getItem('cart') || '[]');"],
      ['add', '+    return cartService.loadFromStorage();'],
      ['ctx', '  });']
    ]
  }
];

const ownerLabel: Record<string, string> = {
  human: '人工',
  agent: 'Agent',
  approval_gate: '人工'
};

const agentRoleLabel: Record<string, string> = {
  planner: 'Planner',
  tasker: 'Breakdown',
  coder: 'Coding',
  tester: 'Test',
  reviewer: 'Review',
  summarizer: 'Summarizer'
};

function flowStateForStep(step?: WorkflowStep) {
  if (!step) return 1;
  if (step.owner_type === 'approval_gate' && step.position <= 3) return 5;
  if (step.owner_type === 'approval_gate') return 10;
  return Math.min(Math.max(step.position + 2, 3), 11);
}

function FlowNav({ state }: { state: number }) {
  return (
    <div className="flow-nav">
      <span className="mr-2 shrink-0 text-[10.5px] font-extrabold uppercase tracking-[0.08em] text-[var(--subtle)]">
        Flow
      </span>
      <div className="flex items-center gap-0">
        {flowMeta.map((item, index) => {
          const position = index + 1;
          const active = state === position;
          const done = state > position;
          const accent = item.human ? 'var(--amber)' : 'var(--teal)';
          return (
            <div key={item.label} className="flex shrink-0 items-center">
              {index > 0 ? (
                <span
                  className="h-[1.5px] w-3"
                  style={{ background: done ? 'var(--green)' : active ? accent : 'rgba(0,0,0,0.09)' }}
                />
              ) : null}
              <div
                title={item.hint}
                className="flex flex-col items-center gap-0.5 rounded-lg px-2 py-1"
                style={{
                  background: active ? (item.human ? 'var(--accent-soft)' : 'var(--agent-soft)') : 'transparent',
                  outline: active ? `2px solid ${accent}` : 'none',
                  outlineOffset: 1
                }}
              >
                <div
                  className="flex h-5 w-5 items-center justify-center rounded-full text-[9.5px] font-extrabold"
                  style={{
                    background: done ? 'var(--green)' : active ? accent : 'rgba(0,0,0,0.08)',
                    color: done || active ? 'white' : 'var(--subtle)'
                  }}
                >
                  {done ? '✓' : position}
                </div>
                <span
                  className="whitespace-nowrap text-[9.5px]"
                  style={{ color: active ? accent : 'var(--subtle)', fontWeight: active ? 800 : 500 }}
                >
                  {item.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="ml-auto flex shrink-0 gap-2 pl-3">
        <Badge color="amber">👤 人工</Badge>
        <Badge color="teal">🤖 Agent</Badge>
      </div>
    </div>
  );
}

function OwnerTag({ step }: { step: WorkflowStep }) {
  if (step.owner_type === 'agent') {
    return <Badge color="teal">🤖 {agentRoleLabel[step.agent_role ?? ''] ?? 'Agent'}</Badge>;
  }
  return <Badge color="amber">👤 {ownerLabel[step.owner_type] ?? '人工'}</Badge>;
}

function StepRow({ step, active, onSelect }: { step: WorkflowStep; active: boolean; onSelect: () => void }) {
  const accent = step.owner_type === 'agent' ? 'var(--teal)' : 'var(--amber)';
  const muted = step.status === 'pending' || step.status === 'cancelled';
  return (
    <button type="button" onClick={onSelect} className="mb-1.5 flex w-full items-stretch gap-0 border-0 bg-transparent p-0 text-left">
      <span
        className="mr-2.5 mt-0.5 w-[3px] shrink-0 rounded-full"
        style={{ background: muted ? 'rgba(0,0,0,0.06)' : accent }}
      />
      <span
        className="flex-1 rounded-[11px] border p-3 backdrop-blur-[10px] transition"
        style={{
          background: active ? 'var(--surface)' : 'rgba(255,255,255,0.25)',
          borderColor: active ? (step.owner_type === 'agent' ? 'color-mix(in oklch, var(--teal), transparent 45%)' : 'var(--accent-line)') : 'rgba(255,255,255,0.7)',
          boxShadow: active ? 'var(--shadow)' : 'none'
        }}
      >
        <span className="mb-1 flex flex-wrap items-center gap-1.5">
          <span className={`step-dot is-${step.status.replace(/_/g, '-')}`} />
          <span className="text-[12.5px] font-bold" style={{ color: muted ? 'var(--subtle)' : 'var(--ink)' }}>
            {step.name}
          </span>
          <OwnerTag step={step} />
          {step.owner_type === 'approval_gate' && !['completed', 'cancelled', 'timed_out'].includes(step.status) ? <Badge color="amber">⚡ 待决策</Badge> : null}
          {step.status === 'running' ? <Badge color="teal">⟳ 运行中</Badge> : null}
          {step.status === 'completed' ? <Badge color="green">✓</Badge> : null}
        </span>
        <span className="block pl-4 text-[11px] leading-4 text-[var(--subtle)]">
          {step.agent_role ? `${agentRoleLabel[step.agent_role] ?? step.agent_role} Agent 执行并产生产物` : '人工确认输入、审批或最终交付'}
        </span>
      </span>
    </button>
  );
}

function PanelWrapper({ title, badge, children }: { title: string; badge?: ReactNode; children: ReactNode }) {
  return (
    <div className="prototype-panel anim-right">
      <div className="prototype-panel-header">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <span className="text-[14.5px] font-extrabold text-[var(--ink)]">{title}</span>
          {badge}
        </div>
        <Button size="sm" variant="secondary" title="全屏">
          ⊞
        </Button>
      </div>
      {children}
    </div>
  );
}

function DiffViewer() {
  const [fileIndex, setFileIndex] = useState(0);
  const file = diffFiles[fileIndex];
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 gap-0 overflow-x-auto border-b border-black/5 bg-white/30 px-4">
        {diffFiles.map((diffFile, index) => (
          <button
            key={diffFile.name}
            type="button"
            onClick={() => setFileIndex(index)}
            className={`border-0 border-b-2 bg-transparent px-3 py-2 font-mono text-[11.5px] font-bold ${
              fileIndex === index ? 'border-[var(--amber)] text-[var(--amber)]' : 'border-transparent text-[var(--muted)]'
            }`}
          >
            {diffFile.name.split('/').at(-1)}
            <span className="ml-1 text-[var(--green)]">+{diffFile.adds}</span>
            {diffFile.dels > 0 ? <span className="ml-1 text-[var(--red)]">-{diffFile.dels}</span> : null}
          </button>
        ))}
      </div>
      <div className="flex shrink-0 items-center gap-2 border-b border-black/5 bg-black/[0.03] px-4 py-1.5">
        <span className="font-mono text-[10.5px] text-[var(--subtle)]">{file.name}</span>
        <Badge color="green">+{file.adds}</Badge>
        {file.dels > 0 ? <Badge color="red">-{file.dels}</Badge> : null}
      </div>
      <div className="prototype-code-surface">
        <table className="w-full border-collapse">
          <tbody>
            {file.lines.map(([kind, line], index) => (
              <tr
                // eslint-disable-next-line react/no-array-index-key
                key={`${kind}-${index}`}
                style={{
                  background: kind === 'add' ? 'rgba(61,175,100,0.13)' : kind === 'del' ? 'rgba(220,70,70,0.12)' : 'transparent'
                }}
              >
                <td className="w-9 select-none pr-1 pt-1 text-right text-[10px] text-slate-600">{kind === 'ctx' ? index + 44 : ''}</td>
                <td
                  className="w-4 select-none pt-1"
                  style={{ color: kind === 'add' ? 'var(--green)' : kind === 'del' ? 'var(--red)' : 'oklch(40% 0.01 220)' }}
                >
                  {kind === 'add' ? '+' : kind === 'del' ? '-' : ' '}
                </td>
                <td
                  className="whitespace-pre py-1 pr-4"
                  style={{ color: kind === 'add' ? 'oklch(82% 0.09 145)' : kind === 'del' ? 'oklch(80% 0.10 25)' : 'oklch(78% 0.04 195)' }}
                >
                  {line.replace(/^[+\- ]/, '')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ArtifactCard({ artifactId }: { artifactId: string }) {
  const { data: artifact, isLoading } = useArtifact(artifactId);
  if (isLoading) return <div className="rounded-[10px] border border-black/5 bg-white/40 p-3 text-[11.5px] text-[var(--subtle)]">加载中...</div>;
  if (!artifact) return null;
  return (
    <div className="rounded-[10px] border border-black/5 bg-white/60 p-3">
      <div className="mb-2 flex items-center gap-2">
        <Badge color="teal">{artifact.role}</Badge>
        {artifact.title && <span className="text-[13px] font-bold text-[var(--ink)]">{artifact.title}</span>}
      </div>
      {artifact.contentInline ? (
        <div className="max-h-96 overflow-auto whitespace-pre-wrap rounded-[8px] bg-black/[0.03] p-3 font-mono text-[11.5px] leading-6 text-[var(--ink)]">
          {artifact.contentInline}
        </div>
      ) : (
        <div className="text-[11.5px] text-[var(--subtle)]">（无内联内容）</div>
      )}
    </div>
  );
}

function PlanApprovalPanel({
  activeStep,
  onDecision,
  onRequest,
  onTakeOver,
  onEditOutput
}: {
  activeStep: WorkflowStep;
  onDecision: (opts: { action: DecisionAction; comment?: string }) => void;
  onRequest: () => void;
  onTakeOver: () => void;
  onEditOutput: () => void;
}) {
  const { t } = useTranslation('approval');
  const [tab, setTab] = useState<'content' | 'artifacts'>('content');
  const primaryId = activeStep.output_artifact_ids[0] ?? '';
  const { data: primaryArtifact, isLoading } = useArtifact(primaryId);

  return (
    <PanelWrapper title={activeStep.name} badge={<><OwnerTag step={activeStep} /><Badge color="amber">⚡ 待审批</Badge></>}>
      <div className="prototype-tabbar">
        {[
          ['content', '计划内容'],
          ['artifacts', '产物']
        ].map(([key, label]) => (
          <button key={key} type="button" onClick={() => setTab(key as typeof tab)} className={`prototype-tab ${tab === key ? 'is-active' : ''}`}>
            {label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-auto p-[14px_18px]">
        {tab === 'content' ? (
          activeStep.output_artifact_ids.length === 0 ? (
            <div className="text-[11.5px] text-[var(--subtle)]">Agent 尚未产出计划内容。</div>
          ) : isLoading ? (
            <div className="text-[11.5px] text-[var(--subtle)]">加载中...</div>
          ) : primaryArtifact?.contentInline ? (
            <div className="whitespace-pre-wrap font-mono text-[11.5px] leading-7 text-[var(--ink)]">{primaryArtifact.contentInline}</div>
          ) : (
            <div className="text-[11.5px] text-[var(--subtle)]">无内联内容。</div>
          )
        ) : null}
        {tab === 'artifacts' ? (
          activeStep.output_artifact_ids.length === 0 ? (
            <div className="text-[11.5px] text-[var(--subtle)]">暂无产物。</div>
          ) : (
            <div className="flex flex-col gap-3">
              {activeStep.output_artifact_ids.map((id) => (
                <ArtifactCard key={id} artifactId={id} />
              ))}
            </div>
          )
        ) : null}
      </div>
      <div className="border-t border-black/5 bg-white/25 p-[14px_18px]">
        <div className="mb-3 rounded-[9px] border border-[var(--accent-line)] bg-[var(--accent-soft)] p-3 text-[11.5px] text-[var(--muted)]">
          <span className="font-extrabold text-[var(--amber)]">⚡ 需要你的决策</span> - 审阅计划，确认后 Agent 开始拆解任务。
        </div>
        <Button className="mb-2 w-full" size="md" variant="primary" aria-label={t('approve')} onClick={() => onDecision({ action: 'approve' })}>✓ {t('approve_plan')}</Button>
        <div className="mb-2 grid grid-cols-2 gap-1.5">
          <Button onClick={onRequest}>↺ {t('request_changes')}</Button>
          <Button onClick={onEditOutput}>✎ {t('edit_output')}</Button>
          <Button onClick={onTakeOver}>👤 {t('take_over')}</Button>
          <Button onClick={() => onDecision({ action: 'rerun' })}>↩ {t('rerun_step')}</Button>
        </div>
        <Button className="w-full" variant="danger" onClick={() => onDecision({ action: 'reject' })}>✕ {t('reject')}</Button>
      </div>
    </PanelWrapper>
  );
}

function AgentRunningPanel({ activeStep, onTakeOver, onRerun }: { activeStep: WorkflowStep; onTakeOver: () => void; onRerun: () => void }) {
  return (
    <PanelWrapper title={activeStep.name} badge={<OwnerTag step={activeStep} />}>
      <div className="flex-1 overflow-auto p-[14px_18px]">
        {activeStep.agent_role ? (
          <AgentBanner agentRole={activeStep.agent_role} startedAt={new Date(activeStep.updated_at)} onRerun={onRerun} onTakeOver={onTakeOver} />
        ) : null}
        <div className="rounded-[9px] border border-black/5 bg-white/50 p-3 text-sm leading-6 text-[var(--muted)]">
          <span className="font-bold text-[var(--teal)]">工作流将自动继续</span>
          <br />
          完成后推进到下一步，所有产物会进入审计链。
        </div>
      </div>
    </PanelWrapper>
  );
}

function CodingPanel({ activeStep, onTakeOver }: { activeStep: WorkflowStep; onTakeOver: () => void }) {
  const [tab, setTab] = useState<'diff' | 'files' | 'logs'>('diff');
  return (
    <PanelWrapper title={activeStep.name} badge={<><OwnerTag step={activeStep} /><Badge color="teal">⟳ Task 2/4</Badge></>}>
      <div className="prototype-tabbar">
        {[
          ['diff', '代码 Diff'],
          ['files', '变更文件'],
          ['logs', '日志']
        ].map(([key, label]) => (
          <button key={key} type="button" onClick={() => setTab(key as typeof tab)} className={`prototype-tab ${tab === key ? 'is-active' : ''}`}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'diff' ? <DiffViewer /> : null}
      {tab === 'files' ? (
        <div className="flex-1 overflow-auto p-[14px_18px]">
          {diffFiles.map((file) => (
            <div key={file.name} className="mb-1.5 flex items-center gap-2 rounded-lg border border-black/5 bg-white/50 px-2.5 py-2 font-mono text-[11.5px] text-[var(--muted)]">
              <span className="font-extrabold text-[var(--amber)]">M</span>
              <span className="flex-1">{file.name}</span>
              <span className="font-bold text-[var(--green)]">+{file.adds}</span>
              {file.dels ? <span className="font-bold text-[var(--red)]">-{file.dels}</span> : null}
            </div>
          ))}
        </div>
      ) : null}
      {tab === 'logs' ? (
        <div className="flex-1 overflow-auto p-[14px_18px]">
          {activeStep.agent_role ? <AgentBanner agentRole={activeStep.agent_role} startedAt={new Date(activeStep.updated_at)} /> : null}
        </div>
      ) : null}
      <div className="flex gap-2 border-t border-black/5 p-[12px_18px]">
        <Button className="flex-1" variant="danger">⊠ 停止 Agent</Button>
        <Button className="flex-1" onClick={onTakeOver}>👤 接管步骤</Button>
      </div>
    </PanelWrapper>
  );
}

function FinalReviewPanel({
  activeStep,
  steps,
  onDecision,
  onRequest,
  onTakeOver
}: {
  activeStep: WorkflowStep;
  steps: WorkflowStep[];
  onDecision: (opts: { action: DecisionAction; comment?: string }) => void;
  onRequest: () => void;
  onTakeOver: () => void;
}) {
  const { t } = useTranslation('approval');
  // Look for review artifact: first from this step's outputs, then from the previous step
  const prevStep = steps.find((s) => s.position === activeStep.position - 1);
  const reviewArtifactId =
    activeStep.output_artifact_ids.at(-1) ?? prevStep?.output_artifact_ids.at(-1) ?? '';
  const { data: reviewArtifact, isLoading } = useArtifact(reviewArtifactId);

  return (
    <PanelWrapper title={activeStep.name} badge={<><OwnerTag step={activeStep} /><Badge color="amber">⚡ 待决策</Badge></>}>
      <div className="flex-1 overflow-auto p-[14px_18px]">
        {isLoading ? (
          <div className="text-[11.5px] text-[var(--subtle)]">加载审查内容...</div>
        ) : reviewArtifact?.contentInline ? (
          <div className="whitespace-pre-wrap font-mono text-[11.5px] leading-7 text-[var(--ink)]">{reviewArtifact.contentInline}</div>
        ) : (
          <div className="text-[11.5px] text-[var(--subtle)]">暂无审查内容。</div>
        )}
      </div>
      <div className="border-t border-black/5 bg-white/25 p-[14px_18px]">
        <Button className="mb-2 w-full" variant="primary" aria-label={t('approve')} onClick={() => onDecision({ action: 'approve' })}>✓ {t('approve')}</Button>
        <div className="mb-2 grid grid-cols-2 gap-1.5">
          <Button onClick={onRequest}>↺ {t('request_changes')}</Button>
          <Button onClick={onTakeOver}>👤 {t('take_over')}</Button>
          <Button onClick={() => onDecision({ action: 'rerun' })}>↩ {t('rerun_step')}</Button>
        </div>
        <Button className="w-full" variant="danger" onClick={() => onDecision({ action: 'reject' })}>✕ {t('reject')}</Button>
      </div>
    </PanelWrapper>
  );
}

function CompletedStepPanel({ activeStep }: { activeStep: WorkflowStep }) {
  return (
    <PanelWrapper title={activeStep.name} badge={<><OwnerTag step={activeStep} /><Badge color="green">✓ 已完成</Badge></>}>
      <div className="flex-1 overflow-auto p-[14px_18px]">
        {activeStep.output_artifact_ids.length === 0 ? (
          <div className="text-[11.5px] text-[var(--subtle)]">此步骤无产出产物。</div>
        ) : (
          <div className="flex flex-col gap-3">
            {activeStep.output_artifact_ids.map((id) => (
              <ArtifactCard key={id} artifactId={id} />
            ))}
          </div>
        )}
      </div>
    </PanelWrapper>
  );
}

function StartWorkflowPanel({
  activeStep,
  onStart
}: {
  activeStep: WorkflowStep;
  onStart: () => void;
}) {
  return (
    <PanelWrapper title={activeStep.name} badge={<OwnerTag step={activeStep} />}>
      <div className="flex-1 overflow-auto p-5">
        <div className="mb-4 rounded-xl border border-[color-mix(in_oklch,var(--teal),transparent_55%)] bg-[var(--agent-soft)] p-4">
          <div className="mb-1 text-[13px] font-extrabold text-[var(--teal)]">Workspace 已就绪</div>
          <div className="mt-1 text-[11.5px] leading-6 text-[var(--muted)]">
            已完成 Workspace 配置（GitHub 仓库 + AI Provider）。
            <br />
            点击"开始工作流"激活 Step 2 进行 PRD 导入。
          </div>
        </div>
      </div>
      <div className="border-t border-black/5 bg-white/25 p-[14px_18px]">
        <Button className="w-full" size="md" variant="primary" onClick={onStart}>
          ▶ 开始工作流
        </Button>
      </div>
    </PanelWrapper>
  );
}

function PRDInputPanel({
  activeStep,
  onSubmit
}: {
  activeStep: WorkflowStep;
  onSubmit: (content: string) => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isEmpty, setIsEmpty] = useState(true);

  return (
    <PanelWrapper title={activeStep.name} badge={<><OwnerTag step={activeStep} /><Badge color="amber">⚡ 待输入</Badge></>}>
      <div className="flex min-h-0 flex-1 flex-col p-[14px_18px]">
        <div className="mb-2 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[var(--subtle)]">
          粘贴 PRD 内容
        </div>
        <textarea
          ref={textareaRef}
          className="min-h-0 flex-1 resize-none rounded-[10px] border border-black/10 bg-white/70 p-3 font-mono text-[12px] leading-6 text-[var(--ink)] outline-none focus:border-[var(--amber)] focus:ring-2 focus:ring-[var(--amber)]/20"
          placeholder="在此粘贴产品需求文档（PRD）内容...&#10;&#10;支持 Markdown 格式"
          onChange={(e) => setIsEmpty(e.target.value.trim().length === 0)}
        />
      </div>
      <div className="border-t border-black/5 bg-white/25 p-[14px_18px]">
        <div className="mb-2 rounded-[9px] border border-[var(--accent-line)] bg-[var(--accent-soft)] p-3 text-[11.5px] text-[var(--muted)]">
          <span className="font-extrabold text-[var(--amber)]">⚡ 提交后</span> — Agent 将自动读取 PRD 并生成工程实现计划。
        </div>
        <Button
          className="w-full"
          size="md"
          variant="primary"
          disabled={isEmpty}
          onClick={() => {
            const content = textareaRef.current?.value.trim() ?? '';
            if (content) onSubmit(content);
          }}
        >
          ✓ 提交 PRD，开始生成计划
        </Button>
      </div>
    </PanelWrapper>
  );
}

function DonePanel({ activeStep }: { activeStep: WorkflowStep }) {
  const summaryArtifactId = activeStep.output_artifact_ids.at(-1) ?? '';
  const { data: summaryArtifact, isLoading } = useArtifact(summaryArtifactId);

  return (
    <PanelWrapper title="工作流完成" badge={<Badge color="green">✓ 已完成</Badge>}>
      <div className="flex-1 overflow-auto p-5">
        <div className="mb-4 rounded-xl border border-[color-mix(in_oklch,var(--green),transparent_55%)] bg-[var(--success-soft)] p-4 text-center">
          <div className="mb-1 text-2xl">🎉</div>
          <div className="text-sm font-extrabold text-[var(--green)]">工作流已完成</div>
          <div className="mt-1 text-xs text-[var(--muted)]">{activeStep.name}</div>
        </div>
        {isLoading ? (
          <div className="text-[11.5px] text-[var(--subtle)]">加载中...</div>
        ) : summaryArtifact?.contentInline ? (
          <div className="whitespace-pre-wrap rounded-[10px] border border-black/5 bg-white/60 p-4 font-mono text-[11.5px] leading-6 text-[var(--ink)]">
            {summaryArtifact.contentInline}
          </div>
        ) : (
          <div className="text-[11.5px] text-[var(--subtle)]">暂无 PR 摘要内容。</div>
        )}
      </div>
    </PanelWrapper>
  );
}

function ActivePanel({
  activeStep,
  steps,
  onDecision,
  onRequest,
  onTakeOver,
  onEditOutput
}: {
  activeStep: WorkflowStep;
  steps: WorkflowStep[];
  onDecision: (opts: { action: DecisionAction; comment?: string; artifact_content?: string }) => void;
  onRequest: () => void;
  onTakeOver: () => void;
  onEditOutput: () => void;
}) {
  if (activeStep.position === 1 && activeStep.owner_type === 'human') {
    return <StartWorkflowPanel activeStep={activeStep} onStart={() => onDecision({ action: 'approve' })} />;
  }
  if (activeStep.status === 'completed' && activeStep.position >= 9) return <DonePanel activeStep={activeStep} />;
  if (activeStep.status === 'completed') return <CompletedStepPanel activeStep={activeStep} />;
  if (activeStep.position === 2 && activeStep.owner_type === 'approval_gate') {
    return <PRDInputPanel activeStep={activeStep} onSubmit={(content) => onDecision({ action: 'approve', artifact_content: content })} />;
  }
  if (activeStep.owner_type === 'approval_gate' || activeStep.status === 'human_owned') {
    if (activeStep.position >= 8) {
      return <FinalReviewPanel activeStep={activeStep} steps={steps} onDecision={onDecision} onRequest={onRequest} onTakeOver={onTakeOver} />;
    }
    return <PlanApprovalPanel activeStep={activeStep} onDecision={onDecision} onRequest={onRequest} onTakeOver={onTakeOver} onEditOutput={onEditOutput} />;
  }
  if (activeStep.agent_role === 'coder' && activeStep.status !== 'completed') return <CodingPanel activeStep={activeStep} onTakeOver={onTakeOver} />;
  if (activeStep.status === 'running') {
    return <AgentRunningPanel activeStep={activeStep} onTakeOver={onTakeOver} onRerun={() => onDecision({ action: 'rerun' })} />;
  }
  return <PlanApprovalPanel activeStep={activeStep} onDecision={onDecision} onRequest={onRequest} onTakeOver={onTakeOver} onEditOutput={onEditOutput} />;
}

export function RunDetailPage() {
  const { workspaceSlug, runId } = useParams<{ workspaceSlug: string; runId: string }>();
  const { t } = useTranslation(['common', 'approval']);
  const { data: run, isLoading } = useRun(runId ?? '');
  const selectedStepId = useUIStore((state) => state.selectedStepId);
  const selectStep = useUIStore((state) => state.selectStep);
  const openTakeOverModal = useUIStore((state) => state.openTakeOverModal);
  const openFindingSel = useUIStore((state) => state.openFindingSel);
  const openEditOutput = useUIStore((state) => state.openEditOutput);
  const { mutateAsync: submitDecision } = useSubmitDecision();

  useStepChangeNotifications(run?.steps);

  const TERMINAL = new Set(['completed', 'cancelled', 'timed_out']);

  const activeStep = useMemo(() => {
    const notDone = (step: WorkflowStep) => !TERMINAL.has(step.status);
    return (
      run?.steps.find((step) => step.id === selectedStepId) ??
      run?.steps.find((step) => notDone(step) && step.status === 'human_owned') ??
      run?.steps.find((step) => notDone(step) && step.owner_type === 'approval_gate') ??
      run?.steps.find((step) => notDone(step) && step.status === 'running') ??
      run?.steps.find((step) => notDone(step)) ??
      run?.steps.at(-1)
    );
  }, [run?.steps, selectedStepId]);

  const handleDecision = async ({ action, comment, artifact_content }: { action: DecisionAction; comment?: string; artifact_content?: string }) => {
    if (!activeStep || !run) return;
    try {
      await submitDecision({ stepId: activeStep.id, runId: run.id, action, comment, artifact_content });
      showToast(t('approval:decision_submitted'));
    } catch {
      showToast(t('common:error'), 'error');
    }
  };

  if (isLoading) return <div className="p-6 text-sm text-[var(--muted)]">{t('common:loading')}</div>;
  if (!run || !activeStep) return <div className="p-6 text-sm text-[var(--red)]">{t('common:error')}</div>;

  const flowState = flowStateForStep(activeStep);

  return (
    <div className="prototype-workspace">
      <FlowNav state={flowState} />
      <div className="prototype-main">
        <aside className="prototype-timeline">
          <div className="mb-3.5">
            <div className="mb-1 text-[11px] text-[var(--subtle)]">
              {workspaceSlug ?? run.workspace_id} › <span className="font-bold text-[var(--muted)]">{run.feature_branch ?? run.id.slice(0, 8)}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <h2 className="m-0 text-sm font-extrabold text-[var(--ink)]">
                WorkflowRun <code className="rounded bg-[var(--accent-soft)] px-1.5 py-0.5 font-mono text-[11px] font-medium text-[var(--amber)]">{run.id.slice(0, 6)}</code>
              </h2>
            </div>
          </div>

          <div className="mb-3 rounded-[10px] border border-[var(--accent-line)] bg-[var(--accent-soft)] p-3">
            <div className="flex items-center gap-1.5">
              <span className="text-xs">⚡</span>
              <span className="text-[11.5px] font-bold leading-4 text-[var(--amber)]">
                {activeStep.owner_type === 'agent' ? `${activeStep.name} 正在执行...` : `${activeStep.name} - 等待你的决策`}
              </span>
            </div>
          </div>

          <div className="mb-2 flex gap-2">
            <span className="flex items-center gap-1 text-[10px] font-bold text-[var(--amber)]"><span className="h-3 w-[2.5px] rounded-full bg-[var(--amber)]" />人工</span>
            <span className="flex items-center gap-1 text-[10px] font-bold text-[var(--teal)]"><span className="h-3 w-[2.5px] rounded-full bg-[var(--teal)]" />Agent</span>
          </div>

          {run.steps.map((step) => (
            <StepRow key={step.id} step={step} active={activeStep.id === step.id} onSelect={() => selectStep(step.id)} />
          ))}

          {run.feature_branch ? (
            <div className="mt-3 rounded-[9px] border border-black/5 bg-white/30 p-3">
              <div className="mb-1 flex justify-between gap-2">
                <span className="text-[9.5px] font-bold text-[var(--subtle)]">Branch</span>
                <span className="truncate font-mono text-[9.5px] text-[var(--muted)]">{run.feature_branch}</span>
              </div>
            </div>
          ) : null}
        </aside>

        <ActivePanel
          activeStep={activeStep}
          steps={run.steps}
          onDecision={handleDecision}
          onRequest={openFindingSel}
          onTakeOver={openTakeOverModal}
          onEditOutput={() => openEditOutput(activeStep.id, activeStep.output_artifact_ids.at(-1) ?? null)}
        />
      </div>

      <FindingSel onSubmit={(comment) => handleDecision({ action: 'request_changes', comment })} />
      <TakeOverModal stepId={activeStep.id} featureBranch={run.feature_branch ?? ''} />
      <EditOutputModal />
    </div>
  );
}
