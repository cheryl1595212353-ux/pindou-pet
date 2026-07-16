# Phase 0：基础设施与合同 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 从当前只有规格文档的仓库建立最小可运行、可测试的 Web/API 单体骨架，并冻结 OpenAPI→TypeScript、Provider、存储和队列边界，供后续阶段在不重复定义合同的前提下实现。

**Architecture:** FastAPI 应用工厂和 React SPA 各自独立启动，根目录用 pnpm workspace 和 Makefile 统一命令。FastAPI/Pydantic 生成的 OpenAPI 是公共 JSON 唯一事实源；TypeScript 类型由它生成。Phase 0 只创建 SQLite、存储、队列和 Provider 的协议及 fake，不调用真实 AI，不实现业务页面。

**Tech Stack:** Python 3.12、FastAPI、Pydantic v2、SQLAlchemy 2、Alembic、pytest；Node.js 24 LTS、pnpm、React 19、TypeScript、Vite、Vitest、Testing Library；CI 使用 GitHub Actions 和 Redis 7 service。

## Global Constraints

- 先确认 Python 3.12、Node 24 LTS 和 pnpm 可用。当前机器上的 Node 25／Python 3.13 只能用于阅读，不能作为本项目冻结运行时。
- Python 虚拟环境固定为根目录 `.venv`；所有计划命令用 `.venv/bin/python`。
- 只提交 `pnpm-lock.yaml`，禁止产生 `package-lock.json` 或 npm workspace 配置。
- 公共 JSON 字段使用 camelCase；Python 域模型使用 snake_case，通过 Pydantic alias generator 转换。
- 任何任务运行 `make contracts` 都必须同时提交 `packages/contracts/openapi.json` 与 `packages/contracts/src/generated.ts`，提交命令统一使用 `git add packages/contracts`；后续计划只列 generated 文件时仍受此规则约束。
- 所有非 2xx API 错误使用唯一包络 `{error:{code,message,details?}}`；`details` 是可选 camelCase 对象，业务阶段不得返回第二套扁平错误 JSON。
- 测试不连接真实 Provider；Phase 0 的 Redis smoke test只证明环境连接，完整 RQ 生命周期留给 Phase 2。
- 私有运行数据全部位于忽略的 `var/`；密钥只从环境变量读取。
- 每个 Task 完成后单独提交；不得提前创建上传、生成、编辑器或导出功能。

---

## Task 0.1：冻结仓库布局、运行时和一键命令

**Files:**

- Modify: `.gitignore`
- Create: `.env.example`
- Create: `.python-version`
- Create: `.nvmrc`
- Create: `pyproject.toml`
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `Makefile`
- Create: `README.md`
- Create: `apps/api/src/pindou_pet/__init__.py`
- Create: `apps/api/tests/conftest.py`

### Step 1：写失败的仓库布局检查

- [ ] 创建 `apps/api/tests/test_repository_layout.py`，先约束运行时和私有路径：

```python
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]


def test_runtime_and_private_paths_are_declared() -> None:
    assert (ROOT / ".python-version").read_text().strip() == "3.12"
    assert (ROOT / ".nvmrc").read_text().strip() == "24"
    ignore = (ROOT / ".gitignore").read_text()
    assert "var/" in ignore
    assert ".env" in ignore
```

- [ ] 运行：

```bash
python3.12 -m venv .venv
.venv/bin/python -m pip install --upgrade pip
.venv/bin/python -m pip install pytest
.venv/bin/python -m pytest apps/api/tests/test_repository_layout.py -q
```

Expected: FAIL，指出 `.python-version`、`.nvmrc` 或根配置不存在；失败原因不是导入错误。

### Step 2：写最小根配置

- [ ] `pyproject.toml` 只建立一个可编辑安装的 Python 包和开发依赖：

```toml
[build-system]
requires = ["setuptools>=75", "wheel"]
build-backend = "setuptools.build_meta"

[project]
name = "pindou-pet-api"
version = "0.1.0"
requires-python = ">=3.12,<3.13"
dependencies = [
  "alembic>=1.14,<2",
  "fastapi>=0.115,<1",
  "httpx>=0.28,<1",
  "pillow>=11,<13",
  "pydantic-settings>=2.7,<3",
  "python-dotenv>=1,<2",
  "redis>=5,<7",
  "reportlab>=4.2,<5",
  "rq>=2,<3",
  "sqlalchemy>=2.0,<3",
  "uvicorn[standard]>=0.34,<1",
]

[project.optional-dependencies]
dev = [
  "pytest>=8.3,<10",
  "pytest-cov>=6,<8",
  "ruff>=0.9,<1",
]

[tool.setuptools.packages.find]
where = ["apps/api/src"]

[tool.pytest.ini_options]
testpaths = ["apps/api/tests", "tests"]
markers = [
  "redis: requires a real Redis server",
  "live_provider: calls the frozen external provider",
]

[tool.ruff]
line-length = 100
target-version = "py312"
```

- [ ] `package.json` 与 workspace：

```json
{
  "name": "pindou-pet",
  "private": true,
  "packageManager": "pnpm@11.9.0",
  "scripts": {
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "typecheck": "pnpm -r typecheck",
    "contracts:check": "pnpm --filter @pindou/contracts contracts:check"
  }
}
```

```yaml
packages:
  - apps/*
  - packages/*
```

- [ ] `.gitignore` 至少包含：

```gitignore
.env
.venv/
node_modules/
dist/
.pytest_cache/
.ruff_cache/
__pycache__/
*.pyc
var/
.artifacts/
playwright-report/
test-results/
```

- [ ] `.env.example` 只声明非秘密示例：

```dotenv
PINDOU_ENV=development
PINDOU_DATABASE_URL=sqlite:///var/pindou.db
PINDOU_STORAGE_ROOT=var/storage
PINDOU_REDIS_URL=redis://127.0.0.1:6379/15
PINDOU_SESSION_SECRET=set-a-random-local-value
PINDOU_GENERATION_API_KEY=
```

- [ ] `Makefile` 暴露稳定入口；recipe 必须调用子命令，不能把测试逻辑写进 shell：

```make
PY := .venv/bin/python

.PHONY: install test lint typecheck build contracts contracts-check check
install:
	$(PY) -m pip install -e '.[dev]'
	pnpm install --frozen-lockfile

test:
	$(PY) -m pytest -q -m 'not live_provider'
	pnpm test

lint:
	$(PY) -m ruff check apps/api/src apps/api/tests tests

typecheck:
	pnpm typecheck

build:
	pnpm build

contracts:
	$(PY) -m pindou_pet.openapi --write
	pnpm --filter @pindou/contracts generate

contracts-check:
	$(PY) -m pindou_pet.openapi --check
	pnpm contracts:check

check: lint contracts-check test typecheck build
```

### Step 3：安装、锁定和验证

- [ ] 运行：

```bash
.venv/bin/python -m pip install -e '.[dev]'
corepack enable
pnpm install
.venv/bin/python -m pytest apps/api/tests/test_repository_layout.py -q
```

Expected: `1 passed`；根目录产生 `pnpm-lock.yaml`，没有 `package-lock.json`。

- [ ] 运行：

```bash
git status --short
git diff --check
```

Expected: 只出现本 Task 列出的新文件；`git diff --check` 无输出。

- [ ] 提交：

```bash
git add .gitignore .env.example .python-version .nvmrc pyproject.toml package.json pnpm-workspace.yaml pnpm-lock.yaml Makefile README.md apps/api
git commit -m "chore: establish pinned monorepo foundation"
```

---

## Task 0.2：用测试驱动 FastAPI 应用工厂和健康检查

**Files:**

- Create: `apps/api/src/pindou_pet/config.py`
- Create: `apps/api/src/pindou_pet/main.py`
- Create: `apps/api/src/pindou_pet/api/__init__.py`
- Create: `apps/api/src/pindou_pet/api/router.py`
- Create: `apps/api/src/pindou_pet/api/errors.py`
- Create: `apps/api/tests/api/test_health.py`

### Step 1：写失败的 live/ready 合同

- [ ] `test_health.py`：

```python
from fastapi.testclient import TestClient

from pindou_pet.main import create_app


def test_live_and_ready_are_distinct() -> None:
    client = TestClient(create_app())
    assert client.get("/api/health/live").json() == {"status": "live"}
    assert client.get("/api/health/ready").json() == {"status": "ready"}


def test_unknown_api_route_uses_stable_error_shape() -> None:
    response = TestClient(create_app()).get("/api/missing")
    assert response.status_code == 404
    assert response.json() == {
        "error": {"code": "NOT_FOUND", "message": "Resource not found"}
    }
```

- [ ] 运行：

```bash
.venv/bin/python -m pytest apps/api/tests/api/test_health.py -q
```

Expected: FAIL，`pindou_pet.main` 或路由尚不存在。

### Step 2：实现最小应用和错误形状

- [ ] `config.py` 使用显式前缀并拒绝额外配置：

```python
from pathlib import Path

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="PINDOU_",
        env_file=".env",
        env_file_encoding="utf-8",
        env_ignore_empty=True,
        extra="forbid",
    )

    env: str = "development"
    database_url: str = "sqlite:///var/pindou.db"
    storage_root: Path = Path("var/storage")
    redis_url: str = "redis://127.0.0.1:6379/15"
    session_secret: str = "test-only-secret"
    generation_api_key: SecretStr | None = None
```

The optional key exists only so the Phase 1 credential named in `.env.example` is a typed, non-extra setting. Phase 0 never reads or requires it; a qualifying Phase 1 adapter fails closed when it is absent and accesses it only through `SecretStr.get_secret_value()` at transport construction.

- [ ] `main.py` 暴露 `create_app(settings: Settings | None = None) -> FastAPI`，供 Uvicorn 使用 `--factory pindou_pet.main:create_app` 启动；不要求未定义的模块级 `app`。它只挂载 `/api/health/live`、`/api/health/ready` 和统一 404 handler。`api/errors.py` 定义唯一 `ApiErrorResponse(error={code,message,details?})`；404 省略 details，后续业务错误只扩展 details。`live` 只证明进程存活；`ready` 通过可注入检查器验证 SQLite 和存储目录可用，不检查外部 AI Provider。

- [ ] 重新运行：

```bash
.venv/bin/python -m pytest apps/api/tests/api/test_health.py -q
.venv/bin/python -m ruff check apps/api/src apps/api/tests/api/test_health.py
```

Expected: `2 passed`，Ruff 退出码 0。

- [ ] 提交：

```bash
git add apps/api/src/pindou_pet apps/api/tests/api/test_health.py
git commit -m "chore: scaffold FastAPI application factory"
```

---

## Task 0.3：建立 SQLite WAL、迁移和原子存储协议

**Files:**

- Create: `alembic.ini`
- Create: `migrations/env.py`
- Create: `migrations/script.py.mako`
- Create: `migrations/versions/0001_foundation.py`
- Create: `apps/api/src/pindou_pet/infrastructure/__init__.py`
- Create: `apps/api/src/pindou_pet/infrastructure/db.py`
- Create: `apps/api/src/pindou_pet/infrastructure/storage.py`
- Create: `apps/api/tests/infrastructure/test_db.py`
- Create: `apps/api/tests/infrastructure/test_storage.py`

### Step 1：写 WAL 与原子存储失败测试

- [ ] 数据库测试要求连接初始化后 `journal_mode=wal`、`foreign_keys=1`，并证明迁移可在空数据库升级到 head。
- [ ] 存储测试使用 `tmp_path`，要求 `put_atomic()` 返回 SHA-256、最终键存在、临时 `.part` 不残留，重复写相同内容得到相同内容寻址键。

```python
class ObjectStorage(Protocol):
    def put_atomic(self, *, namespace: str, data: bytes) -> StoredObject: ...
    def open(self, key: str) -> BinaryIO: ...
    def exists(self, key: str) -> bool: ...
    def delete(self, key: str) -> None: ...
```

- [ ] 运行：

```bash
.venv/bin/python -m pytest \
  apps/api/tests/infrastructure/test_db.py \
  apps/api/tests/infrastructure/test_storage.py -q
```

Expected: FAIL，缺少 `db`／`storage` 模块。

### Step 2：实现最小基础设施

- [ ] `db.py` 只提供 `create_engine_from_settings()`、`session_factory()` 和 `Base`；SQLite connect hook 设置 WAL、外键和 `busy_timeout`。
- [ ] `storage.py` 使用随机临时名写同目录 `.part`、flush、`os.fsync()`、计算 SHA-256，再 `os.replace()` 到 `<namespace>/<sha256>`。路径必须通过根目录解析检查，拒绝 `..`。
- [ ] `0001_foundation.py` 创建 `schema_metadata(key PRIMARY KEY, value, updated_at)`，作为迁移链 smoke table；业务表留给 Phase 2。

### Step 3：验证迁移和失败不留脏文件

- [ ] 运行：

```bash
PINDOU_DATABASE_URL=sqlite:///var/test-foundation.db \
  .venv/bin/python -m alembic upgrade head
.venv/bin/python -m pytest \
  apps/api/tests/infrastructure/test_db.py \
  apps/api/tests/infrastructure/test_storage.py -q
```

Expected: 所有测试通过；`alembic current` 输出 `0001_foundation (head)`。

- [ ] 提交：

```bash
git add alembic.ini migrations apps/api/src/pindou_pet/infrastructure apps/api/tests/infrastructure
git commit -m "chore: add SQLite and atomic storage foundations"
```

---

## Task 0.4：冻结核心枚举和 Provider／队列协议

**Files:**

- Create: `apps/api/src/pindou_pet/domain/__init__.py`
- Create: `apps/api/src/pindou_pet/domain/enums.py`
- Create: `apps/api/src/pindou_pet/domain/providers.py`
- Create: `apps/api/src/pindou_pet/infrastructure/queue.py`
- Create: `apps/api/tests/fakes/generation_provider.py`
- Create: `apps/api/tests/fakes/queue.py`
- Create: `tests/contracts/providers/test_generation_contract.py`
- Create: `tests/contracts/test_queue_payload_contract.py`

### Step 1：先写 fake 也必须通过的合同测试

- [ ] 枚举精确冻结：

```python
class PhotoView(StrEnum):
    FRONT = "FRONT"
    CAT_LEFT_FRONT_45 = "CAT_LEFT_FRONT_45"
    CAT_RIGHT_FRONT_45 = "CAT_RIGHT_FRONT_45"


class PartLabel(StrEnum):
    BODY = "BODY"
    HEAD = "HEAD"
    SCREEN_LEFT_FRONT_PAW = "SCREEN_LEFT_FRONT_PAW"
    SCREEN_RIGHT_FRONT_PAW = "SCREEN_RIGHT_FRONT_PAW"
    TAIL = "TAIL"
    EYES = "EYES"


class ProjectStatus(StrEnum):
    UPLOADED = "UPLOADED"
    PROCESSING = "PROCESSING"
    LAYER_REVIEW = "LAYER_REVIEW"
    BEAD_REVIEW = "BEAD_REVIEW"
    READY = "READY"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"
    EXPIRED = "EXPIRED"


class JobStatus(StrEnum):
    QUEUED = "QUEUED"
    SUBMITTING = "SUBMITTING"
    SUBMIT_UNKNOWN = "SUBMIT_UNKNOWN"
    WAITING_PROVIDER = "WAITING_PROVIDER"
    SUCCEEDED = "SUCCEEDED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"
```

- [ ] Provider 合同精确冻结：

```python
class GenerationProvider(Protocol):
    name: str
    model_version: str

    def submit(self, request: GenerationRequest, *, idempotency_key: str) -> str: ...
    def lookup_by_idempotency_key(self, key: str) -> str | None: ...
    def status(self, provider_job_id: str) -> ProviderJobState: ...
    def result(self, provider_job_id: str) -> NormalizedImageResult: ...
    def cancel(self, provider_job_id: str) -> None: ...


class SegmentationProvider(Protocol):
    model_version: str

    def segment(self, request: SegmentationRequest) -> NormalizedPartMasks: ...
```

- [ ] `SegmentationRequest.part_labels` is an ordered, unique tuple of the exact six `PartLabel` values above plus prompt geometry keyed by the same enum. `NormalizedPartMasks.masks` is a total mapping with exactly one validated binary mask per requested label and no extras. `FOREGROUND` is not a `PartLabel`: the perception instance model supplies it separately for alpha/composition. Contract tests freeze the values/order and reject left/right anatomical names, `EYES_OPEN`/`EYES_CLOSED`, missing labels, extra `FOREGROUND`, mismatched dimensions and duplicate keys.
- [ ] `ReferenceImage` 精确包含 `view: PhotoView`、内存中的规范化 `png_bytes: bytes`、`content_hash`、`width`、`height`；它不包含文件路径、永久／签名 URL 或原文件名，也绝不进入 Redis／JSON／日志。`GenerationRequest` 必须含三张按 `PhotoView` 有序且哈希校验通过的 `ReferenceImage`、身份特征、固定目标姿势、可选编辑掩码／指令、attempt 和 seed。`TargetPose` 的产品默认值精确冻结为 `face_direction="front"`、`body_rotation_degrees=20`、`tail_side="screen_right"`，合同测试必须拒绝缺字段或其他默认值；`NormalizedImageResult` 只能暴露标准 PNG、尺寸、内容哈希、seed、模型名／版本和 request fingerprint。
- [ ] fake Provider 合同测试覆盖：相同幂等键只产生一个任务、可按键找回、取消重复调用安全、异常结果被规范化拒绝。
- [ ] 队列合同只允许：

```python
class QueueGateway(Protocol):
    def enqueue_submit(self, stage_job_id: UUID) -> str: ...
    def enqueue_poll(self, stage_job_id: UUID, *, delay_seconds: int) -> str: ...
    def cancel(self, rq_job_id: str) -> None: ...
```

- [ ] 运行：

```bash
.venv/bin/python -m pytest tests/contracts -q
```

Expected: FAIL，核心协议尚不存在。

### Step 2：实现协议和最小 fake

- [ ] 只实现 Pydantic 值对象、`Protocol` 和内存 fake；不写任何真实 HTTP Provider adapter，也不把图片字节序列化进队列 fake。
- [ ] fake Provider 的任务 ID 由幂等键稳定映射；重复 `submit()` 返回原 ID，并记录 `accepted_count == 1`。

### Step 3：验证合同

- [ ] 运行：

```bash
.venv/bin/python -m pytest tests/contracts -q
.venv/bin/python -m ruff check apps/api/src apps/api/tests/fakes tests/contracts
```

Expected: 合同测试全部通过；Ruff 退出码 0。

- [ ] 提交：

```bash
git add apps/api/src/pindou_pet/domain apps/api/src/pindou_pet/infrastructure/queue.py apps/api/tests/fakes tests/contracts
git commit -m "feat: establish provider and queue contracts"
```

---

## Task 0.5：建立 React/Vite 最小壳和响应式页面边界

**Files:**

- Create: `apps/web/package.json`
- Create: `apps/web/index.html`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/vite.config.ts`
- Create: `apps/web/vitest.config.ts`
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/app/App.tsx`
- Create: `apps/web/src/app/router.tsx`
- Create: `apps/web/src/app/styles.css`
- Create: `apps/web/src/api/client.ts`
- Create: `apps/web/src/api/errors.ts`
- Create: `apps/web/src/test/setup.ts`
- Create: `apps/web/src/app/App.test.tsx`

### Step 1：写失败的产品壳测试

- [ ] 测试只要求标题、四个路由占位和桌面编辑提示，不制作页面功能：

```tsx
it("renders the approved product shell", async () => {
  render(<App initialPath="/" />);
  expect(screen.getByRole("heading", { name: "拼豆宠物" })).toBeVisible();
  expect(screen.getByText("创建一只猫咪角色")).toBeVisible();
});

it("blocks fine editing below the approved desktop viewport", () => {
  setViewport(390, 844);
  render(<App initialPath="/projects/demo/edit" />);
  expect(screen.getByText("请在宽度至少 1280px 的桌面浏览器中编辑")).toBeVisible();
});
```

- [ ] `apps/web/package.json` scripts 精确提供 `dev`、`build`、`test`、`typecheck`、`test:e2e`；依赖只包含 React、React DOM、React Router、Konva、react-konva，测试依赖包含 Vite、Vitest、jsdom、Testing Library、TypeScript、Playwright。
- [ ] 运行：

```bash
pnpm --filter @pindou/web test -- --run
```

Expected: FAIL，App 尚不存在。

### Step 2：实现最小壳

- [ ] 路由只建立以下占位：

```text
/
/projects/:projectId/edit
/projects/:projectId/room
/projects/:projectId/export
```

- [ ] `/` 在桌面和移动显示；`edit` 小于 1280px 时只显示限制说明；room/export 占位允许移动显示。
- [ ] `api/client.ts` 只封装同源 `/api/v1` fetch、`credentials: "include"` 和稳定错误解码，不写业务 endpoint。`vite.config.ts` 的 `server.proxy` 与 `preview.proxy` 都把 `/api` 转发到显式环境变量 `PINDOU_API_ORIGIN`（本地默认 `http://127.0.0.1:8000`）；浏览器始终只看到 Web origin。部署合同同样要求一个公开 origin：静态 SPA 处理非 `/api` 路径，反向代理把 `/api` 送到 FastAPI；首版不以 CORS 或跨站 Cookie 代替这一边界。

### Step 3：验证前端骨架

- [ ] 运行：

```bash
pnpm --filter @pindou/web test -- --run
pnpm --filter @pindou/web typecheck
pnpm --filter @pindou/web build
```

Expected: 测试、类型检查、生产构建均退出码 0。

- [ ] 提交：

```bash
git add apps/web package.json pnpm-lock.yaml
git commit -m "chore: scaffold responsive React application shell"
```

---

## Task 0.6：生成并校验 OpenAPI→TypeScript 单一合同

**Files:**

- Create: `apps/api/src/pindou_pet/openapi.py`
- Create: `apps/api/tests/contracts/test_openapi_snapshot.py`
- Create: `packages/contracts/package.json`
- Create: `packages/contracts/openapi.json`
- Create: `packages/contracts/scripts/check-generated.mjs`
- Create: `packages/contracts/src/generated.ts`
- Create: `packages/contracts/src/index.ts`
- Modify: `apps/web/package.json`
- Modify: `apps/web/src/api/client.ts`
- Modify: `Makefile`

### Step 1：写失败的漂移测试

- [ ] Python 快照测试调用 `create_app().openapi()`，规范化 JSON 后与 `packages/contracts/openapi.json` 逐字节比较。
- [ ] contracts 包使用 `openapi-typescript` 从快照生成 `src/generated.ts`；`check-generated.mjs` 在临时目录重生成并比较，发现差异退出 1。
- [ ] Web 依赖 `workspace:*` 的 `@pindou/contracts`，并从它导入 `paths` 类型。

- [ ] 运行：

```bash
.venv/bin/python -m pytest apps/api/tests/contracts/test_openapi_snapshot.py -q
pnpm --filter @pindou/contracts contracts:check
```

Expected: FAIL，快照和生成类型尚不存在。

### Step 2：实现确定性生成器

- [ ] `openapi.py` 支持且只支持：

```text
python -m pindou_pet.openapi --write
python -m pindou_pet.openapi --check
```

- [ ] JSON 输出 UTF-8、键排序、2 空格缩进、末尾换行；`--check` 只比较，不写工作树。
- [ ] `generated.ts` 顶部标记 generated，不允许人工编辑；业务 helper 放 `index.ts`。

### Step 3：生成、验证和故意漂移检查

- [ ] 运行：

```bash
make contracts
make contracts-check
pnpm --filter @pindou/web typecheck
```

Expected: 全部退出码 0。

- [ ] 临时在测试分支改变一个 health response schema，确认 `make contracts-check` 失败；撤回该临时改动并重新运行，确认通过。不要提交故意漂移。

- [ ] 提交：

```bash
git add apps/api/src/pindou_pet/openapi.py apps/api/tests/contracts packages/contracts apps/web/package.json apps/web/src/api/client.ts Makefile pnpm-lock.yaml
git commit -m "feat: generate frontend contracts from FastAPI OpenAPI"
```

---

## Task 0.7：建立 CI、真实 Redis smoke 和阶段出口门

**Files:**

- Create: `.github/workflows/ci.yml`
- Create: `apps/api/tests/infrastructure/test_redis_connection.py`
- Modify: `README.md`
- Modify: `Makefile`

### Step 1：写标记为 redis 的失败 smoke test

- [ ] 测试使用 `PINDOU_REDIS_URL`，`PING` 后写入带 60 秒 TTL 的随机测试键并删除；未设置 `RUN_REDIS_TESTS=1` 时跳过，不能静默使用 fake。

- [ ] 本地无 Redis 时只运行非 Redis套件：

```bash
.venv/bin/python -m pytest -q -m "not redis and not live_provider"
```

Expected: 通过，Redis smoke 显式显示 skipped。

### Step 2：配置 CI 的真实依赖和门禁

- [ ] `.github/workflows/ci.yml`：

```yaml
name: ci
on:
  pull_request:
  push:
    branches: [main]
jobs:
  check:
    runs-on: ubuntu-latest
    services:
      redis:
        image: redis:7-alpine
        ports: ["6379:6379"]
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 5s
          --health-timeout 3s
          --health-retries 10
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: {python-version: "3.12", cache: pip}
      - uses: pnpm/action-setup@v4
        with: {version: 11.9.0}
      - uses: actions/setup-node@v4
        with: {node-version: "24", cache: pnpm}
      - run: python -m venv .venv
      - run: .venv/bin/python -m pip install -e '.[dev]'
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @pindou/web exec playwright install --with-deps chromium
      - run: mkdir -p var
      - run: PINDOU_DATABASE_URL=sqlite:///var/ci.db .venv/bin/python -m alembic upgrade head
      - run: RUN_REDIS_TESTS=1 PINDOU_REDIS_URL=redis://127.0.0.1:6379/15 make check
```

- [ ] `README.md` 记录精确启动命令、真实 Redis 要求、私有数据边界和“不支持 Phase 1 前继续完整页面”的门禁；clean-checkout 步骤在 `pnpm install --frozen-lockfile` 后显式运行 `pnpm --filter @pindou/web exec playwright install chromium`，不得依赖机器上已有的浏览器缓存。

### Step 3：运行 Phase 0 出口验证

- [ ] 本地执行：

```bash
make contracts-check
.venv/bin/python -m pytest -q -m "not redis and not live_provider"
pnpm test
pnpm typecheck
pnpm build
git diff --check
```

Expected: 所有命令退出码 0；没有 OpenAPI 或 generated.ts 漂移。

- [ ] 在 CI 或已启动 Redis 的本机执行：

```bash
RUN_REDIS_TESTS=1 PINDOU_REDIS_URL=redis://127.0.0.1:6379/15 \
  .venv/bin/python -m pytest apps/api/tests/infrastructure/test_redis_connection.py -m redis -q
```

Expected: `1 passed`，不是 skipped。

- [ ] 提交：

```bash
git add .github README.md Makefile apps/api/tests/infrastructure/test_redis_connection.py
git commit -m "ci: enforce contracts tests and builds"
```

## Phase 0 Completion Gate

- [ ] 从干净检出按照 README 建立 Python 3.12 环境并执行 `pnpm install --frozen-lockfile`。
- [ ] `make contracts-check` 能发现并拒绝未生成的 API 变更。
- [ ] fake Provider 证明幂等查询合同，队列合同证明载荷只含 ID。
- [ ] SQLite 迁移达到 head，WAL／外键已启用，原子存储测试通过。
- [ ] Web 四路由骨架可构建，移动端精细编辑限制明确。
- [ ] CI 使用真实 Redis 7 完成 smoke，不把 fake 当集成证明。
- [ ] `make check`、`git diff --check` 全部通过。

Phase 0 通过后只进入 [Phase 1：三猫 Provider 可行性](2026-07-16-pindou-pet-phase-1-provider-feasibility.md)。
