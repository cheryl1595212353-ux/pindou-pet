# 拼豆虚拟宠物 Web MVP 实施路线图

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将已批准的 Web MVP 规格拆成六个有硬门禁、可独立验证和提交的阶段，最终交付“三图生成同一只猫的 2.5D 拼豆角色—人工校正—五动作互动—实体图纸导出”的完整闭环。

**Architecture:** 采用 React/TypeScript/Vite/react-konva 前端、FastAPI 模块化单体、SQLite WAL、Redis + RQ 单 Worker 和独立 janitor。SQLite 与私有文件目录是事实源；Redis 只承载 ID 队列。所有昂贵阶段先持久化幂等键和检查点，外部生成全局串行；角色资产以可变草稿和不可变批准版本分离。

**Tech Stack:** Python 3.12、FastAPI、Pydantic v2、SQLAlchemy 2、Alembic、SQLite WAL、Redis 7、RQ、Pillow、ReportLab、pytest；Node.js 24 LTS、pnpm、React 19、TypeScript、Vite、react-konva、Vitest、Testing Library、Playwright。

## 0. 已批准基线

- 产品规格：[2026-07-16-pindou-pet-mvp-design.md](../specs/2026-07-16-pindou-pet-mvp-design.md)
- 规格状态：已批准并冻结为 Web MVP 实施基线。
- 本路线图不重新解释规格；若实施发现冲突，先提交规格变更并取得批准，再修改计划。
- “建模”只指二维／准二维角色生成、分层和动作绑定，不引入三维网格、骨骼蒙皮或完整视角旋转。

## 1. 不可越界的首版范围

- 只支持同一只猫的正面、猫左前、猫右前三张全身照；侧前视角允许 30°–60°。
- 输出固定为脸朝用户、身体向画面右侧约 20°、尾巴位于画面右侧的三分之四坐姿。
- 角色使用一个 58×58 全局网格、四块 29×29 底板、一套冻结品牌／系列色板和最多 32 色全局子色板。
- 必须包含身体、头、画面左前爪、画面右前爪、尾巴、眼睛六个逻辑组；可选语义组最多两个。变体和 `physicalExport=false` 辅助层不重复计数。
- 必须有呼吸、眨眼、摇尾、画面左爪抬起、点击弹跳五个动作。
- 只导出不可变批准资产的中立姿势；动画帧、草稿和数字辅助层不能进入实体图纸。
- 不做 AR、小程序、原生 App、账号、支付、并行跨设备同步、养成、社交、狗、多宠物、完整 3D、多品牌切换或并发公开运营；只提供匿名项目的单 owner 串行交接。

## 2. 阶段与硬门禁

| 阶段 | 计划 | 可验证交付物 | 进入下一阶段的门禁 |
| --- | --- | --- | --- |
| 0 | [基础设施与合同](2026-07-16-pindou-pet-phase-0-foundation.md) | 可启动的前后端骨架、迁移、OpenAPI→TS 单一合同、CI | `make check` 在干净检出中通过 |
| 1 | [三猫 Provider 可行性](2026-07-16-pindou-pet-phase-1-provider-feasibility.md) | 三猫私有实验、标准姿势、拆层／补全、58×58 预览、幂等恢复记录 | 三只全部通过身份、校正、动作、时间和 Provider 恢复合同；否则停线 |
| 2 | [项目、上传与生成管线](2026-07-16-pindou-pet-phase-2-project-pipeline.md) | 匿名项目、单 owner 交接、三槽上传、入口检查、串行生成、刷新／重启恢复 | 假 Provider 主路径、交接竞态和真实 Redis 恢复测试通过 |
| 3 | [高清与逐豆编辑器](2026-07-16-pindou-pet-phase-3-editors.md) | 分层资产、乐观锁校正、统一量化、逐豆编辑、不可变批准版本 | 六必需组、三检查门、资产校验和批准快照全部通过 |
| 4 | [互动与实体导出](2026-07-16-pindou-pet-phase-4-interaction-export.md) | 五动作房间、风险提示、PNG/PDF/四板/数量表 | 中立矩阵、五动作、四板重组和 approved-only 导出测试通过 |
| 5 | [可靠性、隐私与正式验收](2026-07-16-pindou-pet-phase-5-hardening-acceptance.md) | 崩溃注入、持续对账、TTL 删除、性能证据、五猫验收包 | 五只猫逐只通过所有量化门槛，`make check` 通过 |

### 门禁规则

- 阶段严格按 0→1→2→3→4→5 推进。
- Phase 1 是实施入口门，不是将来补做的研究任务。它未通过时不得开发 Phase 2–4 的完整页面。
- 生成候选必须证明既能原生接收客户端幂等键，又能按同一键查询并恢复同一供应商任务。缺少任一能力的 Provider 不得进入产品。
- 任一阶段门禁失败时，只允许修复该阶段或回退调整上游策略；不得以增加人工步骤、无限重试或降低评分阈值绕过。
- Phase 5 正式验收要求五只猫全部通过；平均值不能掩盖单猫失败。

## 3. 全局事实源与合同

### 3.1 API 与前端类型

- FastAPI/Pydantic OpenAPI 是公共 JSON 合同的唯一事实源。
- 公共 JSON 使用 `camelCase`；Python 内部使用 `snake_case`。
- 所有非 2xx API 错误统一为 `{error:{code,message,details?}}`；机器字段和问题列表只放在 `details`，不得另建扁平错误形状。
- `packages/contracts/openapi.json` 和生成的 `src/generated.ts` 提交进 Git。
- CI 重新生成后必须零差异；禁止手写第二套同名 TypeScript DTO。

### 3.2 项目与任务

```text
ProjectStatus:
  UPLOADED | PROCESSING | LAYER_REVIEW | BEAD_REVIEW | READY
  FAILED | CANCELLED | EXPIRED

JobStatus:
  QUEUED | SUBMITTING | SUBMIT_UNKNOWN | WAITING_PROVIDER
  SUCCEEDED | FAILED | CANCELLED

stage unique key:
  projectId + stage + inputHash + revision
```

- RQ 参数只能包含数据库 ID；图片、路径和 Provider 原始响应不能进入 Redis。
- SQLite 任务记录和检查点是事实源；RQ 丢任务后由对账器重建。
- `SUBMIT_UNKNOWN` 禁止自动重提，必须先按幂等键对账。
- 网络超时／5xx 最多自动重试一次；内容拒绝、照片不合格和用户不满意不自动循环。

### 3.3 角色资产

```text
mutable draft(revision)
  -> approve
immutable approvedAssetVersion(canonicalAssetHash)
  -> derive
neutralMatrix(58x58 cache)
  -> render with rendererVersion
PNG + PDF + board matrices + material counts
```

- `canonicalAssetHash` 覆盖高清层、拼豆层、变体、五动作、完整冻结色板和量化清单，不覆盖派生预览。
- 中立矩阵只从批准拼豆层派生，不能独立编辑。
- 导出缓存键为 `projectId + canonicalAssetHash + rendererVersion`；项目级 owner 鉴权发生在任何缓存读取／返回之前，渲染器升级不覆盖旧文件。

## 4. 全局验收常量

| 常量 | 冻结值 |
| --- | --- |
| 主网格 | 58×58 |
| 底板 | 4 × 29×29 |
| 自动子色板 | ≤32 色 |
| 初稿时间 | 空队列正常路径每只 ≤120 秒 |
| 重生成 | 完整 ≤1 次；局部 ≤2 次；累计生成等待 ≤300 秒 |
| 高清校正 | 5 猫中位数 ≤5 分钟；任一只 ≤10 分钟 |
| 身份评分 | 三评审平均 ≥4/5；任一猫 ≥3.5/5 |
| 互动首帧 | 最大值 ≤200ms，另报告 P95 |
| 动作帧时间 | P95 ≤33.3ms |
| 原图 TTL | 创建后 24 小时 |
| 未批准中间物 TTL | 最后活动后 24 小时，且创建后最多 7 天 |
| 批准资产 TTL | 最后一次真实用户访问后 180 天 |
| 派生导出 TTL | 创建后 24 小时 |
| 清理延迟 | 正常服务下到期后 ≤1 小时 |
| 所有权交接 | 32 随机字节；单次；10 分钟；每次仅一个 owner |

## 5. 跨阶段工程规则

- [ ] 每个功能先写能表达行为的失败测试，确认因预期原因失败，再写最少实现。
- [ ] 每个任务只修改计划中列出的文件；发现相邻问题单独记录，不顺手重构。
- [ ] 所有时间逻辑注入 `Clock`，所有随机行为注入 seed/RNG，测试不依赖真实等待。
- [ ] 所有二进制写入执行临时文件→`fsync`→内容哈希→原子改名→数据库引用的顺序。
- [ ] 每次外部调用和文件／数据库持久化前后检查项目墓碑。
- [ ] HTTP 写路由只在入口认证 `BrowserSession`，必须把 `browserSessionId` 传入服务；服务在实施 mutation 的同一个 `BEGIN IMMEDIATE` 中调用 `require_project_owner_in_transaction(projectId, browserSessionId)`。禁止复用事务外的 owner 判定。
- [ ] 私有猫照片、生成图、API 密钥、Base64、永久 URL、原始文件名和完整 Provider 响应不进入 Git 或日志。
- [ ] 交接 token 只存在于一次性响应、URL fragment 和同源 claim POST 的短暂内存中；不得进入 query/path、浏览器存储、日志、trace 或证据。
- [ ] Web 精细编辑只在 ≥1280×800 桌面视口验收；创建、进度、互动和导出预览另做移动视口验收。
- [ ] 任何开源代码移植前逐文件确认许可证，保留归属；不直接复制 Vue 页面进 React。
- [ ] 每个任务结束运行它的聚焦测试；每个阶段结束运行 `make check` 并检查工作树。

## 6. 环境前置条件

- 本机开发使用 Python 3.12 虚拟环境 `.venv`，不要用当前 Python 3.13 作为 ML Provider／分割兼容性的证明。
- Node 使用 24 LTS，包管理器固定 pnpm；提交 `pnpm-lock.yaml`，不生成 `package-lock.json`。
- Phase 0 单元测试可使用内存 fake queue；Phase 2 门禁必须连接真实 Redis 7，fake Redis 不算集成证明。
- 开发机尚未安装 Redis 时，在执行 Phase 2 前安装并启动；CI 从 Phase 0 起提供真实 Redis service。
- Provider 密钥只从环境变量读取；`.env.example` 只列变量名和安全说明。

## 7. 总体验证与交付顺序

- [ ] 按 Phase 0 计划建立骨架并通过合同漂移检查。
- [ ] 执行 Phase 1 私有三猫实验；只在硬门禁通过后冻结 Provider manifest。
- [ ] 完成 Phase 2 匿名创建、两端串行所有权交接、三图上传、生成任务和恢复主路径。
- [ ] 完成 Phase 3 高清校正、统一量化、逐豆编辑和不可变批准版本。
- [ ] 完成 Phase 4 五动作互动及 approved-only PNG/PDF 导出。
- [ ] 完成 Phase 5 崩溃／删除／隐私／性能证据和正式五猫验收。
- [ ] 运行最终命令：

```bash
RUN_REDIS_TESTS=1 PINDOU_REDIS_URL=redis://127.0.0.1:6379/15 make check
git diff --check
git status --short
```

Expected: `make check` 退出码 0；`git diff --check` 无输出；提交计划内的实现后工作树为空。

## 8. 容量升级触发器

以下任一条件出现时停止沿用当前单机假设，先写新规格：同时处理两个以上外部生成任务、账号体系、并行多 owner 同步／协作、规模化跨设备访问、公开运营、备份／灾备或跨主机部署。届时再评审 PostgreSQL、对象存储和分布式任务系统；本 MVP 的一次性串行交接不预先引入它们。
