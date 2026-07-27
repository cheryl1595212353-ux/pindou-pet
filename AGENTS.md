# AGENTS.md

本文件适用于整个仓库，供 Codex、Claude Code、Cursor 等 AI 编程代理快速
理解项目、选择正确入口并安全地完成修改。

用户当前请求始终优先于本文件。如果用户请求与这里记录的项目事实发生冲突，
先指出冲突和影响，不要静默选择一种解释。

## 1. 60 秒项目定位

- 当前默认产品是一个本地运行的 **2D 互动像素宠物前端**。
- 首页路由 `/` 直接渲染 `PixelDogStudio`，不需要 API、Redis 或外部 AI。
- 当前固定规模为 **5 只宠物、6 个场景、14 个状态**。
- 当前产品重点是宠物切换、场景切换、精灵图动画和鼠标、触摸、键盘互动。
- 当前产品不包含照片上传、自动生成宠物、3D、体素、OBJ、WebGL、AR、
  账号、云端保存、商城或可用的导出流程。
- `apps/web/src/app/voxel/` 和 `experiments/` 中包含历史实验代码，但它们
  没有接入当前默认首页。除非用户明确要求，不要把它们重新接入产品。
- 仓库保留 FastAPI、Redis、数据库迁移和 OpenAPI 合同基础设施，但运行
  当前 2D 首页不依赖这些服务。

快速启动：

```bash
nvm use
corepack enable
pnpm install --frozen-lockfile
pnpm --filter @pindou/web dev --host 127.0.0.1
```

浏览器访问 `http://127.0.0.1:5173/`。

## 2. 推荐阅读顺序与事实优先级

不要先通读所有历史计划。按以下顺序获取当前上下文：

1. `README.md`
2. `docs/product/interactive-pixel-dog-feature-spec.md`
3. `docs/product/multi-pet-frontend-design-features.md`
4. `apps/web/src/app/pixel-dog/PixelDogStudio.tsx`
5. `apps/web/src/app/pixel-dog/pixelDogModel.ts`
6. `apps/web/src/app/pixel-dog/petCatalog.ts`
7. `apps/web/src/app/pixel-dog/sceneCatalog.ts`
8. 同目录测试和 `apps/web/src/app/App.test.tsx`
9. 与当前任务直接相关的 API、合同或历史文件

事实层级：

- 产品规格描述“应该是什么”。
- 当前代码、测试和资源清单描述“现在实际是什么”。
- 两者不一致时，必须报告差异，不能用测试通过替代产品确认。
- `docs/qa/*.json` 只证明其记录提交上的验收结果，不自动证明当前工作树。
- `docs/superpowers/` 是历史设计和实施记录，不是当前产品入口。

## 3. 仓库地图

| 路径 | 作用 | 修改时机 |
| --- | --- | --- |
| `apps/web/src/app/pixel-dog/` | 当前 2D 宠物页面、状态机和目录 | 互动、宠物、场景或状态修改 |
| `apps/web/public/pixel-dog/` | 宠物基础图、精灵图、manifest 和场景图 | 明确要求修改视觉资源时 |
| `apps/web/src/app/styles.css` | 当前页面和历史页面的共享样式 | 前端布局与视觉修改 |
| `apps/web/src/app/router.tsx` | 路由和产品外壳 | 路由边界或入口修改 |
| `apps/web/src/app/voxel/` | 未接入首页的历史 3D/体素实验 | 只有用户明确要求时 |
| `apps/api/` | FastAPI 基础设施和测试 | API、存储、队列或健康检查任务 |
| `packages/contracts/` | OpenAPI 快照和 TypeScript 合同 | API 合同改变时 |
| `migrations/` | Alembic 数据库迁移 | 数据库结构改变时 |
| `docs/product/` | 当前功能规格和设计说明 | 产品合同改变时同步更新 |
| `docs/qa/` | 可机器读取的验收记录 | 完成对应真实验收后更新 |
| `docs/superpowers/` | 历史计划和设计记录 | 仅用于追溯，不作为默认实现依据 |
| `experiments/` | 历史原型 | 不要在普通产品修改中扩展 |
| `tools/` | 本地资源准备和视觉原型脚本 | 明确需要重新生成资源时 |

常见任务入口：

- 页面视觉：`PixelDogStudio.tsx`、`styles.css`、相关组件测试。
- 新增宠物：`petCatalog.ts`、宠物资源目录、manifest、资源测试。
- 新增场景：`sceneCatalog.ts`、场景资源、目录测试。
- 新增互动：`pixelDogModel.ts`、`PixelDogStudio.tsx`、样式和状态机测试。
- API 修改：`apps/api/`、OpenAPI 快照、生成合同和迁移。

## 4. 不得静默破坏的产品合同

### 宠物与场景

当前宠物 ID：

```text
doubao  jinbao  xuetuan  keke  jutuan
```

对应豆包（红柴犬）、金宝（金毛）、雪团（比熊）、可可（棕色泰迪）和
橘团（橘色异国短毛猫）。

当前场景 ID：

```text
living-room  garden  beach  snow-cabin  camping  rooftop
```

### 状态与时间

当前 14 个状态定义在 `pixelDogModel.ts`：

```text
idle
moving-right
moving-left
happy
jumping
sleeping
waiting
feeding
petting
playing-ball
grooming
bathing
dancing
posing
```

- 无输入 12 秒进入等待。
- 无输入 30 秒进入睡眠。
- 水平活动范围为舞台的 `8-92`。
- 一次性动作完成后返回 `idle`。
- 新的有效输入可以唤醒宠物并重新计算等待时间。

### 精灵图与资源

- 宠物基础图为 `128×128` PNG。
- 精灵图单帧为 `192×208`，8 列、9 行，总尺寸为 `1536×1872`。
- 左右移动使用独立动画行，不要通过 CSS 镜像伪造方向。
- 宠物和场景资源必须继续使用仓库内的本地路径。
- 未经用户明确允许，不得替换、重绘或批量重新生成现有资源。
- 不得引入运行时 CDN 图片、远程字体或未经批准的大型依赖。

### 输入与无障碍

必须保留：

- 鼠标点击。
- 触摸和长按抚摸。
- 左右移动按钮。
- 键盘方向键。
- 原生焦点顺序和清晰焦点样式。
- 状态与场景的可访问播报。
- 图集加载错误提示。
- `prefers-reduced-motion: reduce` 下可用的静态或简化体验。

## 5. 本地运行

### 只运行当前 2D Web 产品

要求：

- Node.js 24（见 `.nvmrc`）
- pnpm 11.9.0（见根目录 `package.json`）

首次安装：

```bash
nvm use
corepack enable
pnpm install --frozen-lockfile
```

启动：

```bash
pnpm --filter @pindou/web dev --host 127.0.0.1
```

当前首页不调用后端，因此不要为了查看 2D 页面额外启动数据库或 Redis。

### 可选 API 基础设施

只有任务涉及后端时才需要：

```bash
uv python install 3.12
uv sync --frozen --extra dev
cp .env.example .env
mkdir -p var
PINDOU_DATABASE_URL=sqlite:///var/pindou.db \
  .venv/bin/python -m alembic upgrade head
```

启动 API：

```bash
PYTHONPATH=apps/api/src \
  .venv/bin/python -m uvicorn \
  pindou_pet.main:create_app \
  --factory \
  --host 127.0.0.1 \
  --port 8000
```

需要让 Vite 开发服务器代理 `/api` 时：

```bash
PINDOU_API_ORIGIN=http://127.0.0.1:8000 \
  pnpm --filter @pindou/web dev --host 127.0.0.1
```

`PINDOU_API_ORIGIN` 只影响 Vite 的开发和预览代理，不会自动为生产静态
构建配置反向代理。

## 6. 测试与验收矩阵

开始前先查看工作树：

```bash
git status --short --branch
```

文档改动至少执行：

```bash
git diff --check
```

Web 逻辑、样式或资源改动执行：

```bash
pnpm --dir apps/web test
pnpm --dir apps/web typecheck
pnpm --dir apps/web build
```

API、合同、迁移或仓库级改动执行：

```bash
uv sync --frozen --extra dev
make check
```

Redis 真实集成检查：

```bash
docker run --rm --name pindou-redis \
  -p 127.0.0.1:6379:6379 redis:7-alpine

RUN_REDIS_TESTS=1 \
PINDOU_REDIS_URL=redis://127.0.0.1:6379/15 \
make redis-smoke
```

没有设置 `RUN_REDIS_TESTS=1` 时，Redis 测试按设计显示 skipped，不能报告成
真实 Redis 集成已经通过。

### 视觉改动的额外要求

至少实际检查：

```text
1440×900
578×863
390×844
```

检查以下内容：

- 页面没有横向溢出。
- 宠物、状态气泡和互动道具不被裁切。
- 主要按钮容易看到和操作，最小触摸尺寸不低于 `44×44px`。
- 宠物移动到两侧时仍在舞台内。
- 场景切换和全部互动有正确视觉反馈。
- 键盘焦点、状态播报和减少动态模式仍然可用。
- 浏览器控制台没有相关 error 或 warning。

自动测试、类型检查和构建通过，不等于真实浏览器视觉验收通过。报告结果时
必须明确区分这几类证据。

## 7. 生产构建与部署

### 当前真实状态

本仓库目前没有 Dockerfile、Vercel、Netlify、Cloudflare、Render 或其他
正式生产部署配置。不要把“能够构建”写成“已经部署”。

前端生产构建：

```bash
pnpm --dir apps/web build
```

静态产物：

```text
apps/web/dist/
```

部署静态前端时必须确认：

- 静态服务器将未知前端路由回退到 `index.html`。
- `/pixel-dog/...` 等绝对资源路径从站点根路径提供。
- 如果部署在域名子目录下，需要同时处理 Vite `base`、绝对资源路径和路由。
- 当前根页面无需 API；未来使用 API 时，生产环境必须单独配置 `/api`
  反向代理或正式 API 地址。
- 密钥和生产环境变量只写入部署平台的安全配置，不进入 Git。

GitHub Pages 默认使用仓库子路径，而当前 Vite 和资源路径按域名根路径设计。
没有完成 `base`、资源路径和 SPA 回退适配前，不要直接宣称支持 GitHub
Pages。

### 执行部署前

1. 明确目标平台、域名以及仅前端还是全栈部署。
2. 获取用户对部署和外部状态变更的明确授权。
3. 在准备部署的确切提交上运行相应检查。
4. 记录构建命令、环境变量名称和部署产物目录。
5. 部署后检查首页、资源请求、关键互动、控制台和直接路由访问。
6. 报告平台、提交 SHA、生产 URL、验证结果和回滚方式。

没有生产 URL 和线上验证证据时，只能报告“构建完成”或“部署配置已准备”，
不能报告“部署成功”。

## 8. 修改代码和 Git 的工作规则

- 先检查 `git status`、当前分支和相关文件，再提出修改。
- 保护用户已有的未提交改动，不覆盖、不格式化、不清理无关文件。
- 只修改当前任务直接需要的代码，避免顺手重构。
- 如果发现无关死代码或历史问题，只报告，不在同一次修改中删除。
- 优先使用 `rg` 和 `rg --files` 定位内容。
- 文档使用仓库相对路径，不写本机 `/Users/...` 等绝对路径。
- `.env`、密钥、token、`var/`、私有图片和本地数据库不得提交。
- 不运行破坏性 Git 命令，不使用 `git reset --hard` 或强制推送。
- 未经用户明确授权，不 stage、commit、push、创建 PR 或部署。
- 用户明确要求推送 `main` 时，先 fetch 并验证可以普通快进；如果出现分叉，
  停止并报告，不要强推覆盖。
- 提交前检查暂存区，确保每个文件都属于当前任务。

## 9. 当前已知边界与风险

创建本文件时的代码基线为 `bffde49`：

- `/projects/:projectId/edit`、`room` 和 `export` 仍是占位或边界页面。
- `apps/web/src/app/voxel/` 中的历史代码仍参与部分测试，但未接入默认首页。
- 仓库没有正式部署配置。
- 仓库尚未添加 `LICENSE`。
- `docs/qa/multi-pet-scenes-interactions-qa.json` 记录的是较早提交上的浏览器
  基线，不能直接作为最新视觉版本的验收结果。
- 最新视觉版在 `390×844` 下存在一个尚未实屏复验的评审风险：舞台的
  `minmax(320px, 50svh)` 和上方选择区可能使主要互动按钮落到首屏下方。
  修复或否定该问题前，必须用真实浏览器重新测量，不能只依靠静态推算。

如果这些边界后来发生变化，应同时更新本节及相应产品/QA 文档。

## 10. 推荐任务流程

1. 用一句话复述目标和成功标准。
2. 检查状态、阅读最小必要文件并确认当前行为。
3. 对可能改变产品方向的歧义先提出问题。
4. 做最小、可追溯的修改。
5. 运行与改动风险匹配的测试。
6. 如果涉及视觉，提供真实浏览器证据或明确说明未完成。
7. 检查最终 diff，不夹带生成文件或无关清理。
8. 只在用户明确授权后执行提交、推送或部署。

## 11. 完成时的报告要求

最终交付至少说明：

- 实际修改了哪些文件。
- 实现了哪些可观察行为。
- 执行了哪些命令及其真实结果。
- 哪些检查没有执行以及原因。
- 是否进行了真实浏览器视觉验收。
- 是否改变了外部状态，例如提交、推送或部署。

如果进行了部署，还必须提供：

- 部署平台和环境。
- 确切提交 SHA。
- 可访问的生产 URL。
- 线上关键路径验证结果。
- 已知限制和回滚方式。

不要使用“应该可以”“大概通过”代替可复核证据。
