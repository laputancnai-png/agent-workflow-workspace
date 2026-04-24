# AWW TODOLIST

> **说明：** 本列表追踪所有待确认事项、已知缺陷和未来迭代任务。每条记录含状态、提出日期、提出者、优先级。

---

## 状态说明

| 状态 | 含义 |
|------|------|
| `🔵 Open` | 待处理，尚未开始 |
| `🟡 In Progress` | 正在处理中 |
| `🟢 Done` | 已解决或已完成 |
| `⚪ Deferred` | 有意推迟（Post-MVP 或待信息） |
| `🔴 Blocked` | 等待外部信息或依赖 |

---

## Prototype 数据层缺陷（不阻断进展）

| ID | 状态 | 优先级 | 描述 | 文件位置 | 提出日期 | 提出者 |
|----|------|--------|------|----------|----------|--------|
| BUG-01 | 🟢 Done | Low | `FLOW_ST[8]`（state 9）Step 7 状态应为 `running`，Step 8 状态应为 `pending` — 已修复 | `docs/AWW Prototype_v2.html` — `FLOW_ST` 数组 index 8 | 2026-04-22 | 架构审查 |
| BUG-02 | 🟢 Done | Low | `FLOW_META[8]`（state 9）`human` 应为 `false`，`hint` 应为 `'Agent'`，`label` 应为 `'代码审查'` — 已修复 | `docs/AWW Prototype_v2.html` — `FLOW_META` 数组 index 8 | 2026-04-22 | 架构审查 |
| BUG-03 | 🟢 Done | Low | `FLOW_ST[9]`（state 10）Step 8 状态应为 `waiting`，现为 `running` — 已修复 | `docs/AWW Prototype_v2.html` — `FLOW_ST` 数组 index 9 | 2026-04-22 | 架构审查 |

---

## 待确认外部协议（实现前需明确）

| ID | 状态 | 优先级 | 描述 | 涉及模块 | 提出日期 | 提出者 |
|----|------|--------|------|----------|----------|--------|
| INF-01 | 🟢 Done | High | **OpenClaw Gateway WebSocket 协议已确认并写入 P2 plan**：`req/res/event` frame + connect-first 握手（`connect.challenge` → `connect` → `hello-ok`）。P2 Task 5 已实现：鉴权字段 `api_key`（可选）、错误码映射（`rate_limit`/`auth_failed`/`invalid_model`/`context_length`）、`llm.stream` 事件流聚合、5 个契约测试覆盖。 | `packages/runner/src/providers/openclaw.ts` | 2026-04-22 | 架构审查 |
| INF-02 | 🟢 Done | High | **Hermes 本地 API 契约已确认并写入 P2 plan**：`POST /v1/chat/completions`、`GET /health`（fallback `/health/detailed`），可配置 `base_url`（不固定 7331）。P2 Task 6 已实现，包含 4 个 nock 契约测试。 | `packages/runner/src/providers/hermes.ts` | 2026-04-22 | 架构审查 |

---

## 当前阶段必须完成的契约清理

| ID | 状态 | 优先级 | 描述 | 涉及文档 | 提出日期 | 提出者 |
|----|------|--------|------|----------|----------|--------|
| CONTRACT-01 | 🟢 Done | High | **WorkflowStep 状态枚举已统一**：以 PRD §23 / P1 schema 为准，使用 `pending/running/completed/failed/timed_out/retrying/cancelled/human_owned`；架构 API 副作用描述不再使用 `approved/rejected/changes_requested/in_progress/awaiting_approval/human_taking_over` 作为 Step status。 | `docs/PRD.md`, `docs/superpowers/specs/2026-04-22-aww-system-architecture.md`, `docs/superpowers/plans/2026-04-22-aww-p1-backend.md`, `docs/superpowers/plans/2026-04-22-aww-p3-frontend.md` | 2026-04-22 | 最终审查 |
| CONTRACT-02 | 🟢 Done | High | **Agent role 枚举已统一**：实现契约统一为 `planner/tasker/coder/tester/reviewer/summarizer`；Prototype 只负责把这些值显示成用户友好 label。 | `docs/PRD.md`, `docs/AWW Prototype_v2.html`, `docs/superpowers/plans/2026-04-22-aww-p1-backend.md`, `docs/superpowers/plans/2026-04-22-aww-p2-runner.md`, `docs/superpowers/plans/2026-04-22-aww-p3-frontend.md` | 2026-04-22 | 最终审查 |
| CONTRACT-03 | 🟢 Done | High | **Artifact role 已补齐 `HUMAN_EDIT`**：P1 schema 和 artifact API validation 与 PRD 的 Edit Output 流程一致。 | `docs/PRD.md`, `docs/superpowers/plans/2026-04-22-aww-p1-backend.md` | 2026-04-22 | 最终审查 |
| CONTRACT-04 | 🟢 Done | Medium | **GitHub MVP 凭据策略已统一**：MVP 使用 Local Runner 本机 `gh auth login` + `gh` CLI 创建 PR；AWW Cloud 不存 GitHub token。GitHub App / OAuth token 进入 Post-MVP。 | `docs/PRD.md`, `docs/superpowers/specs/2026-04-22-aww-system-architecture.md` | 2026-04-22 | 最终审查 |
| CONTRACT-05 | 🟢 Done | Medium | **Runner CLI/config 命名已统一**：使用 `aww runner register`、`~/.aww/config.toml` 和 `~/.aww/runner.json`。 | `docs/PRD.md`, `docs/superpowers/specs/2026-04-22-aww-system-architecture.md`, `docs/superpowers/plans/2026-04-22-aww-p2-runner.md` | 2026-04-22 | 最终审查 |

---

## Post-MVP 功能（有意推迟）

| ID | 状态 | 优先级 | 描述 | 相关 PRD 章节 | 提出日期 | 提出者 |
|----|------|--------|------|--------------|----------|--------|
| FEAT-01 | ⚪ Deferred | Medium | **Docker 容器沙箱**：MVP 使用进程级隔离（spawn 子进程）。Post-MVP 切为每个 AgentRun 独立 Docker 容器，挂载 repo 目录，强隔离、资源限额、可重放 | PRD §20 / 架构 §7 | 2026-04-22 | 架构审查 |
| FEAT-02 | ⚪ Deferred | Medium | **BullMQ / Kafka 消息队列**：MVP 用 Postgres SKIP LOCKED（5s 轮询）+ Redis pubsub。Postgres 在 >100 QPS 调度下会成为瓶颈，Post-MVP 迁移到 BullMQ（Redis）或 Kafka，支持 delayed / priority / 多消费者 | PRD §21 / 架构 §7 | 2026-04-22 | 架构审查 |
| FEAT-03 | ⚪ Deferred | Medium | **GitHub App Level 3 集成**：MVP 使用 Level 2（git + REST API / 本机 `gh` CLI）。Level 3 走 Installation Token，支持 Check Runs、Statuses、Commit Comments、Webhook 订阅（push / PR review） | PRD §22 / 架构 §7 | 2026-04-22 | 架构审查 |
| FEAT-04 | ⚪ Deferred | Low | **并行多 Agent 工作流**：MVP 全流程串行。Post-MVP 某些 Step 支持 fan-out（如"3 个 Reviewer 并行"，结果合并），状态机扩展 `aggregation` 节点，Runner 端支持并发子进程池 | 架构 §7 | 2026-04-22 | 架构审查 |
| FEAT-05 | ⚪ Deferred | Low | **云沙箱 / SaaS 模式**：MVP 强制本地 Runner。Post-MVP 提供托管 Runner 池（Firecracker microVM 或 E2B 类方案），复用同一 Runner API 契约，实现 SaaS + 自托管双模式 | PRD §20 / 架构 §7 | 2026-04-22 | 架构审查 |

---

## 代码审查遗留项（Review Round 6 产出）

| ID | 状态 | 优先级 | 描述 | 文件位置 | 提出日期 | 提出者 |
|----|------|--------|------|----------|----------|--------|
| REV-01 | 🟢 Done | Medium | **parseSSESegment 不可变重写 + join('\n') 修复**：改用 let 变量收集 id/event，dataLines[] 数组收集 data，最后一次性 `return { id, event, data: dataLines.join('\n') }`，消除全部 mutation | `packages/frontend/src/hooks/useSSEConnection.ts` | 2026-04-24 | Round-6 Review |
| REV-02 | 🟢 Done | Medium | **claim 路由 timeout NaN 防护**：querystring schema 加 `pattern: '^[0-9]+$'` 框架层拦截，handler 层加 `Number.isNaN` 双重保险；新增 400 测试 | `packages/backend/src/routes/runners.ts` | 2026-04-24 | Round-6 Review |
| REV-03 | 🟢 Done | Low | **claim 路由 200 成功路径测试**：向 Redis `runner:queue:<runnerId>` push 任务 ID 后 claim，断言 200 + body.data.id 匹配 | `packages/backend/test/routes/runners.test.ts` | 2026-04-24 | Round-6 Review |
| REV-04 | 🔵 Open | Low | **ClaimTaskParams/Querystring 与 JSON Schema 双重维护**：TypeScript 类型与 Fastify schema 各自独立，变更需同步修改两处。远期可引入 `@fastify/type-provider-zod` 或 `typebox` 消除冗余 | `packages/backend/src/routes/runners.ts:18-24, 67-80` | 2026-04-24 | Round-6 Review |

---

## MVP 功能缺口（完成度分析产出，2026-04-24）

> 基于代码扫描与 PRD §7/§9/§11/§20 对比，记录尚未实现的 MVP 范围内功能。

### Backend

| ID | 状态 | 优先级 | 描述 | 涉及文件 | 提出日期 |
|----|------|--------|------|----------|----------|
| GAP-B01 | 🟢 Done | High | **ack-task 路由**：`POST /api/v1/runners/:runnerId/tasks/:agentRunId/ack`，requireRunner 中间件 + runnerId 归属校验，返回 agent_run；新增 401/403/404/200 共 4 个集成测试 | `packages/backend/src/routes/runners.ts` | 2026-04-24 |
| GAP-B02 | 🔵 Open | High | **GitHub OAuth 初始登录流**：`auth.ts` 只有 `/refresh`，缺少 `/callback`（OAuth code exchange）和 `/login` 重定向端点 | `packages/backend/src/routes/auth.ts` | 2026-04-24 |
| GAP-B03 | 🟢 Done | High | **`GET /runs/:runId/steps` 已内嵌**：`GET /api/v1/runs/:runId` 已返回 `{ ...run, steps }`，`useRun.ts` 直接消费，无需独立端点 | `packages/backend/src/routes/runs.ts` | 2026-04-24 |
| GAP-B04 | 🔵 Open | Medium | **对象存储上传未接入**：`lib/r2.ts` 已有，但 AgentRun `input_payload_ref` / `output_payload_ref` 在路由层未写入 R2 | `packages/backend/src/routes/agent-runs.ts` | 2026-04-24 |
| GAP-B05 | 🔵 Open | Medium | **PR 创建端点 / Summarizer 触发**：Step 9（PR Summary）无对应后端逻辑，Summarizer agent role 缺调度 | `packages/backend/src/routes/runs.ts` 或新路由 | 2026-04-24 |
| GAP-B06 | 🔵 Open | Low | **Workspace update / delete 端点缺失** | `packages/backend/src/routes/workspaces.ts` | 2026-04-24 |

### Frontend

| ID | 状态 | 优先级 | 描述 | 涉及文件 | 提出日期 |
|----|------|--------|------|----------|----------|
| GAP-F01 | 🟢 Done | High | **Request Changes 已对接**：`RunDetailPage.tsx:68` 已将 `FindingSel.onSubmit` 连接至 `handleDecision({ action: 'request_changes', comment })` → `useSubmitDecision` → `POST /steps/:stepId/decision`；findings checkbox 列表（Review Agent 输出）推迟到 Batch 3+ 实现 | `packages/frontend/src/pages/RunDetailPage.tsx` | 2026-04-24 |
| GAP-F02 | 🔵 Open | High | **Edit Output 分栏编辑器缺失**：PRD §8 要求左侧只读 / 右侧可编辑 / live diff 面板，当前无此组件 | `packages/frontend/src/features/` | 2026-04-24 |
| GAP-F03 | 🔵 Open | High | **GitHub OAuth connect 前端流程**：FTUE 向导 Step 2 「Connect GitHub」按钮未与后端 OAuth 端点对接 | `packages/frontend/src/features/onboarding/FTUEWizard.tsx` | 2026-04-24 |
| GAP-F04 | 🔵 Open | Medium | **Agent 超时 UX**：心跳 >90s 后应将步骤图标切换为 warning 状态，并显示「Rerun / Take Over」，当前无此逻辑 | `packages/frontend/src/features/workflow-run/AgentBanner.tsx` | 2026-04-24 |
| GAP-F05 | 🔵 Open | Medium | **runner.status_changed SSE 事件消费**：后端会发出此事件，前端 SSE store 未处理，Runner 在线状态不实时更新 | `packages/frontend/src/stores/sse.store.ts` | 2026-04-24 |
| GAP-F06 | 🔵 Open | Low | **移动端简化审批视图**：PRD §12 要求移动端可提交 approve / request_changes | `packages/frontend/src/` | 2026-04-24 |
| GAP-F07 | 🔵 Open | Low | **浏览器 Push 通知**：步骤需要人工操作时推送通知 | `packages/frontend/src/` | 2026-04-24 |

### Runner

| ID | 状态 | 优先级 | 描述 | 涉及文件 | 提出日期 |
|----|------|--------|------|----------|----------|
| GAP-R01 | 🔵 Open | High | **Executor 实际 LLM 调用未完整实现**：executor.ts 框架存在，providers 目录有结构，但完整的「接收任务→调用 LLM→写文件→commit」循环未端到端打通 | `packages/runner/src/executor.ts` | 2026-04-24 |
| GAP-R02 | 🔵 Open | High | **WorkflowRun 创建时自动建 feature branch**：按 PRD §22 `aww/{workspace-slug}/{run-id-short}` 命名，git-worker 有 git 操作能力但建分支时机未接入 | `packages/runner/src/git-worker.ts` | 2026-04-24 |
| GAP-R03 | 🔵 Open | Medium | **command_logs secret 脱敏**：PRD §21 要求上传前按 redaction list 替换已知 secret 格式，当前未实现 | `packages/runner/src/executor.ts` | 2026-04-24 |
| GAP-R04 | 🔵 Open | Medium | **PR 创建（gh CLI）**：Step 9 完成后 runner 需调用 `gh pr create`，未实现 | `packages/runner/src/` | 2026-04-24 |

---

## 变更记录

| 日期 | 操作 | 详情 |
|------|------|------|
| 2026-04-22 | 初始建立 | 由架构审查 + Writing-Plans 阶段汇总 3 个 Prototype 数据层缺陷、2 个待确认协议、5 个 Post-MVP 功能项 |
| 2026-04-22 | 设计固化 | BUG-01/02/03 已修复（原型 FLOW_ST/FLOW_META 数据层）；INF-01/02 协议确认并落入 P2 plan；P1 BUILTIN_9STEP_TEMPLATE 补全字段（agentRole 名对齐 dispatcher、新增 seq/maxRetries/retryBackoffSeconds/dependsOnStepSeqs/preferredProvider）；架构 §4.5 OpenClawAdapter 协议细节补全 |
| 2026-04-22 | 最终契约清理 | CONTRACT-01/02/03/04/05 已完成；当前阶段无新增 Open/Blocked 项，Post-MVP 功能保持 Deferred |
| 2026-04-24 | Round-6 Review + 完成度分析 | 新增 REV-01~04（代码审查遗留项）；新增 GAP-B01~06 / GAP-F01~07 / GAP-R01~04（MVP 功能缺口，来自代码扫描与 PRD 对比） |
| 2026-04-24 | Batch 1 开发 | REV-01/02/03 修复完成；GAP-B01 ack-task 路由实现（含 4 测试）；GAP-B03/GAP-F01 确认已实现并标记 Done；backend 34 tests / frontend 27 tests 全过 |
