# 拼豆虚拟宠物 Phase 2：项目、上传与生成任务管线 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在已经通过 Phase 1 三猫硬门禁的 Provider 上，实现匿名项目、单 owner 跨设备交接、三槽照片上传、确定性入口检查、幂等生成、RQ 轮询恢复、初稿确认与一次完整重生成的 Web 闭环。

**Architecture:** FastAPI 模块化单体以 SQLite 为项目和任务事实源，Redis/RQ 只保存任务 ID；单例 SQLite 生成租约在异步 Provider 轮询期间保持，避免第二个收费任务并发提交。匿名项目通过 10 分钟、单次使用的所有权交接令牌在浏览器间串行转移，任一时刻只有一个 owner。照片进入私有本地存储前由 Pillow 解码、纠正方向、去 EXIF 和随机命名。React 创建页通过生成的 OpenAPI 类型完成同意、三视图上传、两秒轮询和高清形象确认；本阶段不创建任何高清分层或拼豆编辑接口。

**Tech Stack:** Phase 0 固定的 Python 3.12、FastAPI、Pydantic v2、SQLAlchemy 2、Alembic、SQLite WAL、Redis、RQ、Pillow、itsdangerous、pytest；React、TypeScript、Vite、Vitest、Testing Library、MSW、pnpm workspace。

## Global Constraints

- 开始前必须验证 `config/provider.freeze.yaml` 和 `docs/feasibility/three-cat-provider-gate.md` 同时为 `PASS` 且校验和匹配；失败立即停线。
- 命令固定使用 `.venv/bin/python` 与 `pnpm`，不得使用 `uv` 或 `npm`。
- `PhotoView` 只允许 `FRONT`、`CAT_LEFT_FRONT_45`、`CAT_RIGHT_FRONT_45`；后两者表示相机位于猫的左前／右前。前爪语义在所有后续接口中只使用 `SCREEN_LEFT_FRONT_PAW` 和 `SCREEN_RIGHT_FRONT_PAW`。
- 项目主状态只使用 `UPLOADED -> PROCESSING -> LAYER_REVIEW -> BEAD_REVIEW -> READY` 以及 `FAILED/CANCELLED/EXPIRED`。照片尚未齐全时仍处于 `UPLOADED + UPLOADS`，是否齐全由三个槽位明确表达。
- 生成 Provider 不必原生返回透明背景；Phase 2 初稿保存 Provider PNG，同时使用 Phase 1 冻结的本地分割器派生透明预览。
- 阶段任务唯一键严格由 `projectId + stage + inputHash + revision` 派生；相同输入重复点击不得产生第二个 Provider 任务。
- Provider 提交前必须先持久化 `SUBMITTING` 和幂等键；提交结果不明且查询不到时进入 `SUBMIT_UNKNOWN`，禁止自动重提。
- 网络超时和服务端 5xx 最多自动重试一次；内容拒绝、照片不合格和用户不满意不得自动循环。
- Redis/RQ 载荷仅包含数据库 ID；不得包含图片、Base64、路径、密钥或 Provider 完整响应。
- 本阶段只实现 `INITIAL_DRAFT` 与最多一次 `FULL_REGENERATION`。Phase 3 在同一提交端点增加本地 `LAYER_GENERATION` 和 Provider-backed `PART_REGENERATION`；本阶段不得建立竞争端点。
- `FULL_REGENERATION` 必须复用已通过的上传/入口检查和不可变身份特征检查点，只重新执行必要的身份生成与本地 alpha；不得重新检查照片或创建第二个身份提取阶段。
- `cumulativeGenerationWaitMs` 累加初稿、完整重生成和 Phase 3 局部重生成各自从服务端接受请求到该次结果可读的总毫秒；`providerWaitMs` 是独立诊断字段，不得拿它代替 300 秒累计口径。
- 本阶段不得实现 `/draft`、图层画笔、关节点、拼豆量化、逐豆编辑、资产批准、动画、PNG/PDF 实体导出或相关数据库表。
- 不增加生产测试控制路由；测试通过依赖注入、临时数据库、临时存储和假 Provider 控制状态。
- 一次性交接只替换 `Project.browser_session_id`，不撤销旧 `BrowserSession`，不复制项目，也不支持并行 owner／冲突合并；未持久化的浏览器本地状态不在交接范围内。
- 所有 owner 写路由只在入口认证 `BrowserSession`，再把 `browser_session_id` 传给服务；上传替换／删除、生成创建／取消／接受形象、显式项目删除、签发交接以及后续 draft／批准／导出等服务都在实施 mutation 的同一个 `BEGIN IMMEDIATE` 内调用 `require_project_owner_in_transaction(project_id, browser_session_id)`。禁止复用事务外的 owner 判定，防止旧浏览器在交接完成后提交先前通过鉴权的写入。
- 项目拥有的数据库子行必须可在最终墓碑清理时确定性删除：本阶段的 uploads、generation runs/stages/checkpoints、handoffs 和 deletion ledger 对 `projects`／父行使用 `ON DELETE CASCADE`；`projects.current_generation_run_id` 与生成租约 holder 这类反向指针使用 `ON DELETE SET NULL` 并在 purge 前显式清空。未来资产／导出阶段延续同一图谱，不能留下默认 RESTRICT FK 阻塞项目删除。
- 任何任务运行 `make contracts` 都必须同时提交 `packages/contracts/openapi.json` 与 `packages/contracts/src/generated.ts`，提交命令使用 `git add packages/contracts`；下文单列 generated 路径只是简称。

---

## Planned File Structure

```text
apps/api/src/pindou_pet/
├── config.py                                      # modify
├── main.py                                        # modify
├── preflight.py                                   # create
├── worker.py                                      # create
├── api/
│   ├── dependencies.py                            # create in Task 2
│   ├── errors.py                                  # modify Phase 0 error envelope
│   └── router.py                                  # modify
├── domain/
│   ├── enums.py                                   # modify Phase 0 enums
│   └── hashing.py                                 # create
├── infrastructure/
│   ├── db.py                                      # existing Phase 0 foundation
│   ├── queue.py                                   # modify Phase 0 protocol
│   ├── security.py                                # create
│   └── storage.py                                 # modify Phase 0 content-addressed storage
├── modules/
│   ├── projects/
│   │   ├── deletion.py                            # create
│   │   ├── models.py                              # create
│   │   ├── repository.py                          # create
│   │   ├── routes.py                              # create
│   │   ├── schemas.py                             # create
│   │   └── service.py                             # create
│   ├── uploads/
│   │   ├── image_normalizer.py                    # create
│   │   ├── identity_traits.py                     # create
│   │   ├── models.py                              # create
│   │   ├── quality.py                             # create
│   │   ├── repository.py                          # create
│   │   ├── routes.py                              # create
│   │   ├── schemas.py                             # create
│   │   └── service.py                             # create
│   └── jobs/
│       ├── lease.py                               # create
│       ├── models.py                              # create
│       ├── recovery.py                            # create
│       ├── repository.py                          # create
│       ├── routes.py                              # create
│       ├── schemas.py                             # create
│       ├── service.py                             # create
│       └── tasks.py                               # create
└── providers/generation/factory.py                # create
apps/web/src/
├── app/router.tsx                                 # modify
├── api/client.ts                                  # modify Phase 0 typed client
├── api/errors.ts                                  # modify Phase 0 error mapping
└── features/create/
    ├── ConsentStep.tsx                            # create
    ├── CreateProjectPage.tsx                      # create
    ├── GenerationProgress.tsx                     # create
    ├── PhotoSlots.tsx                             # create
    ├── ShapeConfirmation.tsx                      # create
    ├── api.ts                                     # create
    ├── model.ts                                   # create
    └── __tests__/
        ├── CreateProjectPage.test.tsx             # create
        └── ShapeConfirmation.test.tsx             # create
apps/web/src/features/handoff/
├── HandoffClaimPage.tsx                           # create in Task 8
├── ProjectHandoffButton.tsx                       # create in Task 8
├── api.ts                                         # create in Task 8
└── __tests__/handoff.test.tsx                     # create in Task 8
migrations/
├── env.py                                         # modify Phase 0 Alembic metadata imports
└── versions/
    ├── 0001_foundation.py                         # existing from Phase 0
    ├── 0002_sessions_projects.py                  # create
    ├── 0003_uploads.py                            # create
    └── 0004_generation_jobs.py                    # create
tests/
├── unit/
│   ├── domain/test_hashing.py                     # create
│   ├── projects/test_project_service.py           # create
│   ├── uploads/test_image_normalizer.py           # create
│   ├── uploads/test_identity_traits.py             # create
│   ├── uploads/test_quality.py                    # create
│   ├── uploads/test_upload_service.py             # create
│   ├── jobs/test_job_service.py                   # create
│   └── jobs/test_lease.py                         # create
├── integration/
│   ├── api/test_project_routes.py                 # create
│   ├── api/test_upload_routes.py                  # create
│   ├── api/test_generation_job_routes.py          # create
│   └── jobs/
│       ├── test_rq_lifecycle.py                   # create
│       ├── test_recovery.py                       # create
│       └── test_tombstone_race.py                 # create
└── fixtures/images/
    ├── oriented-cat.jpg                           # create
    ├── blurred-cat.png                            # create
    └── clear-cat.png                              # create
tests/fixtures/generate_images.py                  # create synthetic fixtures only
alembic.ini                                        # existing from Phase 0
```

## Frozen HTTP API

```text
POST   /api/v1/projects
GET    /api/v1/projects
GET    /api/v1/projects/{projectId}
DELETE /api/v1/projects/{projectId}
POST   /api/v1/browser-sessions/bootstrap
POST   /api/v1/projects/{projectId}/ownership-handoffs
POST   /api/v1/ownership-handoffs/claim
PUT    /api/v1/projects/{projectId}/uploads/{photoView}
DELETE /api/v1/projects/{projectId}/uploads/{photoView}
POST   /api/v1/projects/{projectId}/generation-jobs
GET    /api/v1/projects/{projectId}/generation-jobs/{jobId}
POST   /api/v1/projects/{projectId}/generation-jobs/{jobId}/cancel
POST   /api/v1/projects/{projectId}/generation-jobs/{jobId}/accept-shape
GET    /api/v1/projects/{projectId}/generation-jobs/{jobId}/result
```

The job-create endpoint accepts this Phase 2 discriminated union:

```python
class InitialDraftRequest(BaseModel):
    kind: Literal["INITIAL_DRAFT"]
    expected_revision: int = Field(ge=0)
    seed: int = Field(ge=0, le=2**32 - 1)
    confirm_same_cat_when_uncertain: bool = False
    confirm_assigned_views_when_uncertain: bool = False


class FullRegenerationFeedback(BaseModel):
    face_wrong: bool = False
    body_wrong: bool = False
    color_wrong: bool = False
    markings_wrong: bool = False


class FullRegenerationRequest(BaseModel):
    kind: Literal["FULL_REGENERATION"]
    expected_revision: int = Field(ge=0)
    seed: int = Field(ge=0, le=2**32 - 1)
    feedback: FullRegenerationFeedback


GenerationJobCreateRequest = Annotated[
    InitialDraftRequest | FullRegenerationRequest,
    Field(discriminator="kind"),
]
```

Phase 3 extends this exact union and endpoint with local `LAYER_GENERATION` and Provider-backed `PART_REGENERATION`; it does not add competing routes.

---

### Task 1: Enforce the Phase 1 freeze before Phase 2 startup

**Files:**
- Modify: `pyproject.toml`
- Modify: `apps/api/src/pindou_pet/config.py`
- Modify: `apps/api/src/pindou_pet/main.py`
- Create: `apps/api/src/pindou_pet/preflight.py`
- Create: `tests/unit/projects/test_phase1_preflight.py`

**Interfaces:**
- Produces: `validate_passing_feasibility_freeze(settings: Settings) -> FeasibilityFreeze`
- Consumes: Phase 0 `Base`, `SessionFactory`, SQLite WAL configuration, Redis/RQ dependencies, and `ObjectStorage` without changing them
- Consumes: byte-identical passing Phase 1 report/freeze checksums

- [ ] **Step 1: Extend dependencies and install them**

Add only `itsdangerous` and `python-multipart` if Phase 0 does not already include them. Reuse Phase 0 SQLAlchemy, Alembic, Redis and RQ dependencies; do not add `fakeredis`. Keep Python fixed to Phase 0's 3.12 line.

```bash
.venv/bin/python -m pip install -e '.[dev]'
```

Expected: imports for `sqlalchemy`, `alembic`, `redis`, `rq`, `itsdangerous`, and `multipart` exit `0`.

- [ ] **Step 2: Write failing freeze-preflight tests**

```python
def test_phase2_rejects_non_passing_provider_freeze(settings, write_freeze):
    write_freeze(decision="FAIL")
    with pytest.raises(PhaseOneGateError, match="PASS"):
        validate_passing_feasibility_freeze(settings)


def test_phase2_accepts_matching_pass_report(settings, write_matching_pass_files):
    write_matching_pass_files()
    freeze = validate_passing_feasibility_freeze(settings)
    assert freeze.decision == "PASS"
```

Run:

```bash
.venv/bin/python -m pytest tests/unit/projects/test_phase1_preflight.py -q
```

Expected: FAIL because `preflight.py` is absent.

- [ ] **Step 3: Implement exact settings and freeze validation**

Reuse Phase 0 `database_url`, `storage_root`, `redis_url` and `session_secret`; keep Redis at database 15, tighten `session_secret` to `SecretStr`, and add only the Phase 2 freeze/cookie settings. The resulting names/defaults are:

```python
database_url: str = "sqlite:///var/pindou.db"
redis_url: str = Field("redis://127.0.0.1:6379/15", validation_alias="PINDOU_REDIS_URL")
storage_root: Path = Path("var/storage")
provider_freeze_path: Path = Path("config/provider.freeze.yaml")
segmentation_freeze_path: Path = Path("config/segmentation.freeze.yaml")
provider_gate_report_path: Path = Path("docs/feasibility/three-cat-provider-gate.md")
env: Literal["test", "development", "acceptance", "production"] = "development"
session_secret: SecretStr = SecretStr("test-only-secret")
session_cookie_secure: bool = False
session_cookie_max_age_seconds: int = 15_552_000  # 180 days
```

Phase 0 `SettingsConfigDict` loads the ignored root `.env`; its existing `.env.example` already names `PINDOU_ENV`, `PINDOU_SESSION_SECRET` and the configured Provider credential. Keep that same `env` field/name and the Phase 0 test-only secret as a typed default so `create_app()`, OpenAPI generation and clean-checkout unit tests remain executable without a private `.env`. Preflight must reject `env in {"acceptance", "production"}` when the effective secret equals that default or is shorter than 32 bytes; production injects it through a secret manager. Development/API/Worker share one explicit environment source, and the formal stack supplies `PINDOU_ENV=acceptance` plus a private 32-byte secret. Add tests for clean `create_app().openapi()` success and production/acceptance-default rejection.

Freeze validation requires both files and report to say `PASS`, recomputes the official capability audit, Provider proof, local instance/view-yaw/cat-re-ID/promptable-segmentation license/ABI/calibration and report checksums, and returns the model/version/threshold/request parameter maps used later in job hashing. It raises before app startup on any mismatch.

Reuse Phase 0's SQLAlchemy 2 sync sessions, SQLite WAL/foreign-key pragmas, migration environment and queue protocol. Implement freeze parsing and checksum validation in `preflight.py`; this task adds no database foundation behavior.

- [ ] **Step 4: Verify and commit**

```bash
.venv/bin/python -m pytest tests/unit/projects/test_phase1_preflight.py -q
.venv/bin/python -m ruff check apps/api/src/pindou_pet/preflight.py \
  tests/unit/projects/test_phase1_preflight.py
git add pyproject.toml apps/api/src/pindou_pet/config.py \
  apps/api/src/pindou_pet/main.py apps/api/src/pindou_pet/preflight.py \
  tests/unit/projects/test_phase1_preflight.py
git commit -m "chore: gate phase two on provider feasibility"
```

Expected: tests pass and the commit contains no replacement DB/queue/storage foundation.

---

### Task 2: Implement anonymous sessions and project lifecycle

**Files:**
- Modify: `apps/api/src/pindou_pet/domain/enums.py`
- Create: `apps/api/src/pindou_pet/api/dependencies.py`
- Create: `apps/api/src/pindou_pet/infrastructure/security.py`
- Create: `apps/api/src/pindou_pet/modules/projects/models.py`
- Create: `apps/api/src/pindou_pet/modules/projects/schemas.py`
- Create: `apps/api/src/pindou_pet/modules/projects/repository.py`
- Create: `apps/api/src/pindou_pet/modules/projects/service.py`
- Create: `apps/api/src/pindou_pet/modules/projects/routes.py`
- Modify: `apps/api/src/pindou_pet/api/errors.py`
- Create: `migrations/versions/0002_sessions_projects.py`
- Modify: `migrations/env.py` to import the new project/session metadata
- Modify: `apps/api/src/pindou_pet/api/router.py`
- Create: `tests/unit/projects/test_project_service.py`
- Create: `tests/integration/api/test_project_routes.py`

**Interfaces:**
- Produces: `create_project(session, consent) -> Project`
- Produces: `require_project_access(project_id, browser_session_id) -> Project`
- Produces: `POST/GET/DELETE /api/v1/projects...`
- Produces: session-scoped `GET /projects` with only currently owned, non-tombstoned project summaries
- Produces: retry-safe `POST /browser-sessions/bootstrap` that accepts no project/token/body and establishes the receiver cookie before claim
- Produces: owner-only `POST /projects/{projectId}/ownership-handoffs` and same-origin `POST /ownership-handoffs/claim`
- Cookie: `pindou_session`, HttpOnly, SameSite=Lax, Secure from settings

- [ ] **Step 1: Write failing service tests for consent, ownership and initial constants**

```python
def test_create_requires_explicit_third_party_consent(project_service, browser_session):
    with pytest.raises(ConsentRequired):
        project_service.create(browser_session.id, consent=False, consent_text_version="2026-07-16")


def test_created_project_has_fixed_grid_and_upload_step(project_service, browser_session):
    project = project_service.create(
        browser_session.id, consent=True, consent_text_version="2026-07-16"
    )
    assert project.status is ProjectStatus.UPLOADED
    assert project.current_step is ProjectStep.UPLOADS
    assert (project.grid_width, project.grid_height, project.board_size) == (58, 58, 29)
    assert project.revision == 0
```

Run:

```bash
.venv/bin/python -m pytest tests/unit/projects/test_project_service.py -q
```

Expected: FAIL because project modules do not exist.

- [ ] **Step 2: Extend the Phase 0 enums and implement SQLAlchemy models**

Enums include the project states from Global Constraints and:

```python
class ProjectStep(StrEnum):
    UPLOADS = "UPLOADS"
    ENTRY_CHECK = "ENTRY_CHECK"
    IDENTITY_EXTRACTION = "IDENTITY_EXTRACTION"
    IDENTITY_GENERATION = "IDENTITY_GENERATION"
    IDENTITY_REVIEW = "IDENTITY_REVIEW"


class PhotoView(StrEnum):
    FRONT = "FRONT"
    CAT_LEFT_FRONT_45 = "CAT_LEFT_FRONT_45"
    CAT_RIGHT_FRONT_45 = "CAT_RIGHT_FRONT_45"
```

`BrowserSession` stores a random session ID, SHA-256 token digest, `last_seen_at`, `expires_at` and nullable revocation time, never the cookie token. It uses a sliding 180-day expiry. `Project` stores UUID, browser session ID, status, current step, revision, grid constants, consent version/time, created/updated/last-activity times, and nullable tombstone time. Use UTC-aware datetimes.

- [ ] **Step 3: Implement signed opaque-cookie access and routes**

`POST /projects` accepts:

```json
{
  "thirdPartyProcessingConsent": true,
  "consentTextVersion": "2026-07-16"
}
```

Factor one `ensure_browser_session` helper shared by project creation and token-free bootstrap. If the request already carries a valid unexpired `pindou_session`, reuse that exact BrowserSession and do not rotate its credential; otherwise create 32 random bytes, store only their digest, sign `{sessionId, token}` with `itsdangerous`, and set the cookie with explicit `Max-Age=15552000`, matching UTC `Expires`, HttpOnly, SameSite=Lax and configured Secure. This lets one physical browser own multiple sequential cat projects and later revisit each. A valid user-facing request atomically refreshes `BrowserSession.last_seen_at/expires_at` and reissues the same logical session cookie at most once per day; status-poll/Worker reads do not. GET/DELETE with a different, expired or revoked session return 404 so project existence is not disclosed. Phase 5 genuine `USER` asset access refreshes both this session expiry and the separate approved-asset TTL.

`ProjectResponse` includes three explicit slots, `uploadsComplete`, nullable `intermediateExpiresAt`, nullable `assetExpiresAt`, and no filesystem path or token. Both project-level deadlines remain null in Phase 2 because retention policy belongs to Phase 5; upload slots already expose their own raw-photo `expiresAt`. No ambiguous project-level `expiresAt` field is created.

- [ ] **Step 4: Write and pass API ownership tests**

```python
def test_second_browser_cannot_read_project(client_factory):
    owner = client_factory()
    stranger = client_factory()
    created = owner.post("/api/v1/projects", json=CONSENT).json()
    assert stranger.get(f"/api/v1/projects/{created['projectId']}").status_code == 404

def test_persistent_cookie_survives_browser_restart(browser_context_factory):
    owner = browser_context_factory(persistent=True)
    project_id = create_project(owner)
    saved_state = owner.storage_state()
    reopened = browser_context_factory(storage_state=saved_state)
    assert reopened.get(f"/api/v1/projects/{project_id}").status_code == 200

def test_deleted_project_cannot_be_recovered_with_old_cookie(owner_client):
    project_id = create_project(owner_client)
    cookie = owner_client.cookies.copy()
    owner_client.delete(f"/api/v1/projects/{project_id}")
    restarted = client_with_cookies(cookie)
    assert restarted.get(f"/api/v1/projects/{project_id}").status_code == 410


def test_creating_a_second_project_reuses_session_and_keeps_first_accessible(
    owner_client
):
    first = create_project(owner_client)
    first_cookie = owner_client.cookies["pindou_session"]
    second = create_project(owner_client)
    assert owner_client.cookies["pindou_session"] == first_cookie
    assert owner_client.get(f"/api/v1/projects/{first}").status_code == 200
    assert owner_client.get(f"/api/v1/projects/{second}").status_code == 200


def test_two_handoffs_move_one_project_phone_to_desktop_and_back(client_factory):
    phone = client_factory()
    desktop = client_factory()
    project_id = create_project(phone)
    revision = get_project(phone, project_id).revision
    first = issue_handoff(phone, project_id)
    bootstrapped = bootstrap_browser_session(desktop)
    assert bootstrapped.status_code == 204
    assert "pindou_session=" in bootstrapped.headers["set-cookie"]
    claimed = claim_handoff(desktop, first)
    assert claimed.status_code == 200
    assert desktop.get(f"/api/v1/projects/{project_id}").status_code == 200
    assert phone.get(f"/api/v1/projects/{project_id}").status_code == 404
    assert get_project(desktop, project_id).revision == revision

    second = issue_handoff(desktop, project_id)
    assert claim_handoff(phone, second).status_code == 200
    assert phone.get(f"/api/v1/projects/{project_id}").status_code == 200
    assert desktop.get(f"/api/v1/projects/{project_id}").status_code == 404
    assert get_project(phone, project_id).revision == revision


def test_lost_claim_response_is_idempotently_recoverable_by_same_receiver(
    owner, receiver, stranger
):
    project_id = create_project(owner)
    bootstrap_browser_session(receiver)
    token = issue_handoff(owner, project_id)
    simulate_response_loss_after_claim_commit(receiver, token)
    replay = claim_handoff(receiver, token)
    assert replay.status_code == 200
    assert replay.json()["projectId"] == project_id
    assert owner.get(f"/api/v1/projects/{project_id}").status_code == 404
    assert claim_handoff(stranger, token).status_code == 404


def test_lost_claim_response_and_page_crash_recovers_from_owned_project_list(
    owner, receiver
):
    project_id = create_project(owner)
    bootstrap_browser_session(receiver)
    token = issue_handoff(owner, project_id)
    simulate_response_loss_after_claim_commit(receiver, token)
    destroy_page_and_forget_in_memory_token(receiver)
    reopened = reopen_root(receiver)
    assert project_id in {item["projectId"] for item in reopened.get("/api/v1/projects").json()}
    assert project_id not in {
        item["projectId"] for item in owner.get("/api/v1/projects").json()
    }


def test_handoff_rotation_expiry_and_double_claim_fail_closed(
    owner, receiver_a, receiver_b, fake_clock
):
    project_id = create_project(owner)
    old = issue_handoff(owner, project_id)
    new = issue_handoff(owner, project_id)
    assert claim_handoff(receiver_a, old).status_code == 404
    fake_clock.advance(minutes=10)
    assert claim_handoff(receiver_a, new).status_code == 404

    fresh = issue_handoff(owner, project_id)
    first, second = claim_concurrently(receiver_a, receiver_b, fresh)
    assert sorted([first.status_code, second.status_code]) == [200, 404]


def test_claim_wins_against_stale_owner_write_without_post_claim_mutation(
    owner, receiver, project_with_upload, write_claim_race
):
    before = project_with_upload.revision
    write_status, claim_status = write_claim_race(owner, receiver, project_with_upload)
    assert claim_status == 200
    assert write_status in {200, 404}
    if write_status == 200:
        assert mutation_committed_before_claim(project_with_upload.id)
    assert no_old_owner_write_committed_after_claim(project_with_upload.id)
```

Run:

```bash
.venv/bin/python -m alembic upgrade head
.venv/bin/python -m pytest tests/unit/projects/test_project_service.py \
  tests/integration/api/test_project_routes.py -q
```

Expected: all tests pass; migration `0002` creates `browser_sessions`, `projects` and `ownership_handoffs` after Phase 0 `0001_foundation`.

`OwnershipHandoff` stores UUID, project ID, unique token digest, issuing browser-session ID, created/expiry times, nullable claimed/revoked times and nullable claiming browser-session ID. Its project FK uses `ON DELETE CASCADE`; the issuer-session FK uses `ON DELETE CASCADE` so purging an unclaimed issuer invalidates its tokens, and nullable claimant-session FK uses `ON DELETE SET NULL`. The raw token is never stored. Issuance uses 32 CSPRNG bytes encoded base64url, hashes them with SHA-256, expires at exactly `createdAt + 10 minutes`, and in one `BEGIN IMMEDIATE` transaction verifies current ownership, calls the transaction-bound `require_not_effectively_expired(project, now)` seam, and revokes every prior unclaimed token for that project. In Phase 2 the project-level expiry fields are null, so the seam checks tombstone only; Phase 5 fills the exact effective-TTL behavior without changing the call site. It returns the raw token exactly once as `/handoff#<token>` with `Cache-Control: no-store` and `Referrer-Policy: no-referrer`.

`POST /browser-sessions/bootstrap` accepts no token, project ID or request body. With exact same-origin CSRF checks, it returns 204 for an already valid session or creates a new random BrowserSession and returns its signed `pindou_session` HttpOnly cookie; replay is safe and never changes project ownership. The claim endpoint requires that confirmed receiver session and never creates a credential. It verifies handoff digest, `now < expiresAt`, issuer still equals the project's current owner, and calls `require_not_effectively_expired` in the same transaction before any activity refresh. For an unclaimed token it consumes the token, stores `claimed_by_session_id`, revokes all siblings and replaces only `Project.browser_session_id`; only then does it record legitimate user activity. If a committed claim response was lost, replay by that exact `claimed_by_session_id` returns the same ProjectResponse only while it remains current owner; any other session, or the same session after a later handoff, receives 404. This is idempotent response recovery, not a second ownership transfer. Claim does not increment content revision, reset `currentStep`, cancel a run or revoke either browser session. New owner requests see persisted progress immediately; every old-owner item-scoped project read/write returns 404. All project mutations, including later upload/job/draft/approval/export routes, use a transaction-scoped owner guard rather than a permission result cached before the write transaction. A fresh token may later transfer the same project back to the still-valid old browser session.

`GET /projects` requires a valid BrowserSession and returns a list sorted by `(lastActivityAt desc, projectId)` containing only that session's current non-tombstoned projects. Each `ProjectSummary` exposes `projectId`, `status`, `currentStep`, `currentGenerationJobId`, `activeAssetVersionId` and `lastActivityAt`; it contains no image, storage key, token or foreign project count. This is anonymous-session recovery, not an account or public listing. Bootstrap, issue and claim enforce exact same-origin `Origin`/CSRF policy. Tests additionally cover response loss after committed claim plus same-receiver replay, total page-memory loss followed by root/list recovery, old-owner list removal, other-session replay rejection, a cookie-less fresh receiver bootstrapping then immediately claiming/reading, forged token, exact 10-minute boundary, issuer no longer current, tombstoned project, new-token rotation, two concurrent claimants with one winner, running-job continuity, and old-owner GET/PUT/PATCH/POST/DELETE denial. A redaction test proves no raw token, complete claim URL, cookie or claim body appears in database rows, access/application logs or tracing fields.

- [ ] **Step 5: Regenerate contracts and commit**

```bash
make contracts
pnpm contracts:check
git add apps/api/src/pindou_pet/domain/enums.py \
  apps/api/src/pindou_pet/infrastructure/security.py \
  apps/api/src/pindou_pet/modules/projects apps/api/src/pindou_pet/api migrations/env.py \
  migrations/versions/0002_sessions_projects.py tests/unit/projects \
  tests/integration/api/test_project_routes.py packages/contracts
git commit -m "feat: add anonymous project lifecycle"
```

---

### Task 3: Normalize and privately store the three guided uploads

**Files:**
- Modify: `apps/api/src/pindou_pet/infrastructure/storage.py`
- Create: `apps/api/src/pindou_pet/modules/uploads/image_normalizer.py`
- Create: `apps/api/src/pindou_pet/modules/uploads/models.py`
- Create: `apps/api/src/pindou_pet/modules/uploads/schemas.py`
- Create: `apps/api/src/pindou_pet/modules/uploads/repository.py`
- Create: `apps/api/src/pindou_pet/modules/uploads/service.py`
- Create: `apps/api/src/pindou_pet/modules/uploads/routes.py`
- Create: `migrations/versions/0003_uploads.py`
- Create: `tests/unit/uploads/test_image_normalizer.py`
- Create: `tests/unit/uploads/test_upload_service.py`
- Create: `tests/integration/api/test_upload_routes.py`
- Create: `tests/fixtures/images/oriented-cat.jpg` as a programmatically generated synthetic shape fixture
- Create: `tests/fixtures/images/clear-cat.png` as a programmatically generated synthetic shape fixture
- Create: `tests/fixtures/generate_images.py`
- Modify: `apps/api/src/pindou_pet/api/router.py`

**Interfaces:**
- Produces: `normalize_upload(raw: bytes, limits: ImageLimits) -> NormalizedImage`
- Consumes: Phase 0 `ObjectStorage.put_atomic(namespace: str, data: bytes) -> StoredObject`, which returns a content-addressed object
- Produces: upload PUT/DELETE endpoints with fixed `PhotoView`
- Produces: `replace_upload(project_id, browser_session_id, photo_view, raw) -> PhotoUpload` and `delete_upload(project_id, browser_session_id, photo_view)`

- [ ] **Step 1: Write failing EXIF, limit, and atomic-storage tests**

First create the fixtures with Pillow in `generate_images.py`: draw geometric cat-like ellipses/triangles on a solid background, add EXIF orientation `6` only to `oriented-cat.jpg`, and include no real photograph or user media.

```bash
.venv/bin/python tests/fixtures/generate_images.py
```

Expected: the two fixture files are regenerated byte-identically.

```python
def test_normalization_applies_orientation_and_removes_metadata(oriented_jpeg):
    result = normalize_upload(oriented_jpeg, DEFAULT_LIMITS)
    image = Image.open(BytesIO(result.png_bytes))
    assert image.size == result.oriented_size
    assert image.getexif() == {}
    assert result.media_type == "image/png"


def test_rejects_decompression_bomb_before_storage(oversized_header):
    with pytest.raises(ImageRejected, match="64 megapixels"):
        normalize_upload(oversized_header, DEFAULT_LIMITS)
```

Run:

```bash
.venv/bin/python -m pytest tests/unit/uploads/test_image_normalizer.py -q
```

Expected: FAIL because normalizer/storage are absent.

- [ ] **Step 2: Implement bounded deterministic PNG normalization**

Use exact default limits: 20 MiB encoded input, 64 megapixels decoded, minimum short edge 512, accepted decoded formats JPEG/PNG/WebP. Read at most `20 MiB + 1 byte`; detect content by Pillow decode, not extension or MIME. Apply `ImageOps.exif_transpose`, convert to sRGB RGB, and encode PNG without EXIF or source filename. Hash normalized PNG bytes.

Reuse Phase 0 `LocalObjectStorage.put_atomic(namespace=..., data=...)`: the storage layer validates containment, writes atomically, and returns a content-addressed key. Pass namespace `projects/{project_id}/uploads`; random project/upload IDs live in the namespace and DB record, while content addressing remains authoritative. Do not redefine a caller-supplied storage key API.

Migration `0003_uploads.py` also creates the minimal durable `deletion_items` seam before upload replacement can need it: UUID, project ID with `ON DELETE CASCADE` FK, target kind, opaque target key, status (`PENDING|FAILED|CONFIRMED`), due/created/confirmed timestamps, attempt count and sanitized error code, with a unique `(project_id, target_kind, target_key)` constraint. The project row may be purged only after every item is `CONFIRMED`; the cascade then removes those completed ledger rows in the same final transaction. Later explicit project deletion and Phase 5 retention extend this same table; they do not recreate it.

- [ ] **Step 3: Write failing slot/revision/TTL tests**

```python
def test_upload_uses_random_name_and_fixed_24_hour_expiry(upload_service, project, clock):
    upload = upload_service.replace(project.id, PhotoView.FRONT, CLEAR_CAT_BYTES)
    key_parts = PurePosixPath(upload.storage_key).parts
    UUID(key_parts[-2])
    assert key_parts[-1] == upload.content_hash
    assert "clear-cat" not in upload.storage_key
    assert upload.expires_at == clock.now() + timedelta(hours=24)


def test_replacing_slot_increments_revision_and_removes_old_reference(upload_service, project):
    first = upload_service.replace(project.id, PhotoView.FRONT, CLEAR_CAT_BYTES)
    second = upload_service.replace(project.id, PhotoView.FRONT, OTHER_CAT_BYTES)
    assert second.id != first.id
    assert upload_service.project_revision(project.id) == 2
    assert upload_service.get(project.id, PhotoView.FRONT).id == second.id
```

- [ ] **Step 4: Implement upload transaction and endpoints**

`PhotoUpload` has unique `(project_id, photo_view)`, an `ON DELETE CASCADE` project FK, normalized content hash, random opaque upload ID, dimensions, created time, immutable `expires_at`, and nullable deletion time. Call storage with namespace `projects/{project_id}/uploads/{upload_id}` so the logical stored name uses the random ID while the final basename remains the Phase 0 content hash; never retain the source filename. File write occurs before DB reference switch; DB failure deletes the new file. After commit, old file deletion failure immediately inserts an item into the `0003` deletion ledger rather than restoring the old reference; Task 7 supplies whole-project inventory/cancellation on the same seam.

Upload and delete increment `Project.revision`. The route authenticates only the browser session; after any pre-transaction image normalization/file staging, the DB reference switch opens `BEGIN IMMEDIATE`, calls `require_project_owner_in_transaction(project_id, browser_session_id)`, then applies the slot/revision mutation. If ownership changed while bytes were staged, the transaction returns 404 and deletes the unreferenced new object. Three slots being present sets `uploadsComplete=true` but keeps `status=UPLOADED`; `currentStep` becomes `ENTRY_CHECK` only when generation is requested.

- [ ] **Step 5: Verify routes, contracts, and commit**

```bash
.venv/bin/python -m alembic upgrade head
.venv/bin/python -m pytest tests/unit/uploads \
  tests/integration/api/test_upload_routes.py -q
make contracts
pnpm contracts:check
git add apps/api/src/pindou_pet/infrastructure/storage.py \
  apps/api/src/pindou_pet/modules/uploads migrations/versions/0003_uploads.py \
  tests/unit/uploads tests/integration/api/test_upload_routes.py tests/fixtures/images \
  packages/contracts
git commit -m "feat: normalize and store guided cat uploads"
```

Expected: three-view route tests pass and no original filename/EXIF survives.

---

### Task 4: Implement deterministic entry checks and the displayable identity trait card

**Files:**
- Create: `apps/api/src/pindou_pet/modules/uploads/quality.py`
- Create: `apps/api/src/pindou_pet/modules/uploads/identity_traits.py`
- Create: `tests/unit/uploads/test_quality.py`
- Create: `tests/unit/uploads/test_identity_traits.py`
- Create: `tests/fixtures/images/blurred-cat.png` as a programmatically generated synthetic shape fixture

**Interfaces:**
- Produces: `inspect_photo_set(uploads, perception_bundle) -> EntryInspection`
- Produces: `extract_identity_traits_checkpoint(uploads, masks, manifest) -> IdentityTraitsCheckpoint`
- Consumes: Phase 1 validated `pindou_pet.domain.identity_traits.extract_identity_traits`; Phase 2 must not fork its algorithm
- Produces blocking issue codes: `MISSING_PHOTO`, `BLUR`, `OVEREXPOSED`, `UNDEREXPOSED`, `BODY_CROPPED`, `SEVERE_OCCLUSION`, `NO_CAT`, `WRONG_SPECIES`, `MULTIPLE_CATS`, `DUPLICATE_VIEW`, `REAR_VIEW`, `VIEW_OUT_OF_RANGE`, `DIFFERENT_CAT`; and uncertainty confirmations `VIEW_CONFIRMATION_REQUIRED`, `SAME_CAT_CONFIRMATION_REQUIRED`.
- Consumes: the entire Phase 1 frozen perception bundle: cat instance/foreground model, deterministic prompt derivation, and promptable segmenter

- [ ] **Step 1: Write failing checks for photo-specific issues**

```python
def test_blur_issue_identifies_exact_slot(inspector, blurred_front, clear_side_views):
    result = inspector.inspect((blurred_front, *clear_side_views))
    assert result.blocking_issues == [
        EntryIssue(photo_view=PhotoView.FRONT, code="BLUR", message="正面照片过于模糊，请重拍")
    ]


def test_low_confidence_identity_requires_confirmation_not_silent_rejection(inspector, uncertain_set):
    result = inspector.inspect(uncertain_set)
    assert result.blocking_issues == []
    assert result.confirmations_required == ["SAME_CAT_CONFIRMATION_REQUIRED"]


def test_clear_repeated_or_rear_view_is_blocking(inspector, repeated_set, rear_set):
    assert inspector.inspect(repeated_set).blocking_issues[0].code == "DUPLICATE_VIEW"
    assert inspector.inspect(rear_set).blocking_issues[0].code == "REAR_VIEW"


@pytest.mark.parametrize(
    ("slot", "yaw", "code"),
    [
        (PhotoView.CAT_LEFT_FRONT_45, 29.0, "VIEW_OUT_OF_RANGE"),
        (PhotoView.CAT_LEFT_FRONT_45, 30.0, None),
        (PhotoView.CAT_LEFT_FRONT_45, 60.0, None),
        (PhotoView.CAT_LEFT_FRONT_45, 61.0, "VIEW_OUT_OF_RANGE"),
    ],
)
def test_side_front_angle_boundaries(inspector, slot, yaw, code):
    result = inspector.inspect(with_frozen_view_output(slot=slot, yaw=yaw, confidence=0.99))
    assert first_code_for(result, slot) == code


def test_clear_different_cat_is_blocking_but_borderline_case_requests_confirmation(
    inspector, clear_different_set, borderline_identity_set
):
    assert inspector.inspect(clear_different_set).blocking_issues[0].code == "DIFFERENT_CAT"
    assert inspector.inspect(borderline_identity_set).confirmations_required == [
        "SAME_CAT_CONFIRMATION_REQUIRED"
    ]
```

Run:

```bash
.venv/bin/python -m pytest tests/unit/uploads/test_quality.py -q
```

Expected: FAIL because quality module is absent.

- [ ] **Step 2: Implement deterministic structural checks**

Use variance of Laplacian on a 512px grayscale proxy for blur, luminance histogram tails for exposure, the Phase 1 frozen general instance labels for cat-vs-dog and instance count, automatically derived part masks for body/tail/paw completeness and occlusion, and frozen view/identity embeddings for duplicate/rear/different-cat confidence bands. Missing slots are rejected before model work. Thresholds and the exact mapping from confident evidence to every blocking code live in a versioned `EntryInspectionManifest` whose checksum enters the generation input hash. No product request or manifest contains hand-authored segmentation prompts.

Slot assignment supplies the requested view. Consume only the frozen view-yaw/re-ID models and thresholds from `config/segmentation.freeze.yaml`. Positive yaw means camera on cat's left: a confident left-front slot must be within inclusive `[30°,60°]`, right-front within `[-60°,-30°]`, and a confident out-of-range value returns `VIEW_OUT_OF_RANGE`; a confidently repeated angle or rear view is also blocking. Only low view confidence/threshold-borderline evidence returns `VIEW_CONFIRMATION_REQUIRED`. A confidently different identity is blocking; only a score inside the frozen identity uncertainty band returns `SAME_CAT_CONFIRMATION_REQUIRED`. The initial generation request is blocked until uncertainty confirmations are true. Every blocking issue identifies the exact `PhotoView` (or ordered pair for cross-photo duplicate/different-cat evidence) and a localized reason.

- [ ] **Step 3: Write failing identity-card extraction tests**

```python
def test_identity_card_contains_all_required_display_fields(trait_extractor, clear_three_view_set):
    checkpoint = trait_extractor.extract(clear_three_view_set)
    assert checkpoint.traits.face_shape
    assert checkpoint.traits.ear_shape
    assert checkpoint.traits.eye_description
    assert checkpoint.traits.body_build
    assert checkpoint.traits.primary_coat_colors
    assert checkpoint.traits.distinctive_markings is not None


def test_trait_card_and_hash_are_deterministic(trait_extractor, clear_three_view_set):
    first = trait_extractor.extract(clear_three_view_set)
    second = trait_extractor.extract(clear_three_view_set)
    assert first.traits == second.traits
    assert first.content_hash == second.content_hash
```

Run:

```bash
.venv/bin/python -m pytest tests/unit/uploads/test_identity_traits.py -q
```

Expected: FAIL because `identity_traits.py` is absent.

- [ ] **Step 4: Wrap the Phase 1 validated identity extractor as a durable checkpoint**

Call the Phase 1 core extractor with frozen body/head/eye masks across the three ordered views. `uploads/identity_traits.py` is responsible only for loading authenticated content-addressed objects, verifying source/mask hashes, calling the core function, and atomically persisting its canonical result; it must not duplicate face/ear/eye/body/color/marking calculations.

Return the existing Phase 0 `IdentityTraits` plus `sourceImageHashes`, extraction-manifest version/checksum and `contentHash`. The checkpoint is displayable JSON and is passed unchanged into `GenerationRequest.identity_traits`; no Provider-generated prose becomes authoritative.

- [ ] **Step 5: Verify and commit**

```bash
.venv/bin/python -m pytest tests/unit/uploads/test_quality.py \
  tests/unit/uploads/test_identity_traits.py -q
.venv/bin/python -m ruff check apps/api/src/pindou_pet/modules/uploads/quality.py \
  tests/unit/uploads/test_quality.py
git add apps/api/src/pindou_pet/modules/uploads/quality.py \
  apps/api/src/pindou_pet/modules/uploads/identity_traits.py \
  tests/unit/uploads/test_quality.py tests/unit/uploads/test_identity_traits.py \
  tests/fixtures/images/blurred-cat.png
git commit -m "feat: inspect photos and extract identity traits"
```

Expected: deterministic issue ordering is `FRONT`, `CAT_LEFT_FRONT_45`, `CAT_RIGHT_FRONT_45`, then issue code.

---

### Task 5: Persist idempotent generation runs and stage jobs

**Files:**
- Create: `apps/api/src/pindou_pet/domain/hashing.py`
- Create: `apps/api/src/pindou_pet/modules/jobs/models.py`
- Create: `apps/api/src/pindou_pet/modules/jobs/schemas.py`
- Create: `apps/api/src/pindou_pet/modules/jobs/repository.py`
- Create: `apps/api/src/pindou_pet/modules/jobs/service.py`
- Create: `apps/api/src/pindou_pet/modules/jobs/routes.py`
- Create: `migrations/versions/0004_generation_jobs.py`
- Create: `tests/unit/domain/test_hashing.py`
- Create: `tests/unit/jobs/test_job_service.py`
- Create: `tests/integration/api/test_generation_job_routes.py`
- Modify: `apps/api/src/pindou_pet/api/router.py`
- Modify: `apps/api/src/pindou_pet/modules/projects/models.py`
- Modify: `apps/api/src/pindou_pet/modules/projects/schemas.py`

**Interfaces:**
- Produces: frozen generation-job endpoints
- Produces: `compute_stage_input_hash(...) -> str`
- Produces: `create_generation_job(project_id, request, session_id) -> GenerationJob`
- Database uniqueness: `(project_id, stage, input_hash, project_revision)`

- [ ] **Step 1: Write failing canonical-hash tests**

```python
def test_hash_is_independent_of_mapping_insertion_order(stage_hash_input):
    first = compute_stage_input_hash(**stage_hash_input)
    reordered = {**stage_hash_input, "feedback": dict(reversed(stage_hash_input["feedback"].items()))}
    assert compute_stage_input_hash(**reordered) == first


def test_feedback_seed_and_attempt_change_hash(stage_hash_input):
    base = compute_stage_input_hash(**stage_hash_input)
    assert compute_stage_input_hash(**{**stage_hash_input, "seed": 2}) != base
    assert compute_stage_input_hash(**{**stage_hash_input, "attempt": 1}) != base
```

Canonical JSON uses UTF-8, sorted dictionary keys, fixed `PhotoView` order and compact separators. The hash includes stage, three normalized image hashes, revision, request kind, server-derived attempt, seed, feedback, Provider freeze checksum, segmentation freeze checksum, and entry-inspection manifest checksum.

- [ ] **Step 2: Write failing job-rule tests**

```python
def test_duplicate_initial_click_returns_existing_job(job_service, complete_project, initial_request):
    first = job_service.create(complete_project.id, initial_request)
    second = job_service.create(complete_project.id, initial_request)
    assert second.id == first.id
    assert job_service.queue_count == 1


def test_different_seed_cannot_create_a_second_initial_run(
    job_service, complete_project, initial_request
):
    first = job_service.create(complete_project.id, initial_request)
    with pytest.raises(InitialDraftAlreadyExists):
        job_service.create(
            complete_project.id,
            initial_request.model_copy(update={"seed": initial_request.seed + 1}),
        )
    assert job_service.initial_run_ids(complete_project.id) == [first.run_id]
    assert job_service.queue_count == 1

def test_concurrent_duplicate_proposals_leave_one_run_and_one_stage(
    job_service, complete_project, initial_request
):
    first, second = job_service.create_concurrently(
        complete_project.id,
        initial_request,
        proposed_run_ids=("run-a", "run-b"),
    )
    assert first.job_id == second.job_id
    assert first.run_id == second.run_id
    assert job_service.run_count == 1
    assert job_service.stage_count == 1


def test_stale_revision_returns_conflict(job_service, complete_project, initial_request):
    initial_request.expected_revision -= 1
    with pytest.raises(RevisionConflict):
        job_service.create(complete_project.id, initial_request)


def test_only_one_full_regeneration_is_allowed(job_service, identity_review_project):
    job_service.create(identity_review_project.id, FULL_REGENERATION)
    with pytest.raises(RegenerationLimitReached):
        job_service.create(identity_review_project.id, FULL_REGENERATION)


def test_full_regeneration_reuses_entry_and_identity_checkpoint(
    job_service, identity_review_project, counters
):
    run = job_service.create(identity_review_project.id, FULL_REGENERATION)
    assert run.stage_kinds == ["IDENTITY_GENERATION"]
    assert run.identity_traits_hash == identity_review_project.identity_traits_hash
    assert counters.entry_inspections == 0
    assert counters.identity_extractions == 0


def test_handoff_preserves_one_active_generation_run(
    job_service, complete_project, owner, receiver, initial_request
):
    run = job_service.create(complete_project.id, initial_request)
    token = issue_handoff(owner, complete_project.id)
    claim_handoff(receiver, token)
    assert current_run_id(receiver, complete_project.id) == run.run_id
    assert job_service.run_count_for_project(complete_project.id) == 1
    assert get_project(receiver, complete_project.id).current_step == "IDENTITY_EXTRACTION"
    assert get_project(owner, complete_project.id).status_code == 404
```

- [ ] **Step 3: Implement run/stage schema and transaction**

Use `GenerationRun` for the user-visible request and `StageJob` for synchronous `ENTRY_CHECK`, queued local `IDENTITY_EXTRACTION`, and later `IDENTITY_GENERATION`. `GenerationRun` persists `kind`, `request_input_hash`, `project_revision` and server attempt with a unique `(project_id, kind, request_input_hash, project_revision, attempt)` constraint. Migration `0004_generation_jobs.py` creates run tables first, then uses Alembic batch mode to add nullable indexed `projects.current_generation_run_id` with an `ON DELETE SET NULL` FK to the latest public `GenerationRun.id`; project purge also clears this pointer before cascading run deletion, avoiding a cyclic-delete block. Generated `ProjectResponse` and every successful handoff claim expose it as `currentGenerationJobId`, while internal stage and Provider IDs remain private. A short `BEGIN IMMEDIATE` transaction first calls `require_project_owner_in_transaction(project_id, browser_session_id)`, then checks the project-level attempt rule, get-or-creates the run by its key, sets `current_generation_run_id` to that same public run, and get-or-creates its first stage; a losing proposed UUID is never inserted. For `INITIAL_DRAFT`, an exact repeat of the same request returns its existing run, but any active or terminal `INITIAL_DRAFT` with a different seed/input hash rejects with `InitialDraftAlreadyExists`; seed changes cannot bypass the one-initial cost boundary. This check and insert occur inside the same transaction. If the stage business key already exists, return its existing `run_id` rather than attaching a new run. Entry check and any required user confirmations pass before the API returns 202. That transaction validates revision/three uploads/limits, derives server attempt, creates or returns the unique run, sets `accepted_at`, creates only the identity-extraction stage, and enqueues its ID after commit. Successful identity extraction atomically saves its checkpoint and creates/enqueues the generation stage whose input hash includes the new trait-card hash.

For `FULL_REGENERATION`, require the latest successful identity review and immutable identity-trait/source-hash checkpoint. Do not call `inspect_photo_set`, do not read upload bytes for quality checks, and do not create `ENTRY_CHECK` or `IDENTITY_EXTRACTION`; set the new run's `accepted_at`, reference the existing checkpoint hash, and create only `IDENTITY_GENERATION` with the new feedback/attempt/seed input hash.

`GenerationRun` includes `accepted_at`, `explanation_deadline_at`, nullable `reconciliation_required_at`, nullable `result_ready_at`, nullable `initial_draft_ready_at`, nullable `shape_accepted_at`, `server_generation_wait_ms`, `provider_wait_ms`, and project-level `cumulative_generation_wait_ms`. `accepted_at` is the instant the API returns 202 and `explanation_deadline_at = accepted_at + 600 seconds`; for initial it is after entry checks but before queued identity extraction, and for full regeneration it is before the reused-checkpoint generation stage. `result_ready_at` is set only when that attempt's transparent high-resolution PNG is readable; `initial_draft_ready_at` aliases that boundary only for the initial attempt. `server_generation_wait_ms = result_ready_at - accepted_at`; it includes applicable identity extraction, queue, Provider and local alpha work. Add it to the project's cumulative value for `INITIAL_DRAFT` and `FULL_REGENERATION`. It excludes upload/entry-check time, user review and later local-only layer splitting. `shape_accepted_at` records the separate user confirmation. `provider_wait_ms` remains separate. Phase 5 enforces the deadline and exposes an explanatory reconciliation state; Phase 2 must persist the boundary from the first accepted transaction so restarts cannot reset it.

`GenerationRun.project_id` uses `ON DELETE CASCADE`; every `StageJob` and identity/result checkpoint cascades from its run/project parent. `StageJob` fields include UUID, run/project IDs, stage, input hash, project revision, status, opaque idempotency key, nullable Provider job ID, RQ job ID, retry count, nonnegative persisted `poll_count`, safe error code/message, nullable `reconciliation_required_at`, checkpoint key/hash, timestamps and next poll time. Scheduling poll `N` and persisting `poll_count=N+1/next_poll_at` occur in one database transaction before enqueue-after-commit; recovery uses that persisted value for the next deterministic RQ ID, so Redis loss cannot reset it. The identity extraction checkpoint stores canonical `IdentityTraits` JSON/hash; the generation stage references that hash. Raw Provider JSON has no column.

`GET .../generation-jobs/{jobId}` authenticates the BrowserSession, scopes the public run ID to the path project, and requires that session to be the project's current owner; a foreign run ID and wrong/old owner both return 404. It returns `identityTraits` and `identityTraitsHash` after extraction succeeds, plus `acceptedAt`, `explanationDeadlineAt`, `reconciliationRequiredAt`, `resultReadyAt`, `initialDraftReadyAt`, `serverGenerationWaitMs`, `providerWaitMs`, `cumulativeGenerationWaitMs`, attempt and safe stage/error fields. `GET /projects/{projectId}` and claim responses return the same public run ID as `currentGenerationJobId`, so a new owner or refreshed browser can resume polling/result/accept-shape without browser-local job state. It never returns internal stage IDs, source object keys or raw Provider identifiers. Add a handoff test proving old owner and stranger status GETs return 404 while the new owner receives the unchanged public run.

Add a unit test with a fake clock and empty queue path asserting `accepted_at`, `result_ready_at`, `initial_draft_ready_at`, `server_generation_wait_ms`, `provider_wait_ms`, and `cumulative_generation_wait_ms` are recorded from the defined boundaries, and that Provider wait is strictly a subset/diagnostic rather than the cumulative value. This phase records whether initial elapsed time exceeds 120 seconds; the formal five-cat threshold assertion belongs to Phase 5.

- [ ] **Step 4: Implement routes and exact conflicts**

Return 202 for a new job and 200 for an identical existing job. Reuse the Phase 0 error envelope: stale revision is `409 {"error":{"code":"REVISION_CONFLICT","message":"Project revision is stale","details":{"currentRevision":N}}}`. A 422 stores ordered photo issues or confirmation requirements inside `error.details` before any Provider job is created; no route returns a flat `{code:...}` shape.

- [ ] **Step 5: Verify, regenerate contracts, and commit**

```bash
.venv/bin/python -m alembic upgrade head
.venv/bin/python -m pytest tests/unit/domain/test_hashing.py \
  tests/unit/jobs/test_job_service.py tests/integration/api/test_generation_job_routes.py -q
make contracts
pnpm contracts:check
git add apps/api/src/pindou_pet/domain/hashing.py apps/api/src/pindou_pet/modules/jobs \
  apps/api/src/pindou_pet/modules/projects/models.py apps/api/src/pindou_pet/modules/projects/schemas.py \
  migrations/versions/0004_generation_jobs.py tests/unit/domain/test_hashing.py \
  tests/unit/jobs/test_job_service.py tests/integration/api/test_generation_job_routes.py \
  packages/contracts
git commit -m "feat: persist idempotent generation stages"
```

---

### Task 6: Run Provider work through RQ with one durable SQLite lease

**Files:**
- Modify: `apps/api/src/pindou_pet/infrastructure/queue.py`
- Create: `apps/api/src/pindou_pet/providers/generation/factory.py`
- Create: `apps/api/src/pindou_pet/modules/jobs/lease.py`
- Create: `apps/api/src/pindou_pet/modules/jobs/tasks.py`
- Create: `apps/api/src/pindou_pet/worker.py`
- Modify: `pyproject.toml`
- Create: `tests/unit/jobs/test_lease.py`
- Create: `tests/integration/jobs/test_rq_lifecycle.py`

**Interfaces:**
- Reuses Phase 0: `QueueGateway.enqueue_submit(stage_job_id)`, `enqueue_poll(stage_job_id, delay_seconds)`, `cancel(rq_job_id)` without adding image-bearing methods
- Produces RQ callables: `submit_stage(stage_job_id: str) -> None`, `poll_stage(stage_job_id: str) -> None`; `submit_stage` dispatches by persisted stage type
- Produces: `pindou-worker` console entry point
- Consumes: passing frozen Provider factory only

- [ ] **Step 1: Write failing lease and ID-only payload tests**

```python
def test_second_generation_cannot_acquire_global_lease(lease_service, first_stage, second_stage):
    assert lease_service.acquire(first_stage.id) is True
    assert lease_service.acquire(second_stage.id) is False


def test_rq_payload_contains_only_stage_job_id(queue_gateway, stage_job):
    rq_id = queue_gateway.enqueue_submit(stage_job.id)
    queued = queue_gateway.fetch(rq_id)
    assert queued.args == (str(stage_job.id),)
    assert queued.kwargs == {}
```

Run:

```bash
RUN_REDIS_TESTS=1 PINDOU_REDIS_URL=redis://127.0.0.1:6379/15 \
  .venv/bin/python -m pytest tests/unit/jobs/test_lease.py \
  tests/integration/jobs/test_rq_lifecycle.py -q
```

Expected: FAIL because queue/lease/tasks are absent.

- [ ] **Step 2: Implement the single-row generation lease**

Migration `0004_generation_jobs.py` creates `generation_lease` with primary key `1`, nullable holder stage ID using `ON DELETE SET NULL`, acquired/heartbeat timestamps. Acquisition uses a short `BEGIN IMMEDIATE` transaction. The same holder may renew; a different holder cannot steal an active or unknown lease. Terminal holder cleanup releases it.

Task 6 reuses the `deletion_items` table already created by `0003_uploads.py`; Phase 5 migration `0008_retention_fields.py` later adds retention scheduling/provider-receipt/orphan fields and indexes rather than assuming or recreating it.

- [ ] **Step 3: Implement submit semantics in the required crash-safe order**

`submit_stage` performs:

1. Load stage and recheck project tombstone.
2. Acquire or renew the one global lease.
3. Load and verify the immutable identity-trait checkpoint, then commit `SUBMITTING` plus precomputed idempotency key.
4. Build `GenerationRequest` with the exact checkpointed `IdentityTraits`, then query Provider by that key.
5. Submit only when query returns no job.
6. Commit Provider job ID and `WAITING_PROVIDER`.
7. Enqueue `poll_stage` after two seconds while retaining the lease.

When `submit_stage` receives an `IDENTITY_EXTRACTION` row, it acquires the same global generation lease, verifies source hashes/tombstone, calls the Phase 1 validated core extractor, atomically persists the identity checkpoint, creates the `IDENTITY_GENERATION` stage with that checkpoint hash, releases the completed local-stage lease, and enqueues the same `submit_stage` entry point for the new ID. Thus local perception and external Provider work are never concurrent. When it receives `IDENTITY_GENERATION`, it reacquires the lease and follows the Provider sequence above.

If submit times out, query once. If a job is found, persist it; if no job can be proven, set `SUBMIT_UNKNOWN`, retain the lease, and do not resubmit. A 5xx before accepted submission receives at most one recorded retry.

- [ ] **Step 4: Implement polling, local alpha derivation, and checkpoint write**

Pending/running states schedule another two-second poll without occupying a worker. Success verifies the normalized PNG, checks tombstone, stores Provider PNG atomically, runs the frozen local segmenter, creates a locally derived transparent PNG, checks tombstone again, stores a checkpoint row/hash, sets the run's `result_ready_at/server_generation_wait_ms`, atomically adds that total to `cumulative_generation_wait_ms`, changes the project to `PROCESSING + IDENTITY_REVIEW`, and releases the lease. Failure stores a safe error, sets the attempt's terminal boundary, derives the observed server wait and atomically adds it to the cumulative value before releasing the lease. The Provider's original alpha is not trusted as the transparency proof.

- [ ] **Step 5: Verify with real Redis and commit**

```bash
redis-cli -u redis://127.0.0.1:6379/15 ping
RUN_REDIS_TESTS=1 PINDOU_REDIS_URL=redis://127.0.0.1:6379/15 \
  .venv/bin/python -m pytest tests/unit/jobs/test_lease.py \
  tests/integration/jobs/test_rq_lifecycle.py -q
git add apps/api/src/pindou_pet/infrastructure/queue.py \
  apps/api/src/pindou_pet/providers/generation/factory.py \
  apps/api/src/pindou_pet/modules/jobs/lease.py \
  apps/api/src/pindou_pet/modules/jobs/tasks.py apps/api/src/pindou_pet/worker.py \
  tests/unit/jobs/test_lease.py tests/integration/jobs/test_rq_lifecycle.py \
  pyproject.toml
git commit -m "feat: execute serial provider jobs through RQ"
```

Expected: integration tests prove one Provider submit for duplicate clicks and RQ payloads contain one UUID string.

---

### Task 7: Add restart recovery, cancellation, and deletion tombstones

**Files:**
- Create: `apps/api/src/pindou_pet/modules/jobs/recovery.py`
- Create: `apps/api/src/pindou_pet/modules/projects/deletion.py`
- Create: `tests/integration/jobs/test_recovery.py`
- Create: `tests/integration/jobs/test_tombstone_race.py`
- Modify: `apps/api/src/pindou_pet/main.py`
- Modify: `apps/api/src/pindou_pet/worker.py`
- Modify: `apps/api/src/pindou_pet/modules/projects/routes.py`
- Modify: `apps/api/src/pindou_pet/modules/jobs/routes.py`

**Interfaces:**
- Produces: `recover_unfinished_jobs() -> RecoverySummary`
- Produces: `request_project_deletion(project_id, owner_session_id) -> DeletionReceipt`
- Produces: `cancel_generation(project_id, generation_run_id, browser_session_id)`, `accept_shape(project_id, generation_run_id, browser_session_id)` and authenticated result streaming

- [ ] **Step 1: Write failing recovery and late-result tests**

```python
def test_recovery_looks_up_submitting_job_instead_of_resubmitting(crash_fixture):
    crash_fixture.stage.status = JobStatus.SUBMITTING
    crash_fixture.provider.lookup_result = "provider-job-existing"
    recover_unfinished_jobs()
    assert crash_fixture.provider.submit_calls == 0
    assert crash_fixture.stage.provider_job_id == "provider-job-existing"


def test_late_provider_result_cannot_recreate_deleted_asset(tombstoned_project, successful_result):
    poll_stage(str(tombstoned_project.stage_id))
    assert not tombstoned_project.storage.exists(successful_result.expected_key)
    assert tombstoned_project.project.tombstoned_at is not None
```

Run:

```bash
.venv/bin/python -m pytest tests/integration/jobs/test_recovery.py \
  tests/integration/jobs/test_tombstone_race.py -q
```

Expected: FAIL because recovery/deletion behavior is absent.

- [ ] **Step 2: Implement recovery without time-based lease stealing**

Startup scans nonterminal stages. Missing RQ jobs are rebuilt from DB IDs. `SUBMITTING` stages query Provider first. `WAITING_PROVIDER` stages resume polling. `SUBMIT_UNKNOWN` remains blocked for operator reconciliation. A lease whose holder is terminal is released; an active or unknown holder is never stolen merely because time elapsed.

FastAPI lifespan performs recovery after Phase 1 freeze and DB checks. `pindou-worker` performs the same recovery before starting one RQ worker with scheduler enabled.

- [ ] **Step 3: Implement transactional deletion tombstones**

`request_project_deletion` opens `BEGIN IMMEDIATE`, first calls `require_project_owner_in_transaction(project_id, owner_session_id)`, then writes the project tombstone, revokes every pending ownership handoff and project access, marks active jobs cancelled where safe, and inserts deletion targets for uploads/checkpoints/Provider jobs. After commit, best-effort Provider cancellation and file deletion run. Every worker checks tombstone before Provider calls, after receiving results, and before each file/DB write. A token racing with deletion either claims first (making the old delete return 404) or is revoked by the tombstone transaction; it can never claim a tombstoned project.

Full hourly TTL cleanup and all retention classes remain Phase 5 scope; this task supplies explicit deletion and the ledger seam only.

- [ ] **Step 4: Implement result streaming and cancellation**

`GET .../result` validates owner session and expiry, streams the locally derived transparent PNG with `Cache-Control: private, no-store`, and never reveals a path. `POST .../cancel` and `POST .../accept-shape` authenticate only the session at the route and pass `browser_session_id` to the service; each begins `BEGIN IMMEDIATE`, calls `require_project_owner_in_transaction`, then mutates only the project's `current_generation_run_id`. A terminal cancel returns its current representation idempotently. Accept-shape sets `shape_accepted_at` idempotently only for the latest successful run and preserves `PROCESSING + IDENTITY_REVIEW`; Phase 3 reads that flag before starting layer generation.

- [ ] **Step 5: Verify and commit**

```bash
RUN_REDIS_TESTS=1 PINDOU_REDIS_URL=redis://127.0.0.1:6379/15 \
  .venv/bin/python -m pytest tests/integration/jobs/test_recovery.py \
  tests/integration/jobs/test_tombstone_race.py tests/integration/api -q
git add apps/api/src/pindou_pet/modules/jobs/recovery.py \
  apps/api/src/pindou_pet/modules/projects/deletion.py apps/api/src/pindou_pet/main.py \
  apps/api/src/pindou_pet/worker.py apps/api/src/pindou_pet/modules/projects/routes.py \
  apps/api/src/pindou_pet/modules/jobs/routes.py tests/integration/jobs
git commit -m "feat: recover jobs and tombstone deleted projects"
```

---

### Task 8: Build the create, upload, progress, and shape-confirmation page

**Files:**
- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `apps/web/src/api/client.ts`
- Modify: `apps/web/src/api/errors.ts`
- Modify: `apps/web/src/app/router.tsx`
- Modify: `apps/web/vite.config.ts`
- Modify: `apps/web/index.html`
- Create: `apps/web/playwright.config.ts`
- Create: `apps/web/e2e/handoff-security.spec.ts`
- Create: `apps/web/src/features/create/model.ts`
- Create: `apps/web/src/features/create/api.ts`
- Create: `apps/web/src/features/create/ConsentStep.tsx`
- Create: `apps/web/src/features/create/PhotoSlots.tsx`
- Create: `apps/web/src/features/create/GenerationProgress.tsx`
- Create: `apps/web/src/features/create/ShapeConfirmation.tsx`
- Create: `apps/web/src/features/create/CreateProjectPage.tsx`
- Create: `apps/web/src/features/create/RecentProjectsPage.tsx`
- Create: `apps/web/src/features/create/__tests__/CreateProjectPage.test.tsx`
- Create: `apps/web/src/features/create/__tests__/ShapeConfirmation.test.tsx`
- Create: `apps/web/src/features/handoff/api.ts`
- Create: `apps/web/src/features/handoff/ProjectHandoffButton.tsx`
- Create: `apps/web/src/features/handoff/HandoffClaimPage.tsx`
- Create: `apps/web/src/features/handoff/__tests__/handoff.test.tsx`

**Interfaces:**
- Produces route: `/projects/:projectId/create`
- Produces route: `/handoff` whose raw token exists only in the URL fragment until immediately consumed
- Root `/` first lists server-owned project summaries, rebuilds local shortcuts and shows a recent-project chooser; it creates a new project only after an explicit user action when the list is empty or the user selects “新建宠物”
- Consumes only `@pindou/contracts` generated types
- Poll interval: exactly 2000ms while job is nonterminal

- [ ] **Step 1: Write the failing guided-flow test**

```tsx
it("requires consent and all three named views before generation", async () => {
  renderCreatePage();
  expect(screen.getByRole("button", { name: "创建宠物" })).toBeDisabled();
  await user.click(screen.getByRole("checkbox", { name: /第三方处理/ }));
  await upload("正面全身", frontFile);
  await upload("相机位于猫的左前方", catLeftFile);
  await upload("相机位于猫的右前方", catRightFile);
  expect(screen.getByRole("button", { name: "开始生成" })).toBeEnabled();
});

it("keeps a photo-specific reason on every missing slot", () => {
  renderCreatePageAtUploads();
  expect(screen.getByRole("alert", { name: "正面照片问题" }))
    .toHaveTextContent("请上传正面全身照");
});

it("clears a handoff fragment before claiming and stores no token", async () => {
  window.history.replaceState(null, "", `/handoff#${rawHandoffToken}`);
  renderHandoffClaimPage();
  await waitFor(() => expect(window.location.hash).toBe(""));
  expect(capturedRequestOrder()).toEqual(["/browser-sessions/bootstrap", "/ownership-handoffs/claim"]);
  expect(capturedClaimBody()).toEqual({ token: rawHandoffToken });
  expect(localStorageDump()).not.toContain(rawHandoffToken);
  expect(sessionStorageDump()).not.toContain(rawHandoffToken);
  expect(await screen.findByText("项目交接成功")).toBeVisible();
});

it("retries a lost committed claim response with the same in-memory token", async () => {
  server.use(bootstrapOk(), firstClaimCommitsThenDropsConnection(), replayClaimOk());
  window.history.replaceState(null, "", `/handoff#${rawHandoffToken}`);
  renderHandoffClaimPage();
  expect(await screen.findByText("项目交接成功")).toBeVisible();
  expect(capturedClaimBodies()).toEqual([
    { token: rawHandoffToken }, { token: rawHandoffToken },
  ]);
  expect(localStorageDump()).not.toContain(rawHandoffToken);
});

it("removes a recent-project shortcut when this browser is no longer owner", async () => {
  seedRecentProject("project-1");
  server.use(projectGet404("project-1"));
  renderCreatePageFor("project-1");
  expect(await screen.findByText("项目已交接到另一台设备")).toBeVisible();
  expect(readRecentProjects()).not.toContain("project-1");
});

it("recovers a committed handoff after page memory is lost", async () => {
  server.use(listOwnedProjects([projectSummary({ projectId: "project-1" })]));
  clearAllLocalProjectShortcuts();
  renderRoot();
  expect(await screen.findByRole("link", { name: /继续 project-1/ })).toBeVisible();
  expect(readRecentProjects()).toContain("project-1");
});
```

Run:

```bash
pnpm --filter @pindou/web test -- --run CreateProjectPage
```

Expected: FAIL because the create feature does not exist.

- [ ] **Step 2: Implement typed API calls and the four page states**

Add MSW as a pinned Web dev dependency for typed API component tests and update only `pnpm-lock.yaml`. States are `CONSENT`, `UPLOADS`, `GENERATING`, `SHAPE_CONFIRMATION`. The three slot cards show direction silhouettes and the exact camera-relative labels. A missing required slot exposes a slot-specific accessible alert before generation; upload progress and all server issues remain attached to their slot. `开始生成` sends current revision and a cryptographically generated seed; it handles confirmation-required 422 responses without creating a Provider job.

Create the generated-contract-based handoff API and reusable `ProjectHandoffButton`. The server returns only a relative `/handoff#<token>` path once; the owner button synchronously builds `new URL(handoffPath, window.location.origin).href` in memory, marks it “10 分钟内、领取一次后失效”, and exposes copy plus Web Share when available. Neither relative path, absolute URL nor token is persisted or logged. `HandoffClaimPage` contains no third-party script/analytics, reads `window.location.hash` once into a component-local variable, synchronously clears it with `history.replaceState`, calls token-free session bootstrap and waits until its cookie is confirmed, then sends `{token}` in a same-origin claim POST. It retains the token only in memory until a 200 response and automatically retries transport/response-loss failures with capped backoff before the 10-minute deadline; semantic 404/expiry stops. The server's same-session replay rule makes a retry after committed response loss return the same project. It routes from the returned full `ProjectStatus`: `UPLOADED|PROCESSING` to create/progress, `LAYER_REVIEW|BEAD_REVIEW` to editor, and `READY` to room. It does not depend on Phase 3-only `ProjectStep` members and does not persist the token.

React cannot set document response headers. Modify both Vite `server.headers` and `preview.headers` to send `Cache-Control: no-store` and `Referrer-Policy: no-referrer` (global SPA headers are acceptable for this privacy-first MVP), and add `<meta name="referrer" content="no-referrer">` to `index.html`. The deployment contract requires the production gateway to preserve those headers at least for `/handoff`. Add a minimal Phase 2 Playwright config whose Web server builds and runs `pnpm --filter @pindou/web exec vite preview --host 127.0.0.1 --port 4173`; `handoff-security.spec.ts` performs a real GET `/handoff` (the fragment canary is deliberately absent from HTTP), asserts both response headers and the meta tag, then asserts the page clears a `#canary` before bootstrap/claim. Phase 3 later extends this same config with API/storage lifecycle rather than recreating it. Mount the handoff button on the create/progress/shape-confirmation shell; Phase 3/4 reuse it on desktop editing and approved room/export pages. A project 404 removes only that project from the recent-project list and displays the transferred-owner notice.

Name the browser case with the stable marker `@handoff-security`; the test must fail if the canary appears in the HTTP request URL, document referrer, browser storage, console output or captured request body after the claim completes. The command below selects that exact case rather than relying on an untagged file name.

The browser stores only `{projectId,lastVisitedAt}` in `localStorage`; ownership remains in the HttpOnly cookie and `GET /projects` is the recovery authority. Root reconciles local shortcuts against the server list on every load, removes transferred/deleted entries, restores missing owned entries, and never creates a project implicitly merely because localStorage is empty. Fetch uses `credentials:"include"` and maps the shared error envelope.

- [ ] **Step 3: Write the failing polling and shape-feedback test**

```tsx
it("polls every two seconds then offers one full regeneration", async () => {
  vi.useFakeTimers();
  renderShapeFlowWithQueuedJob();
  await vi.advanceTimersByTimeAsync(2000);
  await vi.advanceTimersByTimeAsync(2000);
  expect(await screen.findByAltText("生成的拼豆宠物高清初稿")).toBeVisible();
  await user.click(screen.getByLabelText("花纹不对"));
  await user.click(screen.getByRole("button", { name: "重新生成一次" }));
  expect(lastGenerationBody()).toMatchObject({
    kind: "FULL_REGENERATION",
    feedback: { markingsWrong: true }
  });
});
```

- [ ] **Step 4: Implement progress and initial-shape confirmation**

`GenerationProgress` polls every two seconds, stops on terminal/unmount, and renders safe stage/error text. `ShapeConfirmation` reads the authenticated result endpoint, displays the checkpointed identity trait card beside the transparent high-resolution role, exposes face/body/color/markings feedback, disables full regeneration after the server reports attempt `1`, and calls `accept-shape` when the user selects `接受初稿`. It then shows the persisted confirmed state without creating layer-review state or `/draft` calls; Phase 3 uses that confirmation to start layer generation.

- [ ] **Step 5: Verify web behavior, contracts, and commit**

```bash
pnpm --filter @pindou/web test -- --run
pnpm --filter @pindou/web typecheck
pnpm --filter @pindou/web build
pnpm --filter @pindou/web test:e2e -- --grep @handoff-security
make contracts
pnpm contracts:check
git add apps/web/package.json pnpm-lock.yaml apps/web/src apps/web/vite.config.ts \
  apps/web/index.html apps/web/playwright.config.ts apps/web/e2e packages/contracts
git commit -m "feat: add guided creation and shape confirmation"
```

Expected: web tests pass, handoff token tests prove fragment clearing/no browser persistence, no editor route/component exists, and generated API types have no hand-written duplicate.

---

### Task 9: Verify the complete Phase 2 lifecycle without editor code

**Files:**
- Modify: `README.md`
- Modify: `Makefile`
- Create: `tests/integration/api/test_handoff_write_races.py`

**Interfaces:**
- Produces documented commands for API, worker, web, Redis, migrations and tests
- Provides no test-only production route

- [ ] **Step 1: Document exact local commands**

README commands are:

```bash
redis-cli -u redis://127.0.0.1:6379/15 ping
.venv/bin/python -m alembic upgrade head
.venv/bin/python -m uvicorn --factory pindou_pet.main:create_app --reload
.venv/bin/python -m pindou_pet.worker
pnpm --filter @pindou/web dev
```

Document that API, worker and web are separate processes, Phase 1 freeze is mandatory, and private storage is under `var/`.

Document the Redis prerequisite explicitly: the first command must print `PONG`. If `redis-cli` or the server is absent on this Mac, use `brew install redis` followed by `brew services start redis`; alternatively run the integration target in CI with a real Redis service. A fake Redis implementation is not acceptable evidence for integration tests.

Add one parameterized real-SQLite race suite covering Phase 2 owner mutations: upload replace/delete, initial/full generation create, cancel, accept-shape, explicit project delete and new handoff issuance. Each case pauses the old-owner operation after route authentication but before its `BEGIN IMMEDIATE` owner guard, claims the project from a second connection, then resumes. The old operation must return 404 and leave no post-claim row/file/job/tombstone mutation. A second ordering lets the mutation commit first and then claim succeed; this proves legal linearization rather than relying on timing. Do not add production pause hooks: inject a test barrier into the service/transaction dependency.

- [ ] **Step 2: Add the Phase 2 verification target**

```make
check-phase-2:
	.venv/bin/python -m alembic upgrade head
	.venv/bin/python -m pytest apps/api/tests tests/unit tests/contracts -q -m "not live_provider and not redis"
	RUN_REDIS_TESTS=1 PINDOU_REDIS_URL=redis://127.0.0.1:6379/15 .venv/bin/python -m pytest tests/integration -q
	.venv/bin/python -m ruff check apps/api/src tests tools
	pnpm --filter @pindou/web test -- --run
	pnpm --filter @pindou/web typecheck
	pnpm --filter @pindou/web build
	pnpm --filter @pindou/web test:e2e -- --grep @handoff-security
	pnpm contracts:check
```

- [ ] **Step 3: Run full verification and inspect scope**

```bash
redis-cli -u redis://127.0.0.1:6379/15 ping
make check-phase-2
rg -n "(/draft|bead|quantiz|pivot|animation|export)" apps/api/src apps/web/src
git diff --check
```

Expected: `make check-phase-2` exits `0`; scope scan finds no draft/editor/quantizer/animation/export implementation. Incidental product-name text containing “拼豆” is acceptable, but no matching route, model, service or editor component may exist.

- [ ] **Step 4: Commit the verified run instructions**

```bash
git add README.md Makefile tests/integration/api/test_handoff_write_races.py
git commit -m "docs: add phase two run and verification commands"
```

---

## Phase 2 Completion Check

```bash
.venv/bin/python -m tools.provider_gate.cli verify-freeze \
  --freeze config/provider.freeze.yaml \
  --segmentation-freeze config/segmentation.freeze.yaml \
  --report docs/feasibility/three-cat-provider-gate.md
redis-cli -u redis://127.0.0.1:6379/15 ping
make check-phase-2
git status --short
```

Expected:

- passing Phase 1 Provider freeze remains unchanged;
- consent, anonymous ownership, three camera-relative slots, EXIF removal, random naming and fixed upload TTL are tested;
- duplicate click and restart paths still produce one Provider task per stage key;
- `SUBMIT_UNKNOWN` never auto-resubmits and retains the global lease pending reconciliation;
- Provider PNG and locally derived transparent preview are separate, checksummed artifacts;
- create page reaches initial-shape confirmation and supports at most one complete regeneration;
- owner-only handoff rotates 10-minute single-use tokens, preserves the same running job across two serial claims, and denies the old owner after each claim;
- explicit deletion prevents a late result from restoring an asset;
- no product test-control route, editor, draft asset, quantizer, animation or export code exists;
- `git status --short` is empty after the planned commits.
