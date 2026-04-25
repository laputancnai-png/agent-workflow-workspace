# AWW PRD 多角色头脑风暴审查报告

**审查日期：** 2026-04-21  
**审查对象：** docs/PRD.md（v1）+ index.html（静态原型）  
**参与角色：** 后端架构师 · 前端工程师 · 测试工程师 · 产品设计师 · 客户端/集成工程师  
**核心聚焦：** 逻辑闭环 · 技术可行性

---

## 总体评估

PRD v1 在产品愿景、工作流设计和数据模型草稿上打下了良好基础，但存在若干**架构级空白**，不解决将导致 MVP 无法端到端跑通。5 个 Agent 共发现 **35 个具体问题**，其中 9 个为跨角色共识问题（2个以上 Agent 独立指出），12 个为严重或极高级别。

---

## 一、跨角色共识问题（最高优先级）

这些问题被 2 个或以上独立 Agent 标记，是 PRD 最需要补充的核心缺口。

---

### ★★★ C1：Agent 执行环境架构未定义
**发现者：** 客户端 Agent（严重）+ 后端 Agent（严重）+ 前端 Agent（严重）

**问题：** PRD 同时列了"本地 git 工作区"和"基础 shell 命令执行"，但没有定义 Coding Agent 实际在哪里运行：
- **路径 A**：GitHub API 模式（AWW 是纯 Web SaaS，通过 GitHub API 读写文件，不需要本地 clone）
- **路径 B**：云沙箱模式（AWW 服务端 clone 仓库，Agent 在服务端运行 shell，代码上传到 AWW 服务器）
- **路径 C**：本地 Runner 模式（类似 GitHub Actions self-hosted runner，用户在本地运行 Agent Runner，代码不离开用户环境，AWW 云端只做调度和制品存储）

三条路径在安全模型、部署形态、"shell 执行"需求实现上完全不同。

**影响：** 这是所有技术决策的地基。Git 分支策略、Take Over UX、安全边界、前端实时同步方案，全部依赖这个决策。不解决则 9 步工作流的最后 3 步（Review → 审批 → PR）是空中楼阁。

**建议：** MVP 推荐路径 C（本地 Runner 模式），原因：同时满足"shell 执行"和"敏感数据不暴露"，对企业用户最友好。需在 PRD 新增"执行环境架构"章节，明确：执行环境类型、Runner 注册机制、代码是否经过 AWW 服务端。

---

### ★★★ C2："Take Over"交互闭环完全缺失
**发现者：** 设计师（极高）+ 前端 Agent（高）+ 客户端 Agent（中）

**问题：** PRD 在 §8 和 §11 多次提到"take over the step manually"，但三个问题完全未回答：
1. 用户接管后在哪里工作？（浏览器内嵌编辑器 vs 跳转本地 IDE）
2. AWW 如何感知用户已完成接管？（git push webhook？手动"Mark as Done"？）
3. 接管完成后，用户产出如何以 Artifact 形式重新接入工作流？

PRD §6 明确"不做新 IDE"，但没有 IDE 集成，Take Over 体验会极度割裂。

**影响：** "Take Over"是"人在回路"价值主张的最后兜底机制，也是用户在 Agent 出问题时最需要的安全阀。这个功能体验断裂，系统可信度崩塌。

**建议：** MVP 采用最简方案：用户接管时，AWW 展示"本地操作指引"（分支名 + 任务说明），用户在本地 IDE 完成后 push，AWW 通过 GitHub Webhook 或轮询检测新 commit 后自动标记完成。需在 PRD 中完整描述这个交互循环。

---

### ★★★ C3：人工审批门语义不完整（Request Changes / Edit Output）
**发现者：** 设计师（极高）+ 后端 Agent（中高）+ 前端 Agent（高）

**问题：** PRD 的 Decision 实体定义了 action 枚举，但 `edit` 和 `request_changes` 的完整语义缺失：
- 用户点击"Request Changes"后：在哪里写说明？如何转化为 Agent 输入？工作流如何回退？
- 用户点击"Edit Output"后：打开什么界面？编辑后创建新 Artifact 还是覆盖原制品？是否需要再点 Approve 才推进？
- `request_changes` vs `reject` 的区别是什么？回滚到哪个步骤？

**影响：** 这是 AWW 区别于"给 Agent 发指令"和"在 GitHub 写评论"的核心差异化功能。流程断裂时，用户对系统信任立即崩溃。同时，后端 Decision 模型和前端交互无法对齐。

**建议：** 在 PRD §8 或 §13 中补充完整的"Request Changes 闭环"流程描述：Finding Selector 界面 → 说明提交 → 自动创建 fix tasks → 触发 Agent 重跑 → 步骤状态更新 → 审计日志记录。明确 Artifact 不可变原则：edit 操作创建新版本 Artifact，保留原制品。

---

### ★★ C4：Artifact 版本化协议缺失
**发现者：** 后端 Agent（严重）+ 前端 Agent（高）+ 测试 Agent（严重）

**问题：** PRD 核心价值主张是"所有制品留存在共享工作区"，但 Artifact 数据模型没有：
- `version`/`parent_id`（无法追踪编辑谱系）
- `status`（没有 draft/committed/superseded/invalidated 生命周期）
- `role`（下游 Agent 无法语义化查找所需制品类型）

Edit 操作如果直接修改 `Artifact.content`，审计性（核心卖点）在第一次人工编辑时就被打破。

**建议：** 补充字段：`role: enum`（PRD/PLAN/TASK_LIST/CODE_PATCH/TEST_REPORT/REVIEW_COMMENT/PR_SUMMARY）、`status: enum`（draft/committed/superseded）、`parent_artifact_id`（编辑谱系）、`git_commit_sha`（与 Git 关联）、`version: integer`（乐观锁）。

---

### ★★ C5：WorkflowStep 状态机未正式定义
**发现者：** 后端 Agent（高）+ 测试 Agent（高）

**问题：** PRD 多处依赖步骤状态（pending/running/completed/failed/retrying），但没有正式的状态机定义：
- 合法状态枚举
- 状态转换条件和触发者
- Agent 超时的自动转换规则
- `request_changes` 后的回滚规则
- AgentRun 心跳超时的处理

没有状态机，断点重试、Agent 超时检测、并发控制都无法可靠实现。

**建议：** 在 PRD 中新增"WorkflowStep 状态机"附录，用状态转移图定义：`pending → running → {completed | failed | timed_out} → retrying → running`，以及 AgentRun 心跳机制（建议每 30s 更新 `last_heartbeat_at`，Watchdog 检测超时）。

---

### ★★ C6：实时推送机制未定义
**发现者：** 前端 Agent（严重）+ 后端 Agent（高）

**问题：** Agent 在后台运行时，前端如何得知状态变化？PRD 完全没有定义推送协议（WebSocket / SSE / polling）。这个决策影响：
- 所有"Agent 运行中"UI 组件的架构
- 审计日志流动、步骤状态颜色切换
- Agent 超时的用户感知

**建议：** 推荐 SSE（单向推送，防火墙友好，自动 reconnect）用于 AgentRun 状态流。定义最小事件类型集：`step.status_changed`、`agent_run.started`、`agent_run.completed`、`agent_run.failed`、`artifact.created`。在 NFR §12 中补充实时通信协议选型和 Agent 超时时间定义。

---

### ★★ C7：安全边界与凭证模型空白
**发现者：** 后端 Agent（严重）+ 客户端 Agent（高）

**问题：** PRD 说"敏感仓库数据不应暴露"，但没有定义：
- GitHub Token 存储位置（浏览器 localStorage？服务端加密存储？本地 keychain？）
- LLM API Key 由谁持有和调用（用户浏览器直接调用 vs AWW 服务端代理）
- 代码文件内容是否经过并持久化在 AWW 服务端
- Agent 执行环境的隔离机制（裸机进程？Docker 容器？gVisor？）

**建议：** 在 PRD 新增"凭证与数据流向"章节，明确四个点：①GitHub Token 服务端加密存储；②LLM API Key 用户自持，浏览器或 Runner 直接调用，AWW 服务端不经手；③代码文件不在 AWW 服务端持久化；④Agent 执行环境 Docker 隔离，每次 AgentRun 独立容器。

---

### ★★ C8：Git 分支策略完全空白
**发现者：** 后端 Agent（严重）+ 客户端 Agent（中高）

**问题：** 多个 Coding Agent 在同一 repo 工作，但 PRD 完全没有：
- WorkflowRun 的 feature branch 命名规则和生命周期
- 每个 Agent 是否有独立 worktree/branch
- 多 Agent 输出的合并策略（顺序 merge？cherry-pick？squash？）
- Git 凭证注入方式

**建议：** MVP 采用"每个 WorkflowRun 一个 feature branch"模型（命名：`aww/{run_id}`），从 default_branch 切出，多 Coding Agent 串行提交到同一 feature branch，Review Agent 对 `feature_branch vs default_branch` 做 diff，最终 PR 由 AWW 自动创建（不自动 merge）。在 WorkflowRun 增加 `feature_branch` 和 `base_commit_sha` 字段。

---

## 二、各角色独特发现（次优先级）

### 后端
- **B1** Agent 调度触发机制未定义（polling？事件驱动？）— 建议 MVP 用数据库 polling（5s），后期迁移消息队列
- **B2** 断点重试幂等性：AgentRun 无 checkpoint_data，重试时 draft Artifact 如何处理未定义

### 前端
- **F1** 错误态 UI 完全缺失：step icon 无 error/failed 状态，`--red` CSS 变量存在但无步骤使用它
- **F2** Handoff Map（6节点）与步骤列表（9步）信息冗余且节点数不对应，Handoff Map 无交互
- **F3** WorkflowTemplate 实体在数据模型中缺失，"Workflows" Rail 图标是无目的占位符

### 测试
- **T1** TestResultArtifact schema 未定义，步骤放行门控条件（pass gate）未定义 — 质量门失效
- **T2** 人工审批步骤无 programmatic 接口（`POST /approvals/{id}/decision`），CI 中无法自动化测试
- **T3** 成功指标（§16）的数据来源字段和统计口径未定义，无法度量

### 设计师
- **D1** 心智模型分裂：界面同时暗示"工作流管理者"、"代码评审者"、"Agent 调度员"三种角色，主操作不明确
- **D2** 核心 Task Flow 缺失：PRD 只描述系统数据流，没有描述用户操作路径（如"从打开应用到首次运行工作流的 8 步路径"）
- **D3** 空状态与首次使用体验（FTUE）完全缺失 — 直接影响激活率
- **D4** 移动端策略未表态：当前响应式代码只防止布局崩溃，不是移动优先体验

### 客户端/集成
- **I1** GitHub 集成粒度未定义（git-only / REST API / GitHub App 三级），影响权限申请和安全评审
- **I2** Agent 上下文传递机制未定义（全量制品 vs 摘要 vs 向量检索），上下文窗口溢出无策略
- **I3** 模型配置粒度未定义（workspace 级 vs step 级路由）

---

## 三、优先级矩阵

| # | 问题 | 严重程度 | 是否阻断 MVP | 发现角色数 |
|---|------|---------|------------|-----------|
| C1 | Agent 执行环境架构 | ★★★ | 是 | 3 |
| C2 | Take Over 交互闭环 | ★★★ | 是 | 3 |
| C3 | 审批门语义（Request Changes / Edit） | ★★★ | 是 | 3 |
| C4 | Artifact 版本化协议 | ★★ | 是 | 3 |
| C5 | WorkflowStep 状态机 | ★★ | 是 | 2 |
| C6 | 实时推送机制 | ★★ | 是 | 2 |
| C7 | 安全边界与凭证模型 | ★★ | 是 | 2 |
| C8 | Git 分支策略 | ★★ | 是 | 2 |
| T1 | TestResultArtifact schema | ★★ | 是 | 2 |
| D3 | 空状态与 FTUE | ★★ | 是（激活率） | 1 |
| D2 | 核心 Task Flow 缺失 | ★★ | 是（开发对齐） | 1 |
| F1 | 错误态 UI | ★ | 否（但影响体验） | 1 |
| T2 | 审批步骤可测试性 | ★ | 否 | 1 |
| I1 | GitHub 集成粒度 | ★ | 否（但影响 demo） | 1 |
| 其他 | B2、F2、F3、B1、T3、D1、D4、I2、I3 | 低 | 否 | 1 |

---

## 四、建议的 PRD v2 补充章节

基于以上分析，建议在 PRD v2 中新增或扩充以下章节：

1. **§X 执行环境架构决策**（ADR）：选型（推荐本地 Runner）、Runner 注册机制、代码数据边界
2. **§X 安全与凭证模型**：GitHub Token 存储、LLM API Key 归属、代码不落 AWW 服务端承诺、Agent 沙箱规格
3. **§X Git 工作区策略**：feature branch 命名、分支生命周期、多 Agent 串行化机制、PR 创建规则
4. **§X WorkflowStep 状态机**（附录）：状态枚举、转换条件、AgentRun 心跳与超时规则
5. **§13 扩充：核心 Task Flow**（用户操作路径，非数据流）：Task Flow A（首次运行）、Task Flow B（Request Changes 闭环）、Task Flow C（Take Over 闭环）
6. **§13 扩充：首次使用体验（FTUE）**：空状态视图、3 步新建工作区向导、Agent 运行等待状态
7. **§X 制品规范**：Artifact 角色枚举、TestResultArtifact schema、步骤放行门控条件
8. **§12 扩充（NFR）**：实时推送协议选型、事件类型枚举、移动端策略声明

---

*报告生成：5 Agent 并行审查综合 · 2026-04-21*
