# 拼豆虚拟宠物 Phase 5：可靠性、隐私与正式验收 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在既有 Web MVP 主链路上补齐可证明的崩溃恢复、持续队列对账、原子文件落盘、隐私到期删除、Provider 合同、端到端与性能／导出验证，并形成可复现的五猫正式验收证据包。

**Architecture:** 继续使用模块化单体：React Web 通过 HTTP 访问 FastAPI，Redis/RQ 只承载至少一次任务投递，SQLite 是任务、租约、墓碑与删除清单的唯一事实源，图片和资产保存在单机私有文件目录。可靠性由业务幂等键、阶段检查点、Provider 幂等查询和周期性 SQLite↔RQ 对账共同提供；不宣称队列 exactly-once。

**Tech Stack:** React、TypeScript、Vite、Playwright、FastAPI、SQLAlchemy、SQLite WAL、Redis、RQ、pytest、Pillow、ReportLab、pypdf、pnpm、Python virtualenv。

## Global Constraints

- 本计划以前置 Phase 0–4 已实现并通过各自测试为前提；如接口名已有差异，先在当前任务中机械对齐调用点，不扩大模块职责。
- 后端命令一律从仓库根目录使用 `.venv/bin/python`；前端命令一律使用 `pnpm`。
- 首版保持单 FastAPI 应用、单 RQ Worker、单一生成租约、SQLite WAL 和单机私有文件目录。
- 不引入 Celery、Temporal、PostgreSQL、S3、对象存储或微服务。
- RQ 任务参数只允许字符串 ID、整数和短枚举值；Redis 中不得保存图片字节、Base64、永久文件 URL 或完整 Provider 响应。
- 30–120 秒的生成不得运行在 FastAPI `BackgroundTasks` 中；外部任务提交后由延迟 RQ 任务短轮询，不持续占用 Worker。
- 昂贵阶段唯一键固定为 `(project_id, stage, input_hash, revision)`；同一键只能对应一个业务阶段和一个 Provider 任务。
- 同一 Provider 请求必须支持 `idempotency_key` 提交和按该键查询；缺少任一能力的 Provider 不得进入 MVP。
- 网络超时和 Provider 5xx 最多自动重试一次；内容拒绝、无效输入和用户不满意不得自动重试。
- 原图从创建起保留 24 小时；未确认中间物从最后活动起 24 小时且从创建起最长 7 天；批准资产从最后一次真实用户访问起 180 天；导出缓存保留 24 小时。
- 状态轮询、Worker、清理器、健康检查和后台对账不得刷新批准资产的 180 天期限。
- 到期或删除先撤销访问并写墓碑；物理删除尚未完成时读取仍返回 `410 Gone`，晚到 Provider 结果不得复活项目。
- 清理器必须是独立进程／系统定时任务，每小时运行一次；API 接受请求前执行一次追赶清理。
- 验收只读取仓库外的私有猫照片；仓库、测试夹具和证据包均不得复制原图。
- 正式验收为五只猫全部通过；任一单猫失败即整批失败，不允许用平均值掩盖。
- 编辑工作台验收视口不小于 1280×800；互动性能必须在冻结设备、Chromium 版本、DPR、字体、时区和语言后测量。
- Preserve Phase 2's ownership-race invariant during hardening: every user-triggered project mutation and every `USER` asset-access refresh receives `browser_session_id` and rechecks owner inside the same `BEGIN IMMEDIATE` that writes; Worker, janitor and reconciler system mutations use explicit non-user service entry points and never impersonate a browser session.
- 任何任务运行 `make contracts` 都必须同时提交 `packages/contracts/openapi.json` 与 `packages/contracts/src/generated.ts`，提交命令使用 `git add packages/contracts`；下文单列 generated 路径只是简称。

## File Map

### Backend reliability and privacy

- `apps/api/src/pindou_pet/modules/jobs/faults.py`：测试可注入的命名崩溃点。
- `apps/api/src/pindou_pet/modules/jobs/models.py`：阶段状态、唯一约束和 Provider 对账字段。
- `apps/api/src/pindou_pet/modules/jobs/repository.py`：原子创建、认领、状态转换和检查点提交。
- `apps/api/src/pindou_pet/modules/jobs/tasks.py`：提交、轮询、结果持久化和墓碑防线。
- `apps/api/src/pindou_pet/modules/jobs/recovery.py`：SQLite↔RQ 持续对账。
- `apps/api/src/pindou_pet/modules/jobs/lease.py`：唯一生成租约的取得、续租和安全释放。
- `apps/api/src/pindou_pet/infrastructure/storage.py`：临时文件、`fsync`、原子改名和孤儿枚举。
- `apps/api/src/pindou_pet/infrastructure/queue.py`：确定性 RQ job ID、延迟轮询和周期对账调度。
- `apps/api/src/pindou_pet/modules/projects/deletion.py`：墓碑、删除清单和访问撤销。
- `apps/api/src/pindou_pet/modules/projects/retention.py`：可注入时钟和期限计算。
- `apps/api/src/pindou_pet/modules/projects/janitor.py`：追赶清理和逐项删除。
- `apps/api/src/pindou_pet/commands/janitor.py`：独立清理进程入口。
- `apps/api/src/pindou_pet/domain/providers.py`：恢复所需的 Provider 统一合同。
- `apps/api/src/pindou_pet/providers/generation/adapter.py`：正式 Provider 的规范化适配器。

### Web and acceptance verification

- `apps/web/e2e/`：主路径、故障恢复、错误输入、视觉和性能 Playwright 测试。
- `apps/web/src/features/interaction/performance.ts`：首个动作帧与帧时间的纯测量函数。
- `apps/web/src/features/interaction/model/sampleAnimation.ts`：可注入时间的确定性动作采样。
- `apps/api/tests/modules/exports/`：PNG、PDF、58×58 重组和哈希一致性测试。
- `acceptance/five-cat-protocol.yaml`：冻结的正式验收规则。
- `tools/acceptance/`：准备、采集、盲评录入和证据验证脚本。
- `.artifacts/acceptance/<run-id>/`：本地忽略的验收证据，不含原图。

---

### Task 1: 阶段幂等、命名崩溃点与恢复安全状态

**Files:**

- Create: `apps/api/src/pindou_pet/modules/jobs/faults.py`
- Modify: `apps/api/src/pindou_pet/infrastructure/db.py`
- Modify: `apps/api/src/pindou_pet/modules/jobs/models.py`
- Modify: `apps/api/src/pindou_pet/modules/jobs/repository.py`
- Modify: `apps/api/src/pindou_pet/modules/jobs/tasks.py`
- Create: `migrations/versions/0007_provider_result_checkpoint.py`
- Create: `apps/api/tests/integration/jobs/test_crash_idempotency.py`
- Create: `apps/api/tests/unit/jobs/test_stage_job_repository.py`
- Create: `apps/api/tests/integration/jobs/test_stage_checkpoint_migration.py`

**Interfaces:**

- Consumes: `GenerationProvider` from `apps/api/src/pindou_pet/domain/providers.py`; Phase 0 `ObjectStorage.put_atomic()` from `apps/api/src/pindou_pet/infrastructure/storage.py`; existing `StageJob` and project tombstone query.
- Produces: `CrashPoint`, `FaultInjector`, `NoopFaultInjector`, `get_or_create_stage_job()`, `claim_stage()`, `mark_submit_unknown()`, and a crash-idempotent `submit_stage(job_id: str)` / `poll_stage(job_id: str)` flow used by Tasks 2–5.

**Required state fields and invariant:** Reuse the Phase 0/2 `JobStatus` enum; do not introduce a second stage-status vocabulary. Migration `0007_provider_result_checkpoint.py` adds nullable `provider_result_key`, `provider_result_hash` and `provider_result_checkpointed_at` to `StageJob`; an upgrade test proves existing rows backfill to null without changing status. `provider_result_checkpoints` is a repository facade over those new columns. `stage_completion_checkpoints` is a facade over the existing Phase 2 `checkpoint_key/checkpoint_hash` fields, which each stage-specific finalizer writes in the same transaction as its domain side effects. Thus result bytes and terminal completion are independently durable without inventing two undefined tables. A fetched result remains `WAITING_PROVIDER` until the terminal checkpoint commits.

```python
class JobStatus(StrEnum):
    QUEUED = "QUEUED"
    SUBMITTING = "SUBMITTING"
    SUBMIT_UNKNOWN = "SUBMIT_UNKNOWN"
    WAITING_PROVIDER = "WAITING_PROVIDER"
    SUCCEEDED = "SUCCEEDED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"

__table_args__ = (
    UniqueConstraint(
        "project_id",
        "stage",
        "input_hash",
        "project_revision",
        name="uq_stage_job_business_key",
    ),
)
```

- [ ] **Step 1: Write unit tests that define the unique business key and legal state transitions**

Add tests that create the same key twice, create a new key after changing `revision`, and reject `SUCCEEDED -> SUBMITTING`:

```python
def test_get_or_create_reuses_business_key(session, stage_job_repository):
    first = stage_job_repository.get_or_create_stage_job(
        run_id="run-1",
        project_id="project-1",
        stage="IDENTITY_GENERATION",
        input_hash="sha256:a",
        project_revision=3,
        idempotency_key="opaque-key-1",
    )
    second = stage_job_repository.get_or_create_stage_job(
        run_id="run-1",
        project_id="project-1",
        stage="IDENTITY_GENERATION",
        input_hash="sha256:a",
        project_revision=3,
        idempotency_key="opaque-key-1",
    )
    session.commit()
    assert second.id == first.id
    assert session.scalar(select(func.count(StageJob.id))) == 1

def test_revision_creates_a_distinct_stage_job(stage_job_repository):
    first = stage_job_repository.get_or_create_stage_job(
        "run-1", "project-1", "IDENTITY_GENERATION", "sha256:a", 3, "opaque-key-1"
    )
    second = stage_job_repository.get_or_create_stage_job(
        "run-2", "project-1", "IDENTITY_GENERATION", "sha256:a", 4, "opaque-key-2"
    )
    assert second.id != first.id

def test_succeeded_stage_cannot_be_resubmitted(stage_job_repository, succeeded_job):
    with pytest.raises(InvalidStageTransition):
        stage_job_repository.transition(
            succeeded_job.id,
            expected=JobStatus.SUCCEEDED,
            target=JobStatus.SUBMITTING,
        )

def test_run_and_first_stage_rollback_together_on_insert_crash(run_stage_factory):
    with pytest.raises(InjectedDatabaseCrash):
        run_stage_factory.create_initial(crash_after_run_insert=True)
    assert run_stage_factory.run_count == 0
    assert run_stage_factory.stage_count == 0
```

- [ ] **Step 2: Run the repository tests and confirm RED**

Run:

```bash
.venv/bin/python -m pytest apps/api/tests/unit/jobs/test_stage_job_repository.py -q
```

Expected: FAIL only because guarded transition/get-or-create race behavior is not yet proven; the test must first confirm the existing Phase 2 composite constraint is present rather than assuming it is absent.

- [ ] **Step 3: Verify the existing Phase 2 unique key, then add guarded transitions**

Migration `0004_generation_jobs.py` already owns `UniqueConstraint(project_id, stage, input_hash, project_revision)`; this task must inspect and test that exact existing constraint, not recreate or rename it. Use a short `BEGIN IMMEDIATE` transaction for the SQLite read/insert race; do not use `SELECT FOR UPDATE`. If Phase 0 has not already supplied the helper, add this exact transaction boundary to `infrastructure/db.py`:

```python
@contextmanager
def begin_immediate(session: Session) -> Iterator[None]:
    if session.in_transaction():
        raise RuntimeError("BEGIN IMMEDIATE requires a fresh session")
    session.execute(text("BEGIN IMMEDIATE"))
    try:
        yield
    except BaseException:
        session.rollback()
        raise
    else:
        session.commit()
```

Use it in the repository:

```python
def get_or_create_stage_job(
    self,
    run_id: str,
    project_id: str,
    stage: str,
    input_hash: str,
    project_revision: int,
    idempotency_key: str,
) -> StageJob:
    if not self.db.in_transaction():
        raise RuntimeError("caller must own the run/stage transaction")
    existing = self.find_by_business_key(
        project_id, stage, input_hash, project_revision
    )
    if existing is not None:
        return existing
    job = self.phase2_stage_factory.build_persisted_row(
        run_id=run_id,
        project_id=project_id,
        stage=stage,
        input_hash=input_hash,
        project_revision=project_revision,
        idempotency_key=idempotency_key,
    )
    self.db.add(job)
    self.db.flush()
    return job

def transition(
    self,
    job_id: str,
    expected: JobStatus,
    target: JobStatus,
    **changes: object,
) -> StageJob:
    updated = self.db.execute(
        update(StageJob)
        .where(StageJob.id == job_id, StageJob.status == expected)
        .values(status=target, **changes)
        .returning(StageJob)
    ).scalar_one_or_none()
    if updated is None:
        raise InvalidStageTransition(job_id, expected, target)
    return updated
```

The Phase 2 initial path calls one `get_or_create_run_and_first_stage()` inside a single `BEGIN IMMEDIATE`; it does not commit a run and then invoke a fresh stage transaction. This helper is transaction-neutral and is used for a later stage of an already existing run or from that combined initial transaction. If an existing stage is returned, the API response always uses `existing.run_id`; a losing proposed run UUID was never inserted and cannot become an orphan.

- [ ] **Step 4: Add named crash points and a test injector**

Create the exact seam below; production always receives `NoopFaultInjector()`:

```python
class CrashPoint(StrEnum):
    BEFORE_PROVIDER_SUBMIT = "before_provider_submit"
    AFTER_PROVIDER_ACCEPT = "after_provider_accept"
    BEFORE_PROVIDER_ID_SAVE = "before_provider_id_save"
    AFTER_PROVIDER_ID_SAVE = "after_provider_id_save"
    AFTER_RESULT_FETCH = "after_result_fetch"
    AFTER_BLOB_RENAME = "after_blob_rename"
    BEFORE_CHECKPOINT_COMMIT = "before_checkpoint_commit"
    AFTER_CHECKPOINT_COMMIT = "after_checkpoint_commit"
    BEFORE_STAGE_FINALIZER_COMMIT = "before_stage_finalizer_commit"
    AFTER_STAGE_FINALIZER_COMMIT = "after_stage_finalizer_commit"

class FaultInjector(Protocol):
    def hit(self, point: CrashPoint, stage_job_id: str) -> None: ...

class NoopFaultInjector:
    def hit(self, point: CrashPoint, stage_job_id: str) -> None:
        return None

class CrashOnceFaultInjector:
    def __init__(self, target: CrashPoint) -> None:
        self.target = target
        self.triggered = False

    def hit(self, point: CrashPoint, stage_job_id: str) -> None:
        if point == self.target and not self.triggered:
            self.triggered = True
            raise InjectedWorkerCrash(f"{stage_job_id}:{point}")
```

- [ ] **Step 5: Write the parameterized crash-idempotency integration test**

The fake Provider must persist `idempotency_key -> provider_job_id` independently from the app database. Restart the task with a fresh repository and adapter instance after each injected crash:

```python
@pytest.mark.parametrize("crash_point", list(CrashPoint))
def test_restart_never_creates_a_second_provider_job(
    crash_point,
    app_factory,
    durable_fake_provider,
    stage_job_id,
):
    crashed = app_factory(
        provider=durable_fake_provider,
        faults=CrashOnceFaultInjector(crash_point),
    )
    with pytest.raises(InjectedWorkerCrash):
        crashed.jobs.run_until_terminal(stage_job_id)

    restarted = app_factory(provider=durable_fake_provider)
    restarted.jobs.reconcile_and_run(stage_job_id)

    row = restarted.stage_jobs.get(stage_job_id)
    assert row.status == JobStatus.SUCCEEDED
    assert durable_fake_provider.accepted_count(row.idempotency_key) == 1
    assert restarted.provider_result_checkpoints.count_for(stage_job_id) == 1
    assert restarted.stage_completion_checkpoints.count_for(stage_job_id) == 1
```

- [ ] **Step 6: Run the crash tests and confirm RED**

Run:

```bash
.venv/bin/python -m pytest apps/api/tests/integration/jobs/test_crash_idempotency.py -q
```

Expected: FAIL at the first crash boundary because task restart currently repeats submission or loses the checkpoint.

- [ ] **Step 7: Implement the crash-safe submit/result ordering**

Implement these non-negotiable orderings in `tasks.py`. Preserve the Phase 2/3 stage dispatcher: `IDENTITY_EXTRACTION` and `LAYER_GENERATION` stay local and must never call a generation Provider; only Provider-backed stages enter the helper below. Add a regression test that runs both local stage kinds and asserts zero lookup/submit calls.

`requests.reconstruct_for_stage(job.id)` reads the persisted `GenerationRun`, immutable input hashes and prerequisite checkpoints introduced in Phase 2/3; do not add a new `request_manifest_key` column in Phase 5.

```python
def submit_stage(job_id: str) -> None:
    job = repos.stage_jobs.require(job_id)
    projects.require_not_tombstoned(job.project_id)
    if job.status.is_terminal:
        leases.release_if_owner(job.id)
        return
    if not leases.acquire_or_renew(job.id, clock.now()):
        # The deterministic submit RQ job is still in StartedRegistry. Do not
        # enqueue that same ID from inside itself, and do not mint random IDs.
        # Return; SQLite reconciliation rebuilds one submit job after exit.
        return
    if job.stage in LOCAL_STAGE_TYPES:
        # The local finalizer releases only after its terminal checkpoint.
        run_local_stage_and_finalize(job.id, lease_already_held=True)
        return
    submit_provider_stage(job.id, lease_already_held=True)

def submit_provider_stage(job_id: str, *, lease_already_held: bool = False) -> None:
    job = repos.stage_jobs.require(job_id)
    if not lease_already_held:
        raise RuntimeError("provider stage must enter through submit_stage lease dispatcher")
    projects.require_not_tombstoned(job.project_id)
    if job.status == JobStatus.SUCCEEDED:
        return
    if job.status == JobStatus.SUBMIT_UNKNOWN:
        recovery.reconcile_submit_unknown(job.id)
        return
    if job.provider_job_id:
        queue.schedule_provider_poll(job.id, poll_number=job.poll_count)
        return

    if job.status == JobStatus.QUEUED:
        repos.stage_jobs.mark_submitting(job.id)
    elif job.status != JobStatus.SUBMITTING:
        raise InvalidStageTransition(job.id, job.status, JobStatus.SUBMITTING)
    faults.hit(CrashPoint.BEFORE_PROVIDER_SUBMIT, job.id)
    try:
        provider_job_id = provider.lookup_by_idempotency_key(job.idempotency_key)
    except ProviderLookupAmbiguous:
        repos.stage_jobs.mark_submit_unknown(job.id)
        return
    if provider_job_id is None:
        # Lookup may take long enough for a concurrent delete to win. This guard
        # is deliberately adjacent to the externally billable call.
        projects.require_not_tombstoned(job.project_id)
        provider_job_id = provider.submit(
            requests.reconstruct_for_stage(job.id),
            idempotency_key=job.idempotency_key,
        )
    faults.hit(CrashPoint.AFTER_PROVIDER_ACCEPT, job.id)
    faults.hit(CrashPoint.BEFORE_PROVIDER_ID_SAVE, job.id)
    repos.stage_jobs.save_provider_job_id(job.id, provider_job_id)
    faults.hit(CrashPoint.AFTER_PROVIDER_ID_SAVE, job.id)
    queue.schedule_provider_poll(job.id, poll_number=0)

def persist_provider_result_blob(job_id: str, result: NormalizedImageResult) -> None:
    job = repos.stage_jobs.require(job_id)
    faults.hit(CrashPoint.AFTER_RESULT_FETCH, job.id)
    projects.require_not_tombstoned_for_write(job.project_id)
    stored = storage.put_atomic(
        namespace=f"projects/{job.project_id}/jobs/{job.id}/results",
        data=result.png_bytes,
    )
    faults.hit(CrashPoint.AFTER_BLOB_RENAME, job_id)
    projects.require_not_tombstoned_for_write(job.project_id)
    faults.hit(CrashPoint.BEFORE_CHECKPOINT_COMMIT, job_id)
    repos.provider_result_checkpoints.commit_once(job_id, stored.key, stored.sha256)
    faults.hit(CrashPoint.AFTER_CHECKPOINT_COMMIT, job_id)

def finalize_provider_stage(job_id: str) -> None:
    job = repos.stage_jobs.require(job_id)
    result_checkpoint = repos.provider_result_checkpoints.require(job.id)
    if repos.stage_completion_checkpoints.exists(job.id):
        repos.stage_jobs.mark_succeeded_if_needed(job.id)
        return
    projects.require_not_tombstoned_for_write(job.project_id)
    # Each finalizer reuses the already implemented domain transaction:
    # identity -> local alpha, timings and IDENTITY_REVIEW;
    # part edit -> CAS source hashes/revision/wait accounting; later provider
    # stages add their own finalizer here. The terminal checkpoint is committed
    # in that same transaction, after every domain side effect.
    faults.hit(CrashPoint.BEFORE_STAGE_FINALIZER_COMMIT, job.id)
    stage_finalizers.for_stage(job.stage).finalize_and_commit_terminal_checkpoint(
        job, result_checkpoint
    )
    faults.hit(CrashPoint.AFTER_STAGE_FINALIZER_COMMIT, job.id)
    repos.stage_jobs.mark_succeeded_if_needed(job.id)
```

When `lookup_by_idempotency_key()` raises an ambiguity error, call `mark_submit_unknown()` and stop; never call `submit()` in that branch. A stored Provider-result blob is only an input checkpoint, never proof that the business stage completed. Replay must resume the stage-specific finalizer; `SUCCEEDED` is legal only after its terminal checkpoint and all domain side effects commit atomically.

- [ ] **Step 8: Run RED→GREEN verification**

Run:

```bash
.venv/bin/python -m pytest \
  apps/api/tests/unit/jobs/test_stage_job_repository.py \
  apps/api/tests/integration/jobs/test_crash_idempotency.py \
  apps/api/tests/integration/jobs/test_stage_checkpoint_migration.py -q
```

Expected: PASS; every crash point reports exactly one accepted Provider job, one digest-verified Provider-result checkpoint and one stage-terminal checkpoint; both local stage regressions report zero Provider calls.

- [ ] **Step 9: Commit the independently reviewable change**

```bash
git add \
  apps/api/src/pindou_pet/infrastructure/db.py \
  apps/api/src/pindou_pet/modules/jobs/faults.py \
  apps/api/src/pindou_pet/modules/jobs/models.py \
  apps/api/src/pindou_pet/modules/jobs/repository.py \
  apps/api/src/pindou_pet/modules/jobs/tasks.py \
  migrations/versions/0007_provider_result_checkpoint.py \
  apps/api/tests/unit/jobs/test_stage_job_repository.py \
  apps/api/tests/integration/jobs/test_crash_idempotency.py \
  apps/api/tests/integration/jobs/test_stage_checkpoint_migration.py
git commit -m "feat(api): make generation stages crash-idempotent"
```

---

### Task 2: RQ 持续对账、外部任务短轮询与唯一生成租约

**Files:**

- Modify: `apps/api/src/pindou_pet/infrastructure/queue.py`
- Modify: `apps/api/src/pindou_pet/modules/jobs/recovery.py`
- Modify: `apps/api/src/pindou_pet/modules/jobs/lease.py`
- Modify: `apps/api/src/pindou_pet/modules/jobs/tasks.py`
- Modify: `apps/api/src/pindou_pet/worker.py`
- Modify: `apps/api/src/pindou_pet/modules/jobs/routes.py`
- Modify: `apps/api/src/pindou_pet/modules/jobs/schemas.py`
- Create: `apps/api/src/pindou_pet/commands/reconcile_job.py`
- Modify: `packages/contracts/src/generated.ts`
- Create: `apps/web/src/features/jobs/JobReconciliationNotice.tsx`
- Create: `apps/web/src/features/jobs/JobReconciliationNotice.test.tsx`
- Modify: `apps/web/src/features/create/GenerationProgress.tsx`
- Modify: `apps/web/src/features/editor/components/HighResEditor.tsx`
- Create: `apps/api/tests/integration/jobs/test_rq_reconciliation.py`
- Create: `apps/api/tests/integration/jobs/test_generation_lease.py`
- Create: `apps/api/tests/integration/jobs/test_explanation_deadline.py`
- Create: `apps/api/tests/unit/jobs/test_reconcile_job_cli.py`

**Interfaces:**

- Consumes: Phase 0/2 `JobStatus`, Task 1 `submit_stage(job_id)`, `poll_stage(job_id)` and Provider lookup contract.
- Produces: `ReconcileReport`, `reconcile_incomplete_jobs(now)`, a Redis-independent `ReconciliationLoop`, deterministic RQ IDs, the persisted 600-second explanation deadline, a local operator reconciliation command, and lease renewal used by normal operation and Task 4 deletion.

```python
@dataclass(frozen=True)
class ReconcileReport:
    requeued: int = 0
    resumed_provider_jobs: int = 0
    marked_submit_unknown: int = 0
    released_stale_leases: int = 0

def reconcile_incomplete_jobs(now: datetime) -> ReconcileReport: ...
class ReconciliationLoop:
    def tick(self) -> ReconcileReport: ...
    def run(self, stop_event: threading.Event, interval_seconds: float = 30) -> None: ...
def schedule_provider_poll(stage_job_id: str, poll_number: int) -> str: ...
def renew_generation_lease(stage_job_id: str, now: datetime) -> None: ...
```

- [ ] **Step 1: Write integration tests for the four lost-work cases**

Use a real Redis test database and flush only that database in the fixture. Cover database commit before enqueue, Redis job loss, restart with a saved Provider ID, and restart without a saved ID:

```python
@pytest.mark.redis
def test_reconciler_requeues_committed_job_missing_from_redis(ctx, stage_job):
    assert not ctx.queue.job_exists(f"stage:{stage_job.id}:submit")
    report = ctx.recovery.reconcile_incomplete_jobs(ctx.clock.now())
    assert report.requeued == 1
    assert ctx.queue.job_exists(f"stage:{stage_job.id}:submit")

@pytest.mark.redis
def test_saved_provider_id_resumes_poll_without_resubmit(ctx, polling_job):
    ctx.redis.flushdb()
    ctx.recovery.reconcile_incomplete_jobs(ctx.clock.now())
    assert ctx.queue.job_exists(f"stage:{polling_job.id}:poll:0")
    assert ctx.provider.submit_calls == []

@pytest.mark.redis
def test_missing_provider_id_is_recovered_by_idempotency_key(ctx, submitting_job):
    provider_id = ctx.provider.seed_accepted(submitting_job.idempotency_key)
    ctx.recovery.reconcile_incomplete_jobs(ctx.clock.now())
    assert ctx.stage_jobs.require(submitting_job.id).provider_job_id == provider_id
    assert ctx.provider.accepted_count(submitting_job.idempotency_key) == 1

@pytest.mark.redis
def test_ambiguous_submit_enters_submit_unknown(ctx, submitting_job):
    ctx.provider.make_lookup_ambiguous(submitting_job.idempotency_key)
    report = ctx.recovery.reconcile_incomplete_jobs(ctx.clock.now())
    assert report.marked_submit_unknown == 1
    assert ctx.stage_jobs.require(submitting_job.id).status == JobStatus.SUBMIT_UNKNOWN
    assert ctx.provider.submit_calls == []

@pytest.mark.redis
def test_redis_flush_cannot_delete_the_reconciliation_clock(ctx, stage_job):
    ctx.redis.flushdb()
    report = ctx.reconciliation_loop.tick()
    assert report.requeued == 1
    assert ctx.queue.job_exists(f"stage:{stage_job.id}:submit")

@pytest.mark.redis
def test_initial_poll_number_matches_task_contract(ctx, polling_job):
    ctx.tasks.submit_stage(polling_job.id)
    assert ctx.queue.job_exists(f"stage:{polling_job.id}:poll:0")

@pytest.mark.redis
def test_recovery_derives_next_poll_number_from_persisted_count(ctx, polling_job):
    ctx.stage_jobs.set_poll_count(polling_job.id, 4)
    ctx.redis.flushdb()
    ctx.recovery.reconcile_incomplete_jobs(ctx.clock.now())
    assert ctx.queue.job_exists(f"stage:{polling_job.id}:poll:4")
```

- [ ] **Step 2: Run the reconciliation tests and confirm RED**

Run:

```bash
RUN_REDIS_TESTS=1 PINDOU_REDIS_URL=redis://127.0.0.1:6379/15 \
  .venv/bin/python -m pytest \
  apps/api/tests/integration/jobs/test_rq_reconciliation.py \
  -m redis -q
```

Expected: FAIL because missing RQ jobs are not rebuilt from SQLite.

- [ ] **Step 3: Implement deterministic queue operations and continuous reconciliation**

Use these RQ job IDs and keep payloads ID-only. The 30-second reconciliation clock must live in the Worker process rather than Redis; a self-enqueued reconciliation job would disappear in the exact Redis-loss case it is meant to repair:

```python
def submit_rq_id(stage_job_id: str) -> str:
    return f"stage:{stage_job_id}:submit"

def poll_rq_id(stage_job_id: str, poll_number: int) -> str:
    return f"stage:{stage_job_id}:poll:{poll_number}"

def schedule_provider_poll(stage_job_id: str, poll_number: int) -> str:
    stage_jobs.persist_next_poll(stage_job_id, poll_count=poll_number + 1)
    job_id = poll_rq_id(stage_job_id, poll_number)
    queue.enqueue_in(
        timedelta(seconds=min(2 * (poll_number + 1), 10)),
        poll_stage,
        stage_job_id,
        poll_number,
        job_id=job_id,
        result_ttl=0,
    )
    return job_id

class ReconciliationLoop:
    def __init__(self, recovery: RecoveryService, clock: Clock, logger: Logger) -> None:
        self.recovery = recovery
        self.clock = clock
        self.logger = logger

    def tick(self) -> ReconcileReport:
        return self.recovery.reconcile_incomplete_jobs(self.clock.now())

    def run(self, stop_event: threading.Event, interval_seconds: float = 30) -> None:
        while not stop_event.is_set():
            try:
                self.tick()
            except Exception:
                self.logger.exception("reconciliation_tick_failed")
            next_deadline = self.recovery.seconds_until_earliest_explanation_deadline(
                self.clock.now()
            )
            delay = interval_seconds
            if next_deadline is not None:
                delay = min(delay, max(0, next_deadline))
            stop_event.wait(delay)
```

`persist_next_poll` commits `poll_count` and `next_poll_at` before enqueue-after-commit. If enqueue fails or Redis disappears, recovery schedules exactly the persisted next number; consuming a poll never decrements or resets it.

Call `tick()` synchronously before `Worker.work(with_scheduler=True)`, then start one daemon maintenance thread in that same Worker process. Signal and join it during Worker shutdown:

```python
def run_worker() -> None:
    container = build_worker_container()
    loop = container.reconciliation_loop
    loop.tick()
    stop_event = threading.Event()
    maintenance = threading.Thread(
        target=loop.run,
        args=(stop_event, 30),
        name="sqlite-rq-reconciler",
        daemon=True,
    )
    maintenance.start()
    try:
        container.rq_worker.work(with_scheduler=True)
    finally:
        stop_event.set()
        maintenance.join(timeout=5)
```

This is not a second RQ Worker and does not change the single-generation lease. A failed scan is logged and the loop waits at most 30 seconds before trying again; it wakes earlier for the nearest persisted explanation deadline. Redis flushing cannot delete this clock. A submit handler that finds the global lease busy returns without enqueueing from its own deterministic RQ job. Once that invocation leaves `StartedRegistry`, this loop may rebuild at most one missing deterministic submit job per interval. Therefore a long-running first Provider job cannot create an immediate retry loop or unbounded random queue IDs, and the waiting stage starts on the first reconciliation tick after the lease holder reaches a domain-terminal checkpoint.

- [ ] **Step 4: Write lease tests for external polling and stale ownership**

```python
@pytest.mark.redis
def test_provider_poll_renews_same_generation_lease(ctx, polling_job):
    ctx.tasks.poll_stage(polling_job.id, poll_number=2)
    lease = ctx.leases.current()
    assert lease.stage_job_id == polling_job.id
    assert lease.heartbeat_at + timedelta(seconds=45) > ctx.clock.now()

@pytest.mark.redis
def test_reconciler_does_not_release_lease_for_running_provider_job(
    ctx, stale_polling_job
):
    ctx.provider.set_state(stale_polling_job.provider_job_id, "RUNNING")
    report = ctx.recovery.reconcile_incomplete_jobs(ctx.clock.now())
    assert report.released_stale_leases == 0
    assert ctx.leases.current().stage_job_id == stale_polling_job.id

@pytest.mark.redis
def test_provider_terminal_without_domain_checkpoint_keeps_lease(
    ctx, stale_polling_job
):
    ctx.provider.set_state(stale_polling_job.provider_job_id, "FAILED_FINAL")
    report = ctx.recovery.reconcile_incomplete_jobs(ctx.clock.now())
    assert report.released_stale_leases == 0
    assert ctx.leases.current().stage_job_id == stale_polling_job.id
    ctx.tasks.poll_stage(stale_polling_job.id, poll_number=3)
    assert ctx.stage_jobs.require(stale_polling_job.id).status == JobStatus.FAILED
    assert ctx.leases.current() is None

@pytest.mark.redis
def test_second_project_waits_until_first_provider_job_is_terminal(
    ctx, polling_job, pending_second_job
):
    ctx.tasks.submit_stage(pending_second_job.id)
    assert ctx.stage_jobs.require(pending_second_job.id).status == JobStatus.QUEUED
    assert ctx.provider.accepted_count(pending_second_job.idempotency_key) == 0
    assert ctx.queue.pending_submit_count(pending_second_job.id) == 0
    # A long Provider wait permits one low-frequency attempt per reconciliation
    # interval, never self-requeue or random-ID queue growth.
    for _ in range(4):
        ctx.clock.advance(seconds=30)
        ctx.recovery.reconcile_incomplete_jobs(ctx.clock.now())
        ctx.run_queued_submit(pending_second_job.id)
        assert ctx.provider.accepted_count(pending_second_job.idempotency_key) == 0
        assert ctx.queue.max_observed_submit_depth(pending_second_job.id) <= 1
    ctx.provider.set_state(polling_job.provider_job_id, "SUCCEEDED")
    ctx.tasks.poll_stage(polling_job.id, poll_number=3)
    ctx.clock.advance(seconds=30)
    ctx.recovery.reconcile_incomplete_jobs(ctx.clock.now())
    ctx.run_queued_submit(pending_second_job.id)
    assert ctx.provider.accepted_count(pending_second_job.idempotency_key) == 1

@pytest.mark.redis
def test_stale_submit_unknown_without_provider_id_keeps_lease_and_blocks_second(
    ctx, submit_unknown_job, pending_second_job
):
    ctx.provider.make_lookup_ambiguous(submit_unknown_job.idempotency_key)
    ctx.clock.advance(seconds=46)
    report = ctx.recovery.reconcile_incomplete_jobs(ctx.clock.now())
    assert report.released_stale_leases == 0
    assert ctx.leases.current().stage_job_id == submit_unknown_job.id
    ctx.tasks.submit_stage(pending_second_job.id)
    assert ctx.provider.accepted_count(pending_second_job.idempotency_key) == 0

@pytest.mark.redis
def test_stale_submitting_lookup_found_attaches_and_renews(ctx, submitting_job):
    provider_id = ctx.provider.seed_accepted(submitting_job.idempotency_key)
    ctx.clock.advance(seconds=46)
    ctx.recovery.reconcile_incomplete_jobs(ctx.clock.now())
    assert ctx.stage_jobs.require(submitting_job.id).provider_job_id == provider_id
    assert ctx.leases.current().stage_job_id == submitting_job.id
```

- [ ] **Step 5: Run lease tests and confirm RED**

Run:

```bash
RUN_REDIS_TESTS=1 PINDOU_REDIS_URL=redis://127.0.0.1:6379/15 \
  .venv/bin/python -m pytest \
  apps/api/tests/integration/jobs/test_generation_lease.py \
  -m redis -q
```

Expected: FAIL because polling does not renew the durable lease or stale release lacks Provider reconciliation.

- [ ] **Step 6: Implement safe lease renewal and release**

```python
def renew_generation_lease(
    self, stage_job_id: str, now: datetime, ttl: timedelta = timedelta(seconds=45)
) -> None:
    changed = self.db.execute(
        update(GenerationLease)
        .where(
            GenerationLease.singleton_id == 1,
            GenerationLease.stage_job_id == stage_job_id,
        )
        .values(heartbeat_at=now)
    ).rowcount
    if changed != 1:
        raise LeaseOwnershipLost(stage_job_id)

def release_stale_after_provider_check(self, stage_job: StageJob, now: datetime) -> bool:
    if not self.is_expired_for(stage_job.id, now, ttl=timedelta(seconds=45)):
        return False
    if stage_job.status.is_terminal:
        self.release_if_owner(stage_job.id)
        return True
    if stage_job.stage in LOCAL_STAGE_TYPES:
        self.renew_generation_lease(stage_job.id, now)
        return False
    if stage_job.provider_job_id:
        state = self.provider.status(stage_job.provider_job_id)
        # Provider terminal is not domain terminal: result fetch/local alpha/CAS,
        # timing and the terminal checkpoint still require exclusive execution.
        if state.is_terminal:
            self.queue.schedule_provider_poll(
                stage_job.id, poll_number=stage_job.poll_count
            )
        self.renew_generation_lease(stage_job.id, now)
        return False
    if stage_job.status in {JobStatus.SUBMITTING, JobStatus.SUBMIT_UNKNOWN}:
        try:
            recovered_id = self.provider.lookup_by_idempotency_key(
                stage_job.idempotency_key
            )
        except ProviderLookupAmbiguous:
            self.renew_generation_lease(stage_job.id, now)
            return False
        if recovered_id is not None:
            self.stage_jobs.attach_provider_job(stage_job.id, recovered_id)
        else:
            self.stage_jobs.mark_submit_unknown(stage_job.id)
        self.renew_generation_lease(stage_job.id, now)
        return False
    # A provider-backed QUEUED row has not crossed the persisted SUBMITTING
    # boundary and is safe to requeue after releasing its abandoned holder.
    self.release_if_owner(stage_job.id)
    return True
```

- [ ] **Step 7: Run RED→GREEN verification**

Run:

```bash
RUN_REDIS_TESTS=1 PINDOU_REDIS_URL=redis://127.0.0.1:6379/15 \
  .venv/bin/python -m pytest \
  apps/api/tests/integration/jobs/test_rq_reconciliation.py \
  apps/api/tests/integration/jobs/test_generation_lease.py \
  -m redis -q
```

Expected: PASS; clearing Redis and restarting the Worker never loses a durable stage or duplicates a Provider task.

- [ ] **Step 8: Enforce the 600-second explanatory-state deadline**

Write fake-clock tests at both sides of the boundary. `explanation_deadline_at` is the immutable `GenerationRun.accepted_at + 600s` value created in Phase 2; restart/requeue must never move it:

```python
pytestmark = pytest.mark.redis

def test_599_seconds_remains_normal_polling(ctx, running_provider_job):
    ctx.clock.set(running_provider_job.run.accepted_at + timedelta(seconds=599))
    ctx.recovery.reconcile_incomplete_jobs(ctx.clock.now())
    assert running_provider_job.run.reconciliation_required_at is None

def test_600_seconds_exposes_reconciliation_without_resubmit(ctx, running_provider_job):
    ctx.clock.set(running_provider_job.run.accepted_at + timedelta(seconds=600))
    ctx.provider.set_state(running_provider_job.provider_job_id, "RUNNING")
    ctx.recovery.reconcile_incomplete_jobs(ctx.clock.now())
    run = ctx.runs.require(running_provider_job.run.id)
    stage = ctx.stage_jobs.require(running_provider_job.id)
    assert run.reconciliation_required_at == ctx.clock.now()
    assert stage.safe_error_code == "PROVIDER_DEADLINE_EXCEEDED"
    assert ctx.provider.accepted_count(running_provider_job.idempotency_key) == 1
    assert ctx.leases.current().stage_job_id == running_provider_job.id

def test_status_get_at_exact_deadline_cannot_return_unexplained_waiting(
    ctx, running_provider_job
):
    ctx.clock.set(running_provider_job.run.explanation_deadline_at)
    response = ctx.owner_client.get(
        f"/api/v1/projects/{running_provider_job.project_id}/generation-jobs/"
        f"{running_provider_job.run.id}"
    )
    assert response.status_code == 200
    assert response.json()["requiresReconciliation"] is True
    assert "stageJobId" not in response.json()
    assert "providerJobId" not in response.json()
    assert ctx.other_project_client.get(
        f"/api/v1/projects/{ctx.other_project_id}/generation-jobs/"
        f"{running_provider_job.run.id}"
    ).status_code == 404

def test_unknown_submit_at_deadline_is_explanatory_and_never_retried(ctx, submitting_job):
    ctx.clock.set(submitting_job.run.explanation_deadline_at)
    ctx.provider.make_lookup_ambiguous(submitting_job.idempotency_key)
    ctx.recovery.reconcile_incomplete_jobs(ctx.clock.now())
    assert ctx.runs.require(submitting_job.run.id).reconciliation_required_at is not None
    assert ctx.provider.submit_calls == []

def test_terminal_provider_state_at_deadline_finishes_normally(ctx, running_provider_job):
    ctx.clock.set(running_provider_job.run.explanation_deadline_at)
    ctx.provider.set_state(running_provider_job.provider_job_id, "SUCCEEDED")
    ctx.recovery.reconcile_incomplete_jobs(ctx.clock.now())
    assert ctx.stage_completion_checkpoints.exists(running_provider_job.id)

def test_local_stage_at_deadline_becomes_explanatory_without_provider_call(
    ctx, queued_identity_extraction_job
):
    ctx.clock.set(queued_identity_extraction_job.run.explanation_deadline_at)
    ctx.recovery.reconcile_incomplete_jobs(ctx.clock.now())
    run = ctx.runs.require(queued_identity_extraction_job.run.id)
    assert run.reconciliation_required_at == ctx.clock.now()
    assert ctx.provider.lookup_calls == []
    assert ctx.provider.submit_calls == []
    ctx.tasks.run_local_stage_and_finalize(queued_identity_extraction_job.id)
    assert ctx.stage_completion_checkpoints.exists(queued_identity_extraction_job.id)
    assert ctx.runs.require(queued_identity_extraction_job.run.id).result_ready_at is None
    assert ctx.job_service.public_status(
        queued_identity_extraction_job.run.id, ctx.clock.now()
    ).requires_reconciliation is True
```

At or after the boundary, reconciliation performs one Provider lookup/status check. The reconciliation loop wakes at the nearest persisted deadline rather than waiting for its 30-second ceiling. The project-scoped `GET /projects/{projectId}/generation-jobs/{generationJobId}` treats `generationJobId` as the public `GenerationRun.id`, aggregates its current internal stage, and derives `requiresReconciliation=true` immediately from `now >= explanationDeadlineAt && run nonterminal` before any potentially slow Provider lookup; it also idempotently persists the marker. Thus a read at exactly second 600 cannot return an unexplained waiting state even after Redis loss. Internal `StageJob.id` and Provider IDs never enter the response. A terminal result follows the normal stage-specific finalizer. A known-running job or ambiguous/absent submit is atomically marked with `reconciliation_required_at` and a localized safe code; normal two-second polling stops, the user-visible job response returns `requiresReconciliation: true`, `reconciliationRequiredAt` and the safe explanation, and the one global lease remains held so no second paid job can begin. The low-frequency SQLite reconciler may continue status/lookup checks but must never call `submit()` for such a row.

Both the initial/full-generation `GenerationProgress` and the `PART_REGENERATION` state in `HighResEditor` consume one shared `JobReconciliationNotice`. On `requiresReconciliation=true`, they stop browser polling, show “生成耗时较长，已进入安全对账；系统不会自动重复提交”, and offer only “稍后再看” and “删除宠物”—never a retry button. Component tests cover both host pages, safe localized error mapping and polling cancellation.

Implement `.venv/bin/python -m pindou_pet.commands.reconcile_job --job-id <internal-stage-id> --action query|attach|cancel [--provider-job-id <provider-id>]`. This is a local operator CLI only: `query` repeats the native lookup/status operation; `attach` requires `--provider-job-id`, verifies that value equals native lookup, and only then stores it; `query` and `cancel` reject that flag so an operator cannot silently attach the wrong identifier. `cancel` requests cancellation and releases the lease only after terminal/cancelled status is confirmed. Every action is idempotent and writes a sanitized audit record. Parser/service tests cover a missing attach ID, a mismatched lookup, a valid attach, and rejection of the flag for the other two actions. The intended attach invocation is `.venv/bin/python -m pindou_pet.commands.reconcile_job --job-id <internal-stage-id> --action attach --provider-job-id <provider-id>`. There is no browser or test-control reconciliation route. An unstarted local stage is marked explanatory at the same deadline with zero Provider calls and may still complete idempotently. The public boolean belongs to the whole `GenerationRun`: it remains true while that run is nonterminal and has no readable final result, even if `IDENTITY_EXTRACTION` finishes and creates `IDENTITY_GENERATION`; only run-level success/failure/cancellation makes it false, while the timestamp remains historical.

Run:

```bash
RUN_REDIS_TESTS=1 PINDOU_REDIS_URL=redis://127.0.0.1:6379/15 \
  .venv/bin/python -m pytest \
  apps/api/tests/integration/jobs/test_explanation_deadline.py \
  apps/api/tests/integration/jobs/test_rq_reconciliation.py -m redis -q
make contracts
pnpm contracts:check
pnpm --filter @pindou/web test --run \
  src/features/jobs/JobReconciliationNotice.test.tsx
```

Expected: PASS at 599/600-second boundaries; no deadline/recovery case creates a second Provider acceptance or silently releases an unresolved lease.

- [ ] **Step 9: Commit the independently reviewable change**

```bash
git add \
  apps/api/src/pindou_pet/infrastructure/queue.py \
  apps/api/src/pindou_pet/modules/jobs/recovery.py \
  apps/api/src/pindou_pet/modules/jobs/lease.py \
  apps/api/src/pindou_pet/modules/jobs/tasks.py \
  apps/api/src/pindou_pet/worker.py \
  apps/api/src/pindou_pet/modules/jobs/routes.py \
  apps/api/src/pindou_pet/modules/jobs/schemas.py \
  apps/api/src/pindou_pet/commands/reconcile_job.py \
  packages/contracts \
  apps/web/src/features/jobs/JobReconciliationNotice.tsx \
  apps/web/src/features/jobs/JobReconciliationNotice.test.tsx \
  apps/web/src/features/create/GenerationProgress.tsx \
  apps/web/src/features/editor/components/HighResEditor.tsx \
  apps/api/tests/integration/jobs/test_rq_reconciliation.py \
  apps/api/tests/integration/jobs/test_generation_lease.py \
  apps/api/tests/integration/jobs/test_explanation_deadline.py \
  apps/api/tests/unit/jobs/test_reconcile_job_cli.py
git commit -m "feat(api): reconcile durable jobs with RQ state"
```

---

### Task 3: 原子文件落盘、内容校验与孤儿清理边界

**Files:**

- Modify: `apps/api/src/pindou_pet/infrastructure/storage.py`
- Modify: `apps/api/src/pindou_pet/modules/jobs/tasks.py`
- Create: `apps/api/tests/unit/infrastructure/test_atomic_storage.py`
- Create: `apps/api/tests/integration/jobs/test_blob_checkpoint_recovery.py`

**Interfaces:**

- Consumes: Task 1 crash points and checkpoint repository.
- Produces: a hardened atomic `ObjectStorage` contract and orphan enumeration used by Task 4 janitor.

```python
@dataclass(frozen=True)
class StoredObject:
    key: str
    sha256: str
    size_bytes: int

class ObjectStorage(Protocol):
    def put_atomic(self, *, namespace: str, data: bytes) -> StoredObject: ...
    def exists(self, key: str) -> bool: ...
    def open(self, key: str) -> BinaryIO: ...
    def sha256(self, key: str) -> str: ...
    def delete(self, key: str) -> None: ...
    def list_orphans(
        self, referenced_keys: Collection[str], older_than: datetime
    ) -> list[str]: ...
```

- [ ] **Step 1: Write atomicity and path-safety unit tests**

```python
def test_put_atomic_never_exposes_partial_target(tmp_path, monkeypatch):
    storage = LocalObjectStorage(tmp_path)
    monkeypatch.setattr(storage, "_replace", Mock(side_effect=OSError("crash")))
    with pytest.raises(OSError):
        storage.put_atomic(namespace="projects/p1/results", data=b"complete-image")
    digest = hashlib.sha256(b"complete-image").hexdigest()
    assert not storage.exists(f"projects/p1/results/{digest}")

def test_put_atomic_records_digest_and_size(tmp_path):
    storage = LocalObjectStorage(tmp_path)
    stored = storage.put_atomic(namespace="projects/p1/results", data=b"abc")
    assert stored.sha256 == hashlib.sha256(b"abc").hexdigest()
    assert stored.size_bytes == 3
    assert storage.open(stored.key).read() == b"abc"

@pytest.mark.parametrize("namespace", ["../secret", "/absolute", "a/../../secret"])
def test_storage_rejects_namespaces_outside_root(tmp_path, namespace):
    with pytest.raises(InvalidStorageKey):
        LocalObjectStorage(tmp_path).put_atomic(namespace=namespace, data=b"x")
```

- [ ] **Step 2: Run storage tests and confirm RED**

Run:

```bash
.venv/bin/python -m pytest \
  apps/api/tests/unit/infrastructure/test_atomic_storage.py -q
```

Expected: FAIL because storage does not yet guarantee temp-file isolation, digest metadata and traversal rejection.

- [ ] **Step 3: Implement the exact durable write sequence**

```python
def put_atomic(self, *, namespace: str, data: bytes) -> StoredObject:
    digest = hashlib.sha256(data).hexdigest()
    key = f"{namespace.rstrip('/')}/{digest}"
    target = self._resolve_safe(key)
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists():
        if self.sha256(key) != digest:
            raise StorageDigestMismatch(key)
        return StoredObject(key=key, sha256=digest, size_bytes=len(data))
    temp = target.parent / f".{target.name}.{uuid4().hex}.part"
    try:
        with temp.open("xb") as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        self._replace(temp, target)
        directory_fd = os.open(target.parent, os.O_RDONLY)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
    except BaseException:
        temp.unlink(missing_ok=True)
        raise
    return StoredObject(key=key, sha256=digest, size_bytes=len(data))
```

`_resolve_safe()` must compare `candidate.resolve().is_relative_to(self.root.resolve())` before any write.

- [ ] **Step 4: Write checkpoint recovery tests for both sides of the database commit**

```python
def test_blob_without_checkpoint_is_reused_after_restart(ctx, result_job):
    ctx.faults.target = CrashPoint.BEFORE_CHECKPOINT_COMMIT
    with pytest.raises(InjectedWorkerCrash):
        ctx.tasks.persist_provider_result_blob(result_job.id, result_job.result)
    assert ctx.storage.exists(result_job.expected_result_key)
    assert ctx.provider_result_checkpoints.count_for(result_job.id) == 0

    restarted = ctx.restart()
    restarted.tasks.persist_provider_result_blob(result_job.id, result_job.result)
    restarted.tasks.finalize_provider_stage(result_job.id)
    assert restarted.provider_result_checkpoints.count_for(result_job.id) == 1
    assert restarted.stage_completion_checkpoints.count_for(result_job.id) == 1
    assert ctx.storage.count(result_job.expected_result_key) == 1

def test_checkpoint_commit_makes_replay_a_noop(ctx, result_job):
    ctx.faults.target = CrashPoint.AFTER_CHECKPOINT_COMMIT
    with pytest.raises(InjectedWorkerCrash):
        ctx.tasks.persist_provider_result_blob(result_job.id, result_job.result)
    restarted = ctx.restart()
    restarted.tasks.persist_provider_result_blob(result_job.id, result_job.result)
    restarted.tasks.finalize_provider_stage(result_job.id)
    assert restarted.provider_result_checkpoints.count_for(result_job.id) == 1
    assert restarted.stage_completion_checkpoints.count_for(result_job.id) == 1
    assert restarted.stage_jobs.require(result_job.id).status == JobStatus.SUCCEEDED
```

- [ ] **Step 5: Run checkpoint tests and confirm RED**

Run:

```bash
.venv/bin/python -m pytest \
  apps/api/tests/integration/jobs/test_blob_checkpoint_recovery.py -q
```

Expected: FAIL because replay either duplicates a reference or treats an unreferenced final file as complete without digest verification.

- [ ] **Step 6: Implement digest-verified replay and orphan enumeration**

Incrementally harden Task 1's function; do not replace its fault hooks or tombstone guards. Before reusing an existing final key, compute and compare its SHA-256 to both the normalized Provider result and recorded checkpoint. A mismatched recorded hash fails safely; a missing/corrupt blob with a valid content-addressed checkpoint is recorded for cleanup and rewritten atomically from the already normalized result. `list_orphans()` returns `.part` files and final objects absent from database references only when `mtime < older_than`. This helper owns only the Provider-result blob checkpoint; it must then call Task 1's stage-specific finalizer and may never mark the stage successful merely because the blob exists.

```python
def persist_provider_result_blob(job_id: str, result: NormalizedImageResult) -> None:
    job = stage_jobs.require(job_id)
    faults.hit(CrashPoint.AFTER_RESULT_FETCH, job.id)
    expected_sha = hashlib.sha256(result.png_bytes).hexdigest()
    namespace = f"projects/{job.project_id}/jobs/{job.id}/results"
    expected_key = f"{namespace}/{expected_sha}"
    recorded = provider_result_checkpoints.find(job.id)
    if recorded is not None and recorded.sha256 != expected_sha:
        raise CheckpointDigestMismatch(job.id)
    if (
        recorded is not None
        and storage.exists(recorded.key)
        and storage.sha256(recorded.key) == recorded.sha256
    ):
        return
    projects.require_not_tombstoned_for_write(job.project_id)
    if storage.exists(expected_key) and storage.sha256(expected_key) != expected_sha:
        deletion_items.record_file(expected_key, "digest_mismatch")
        storage.delete(expected_key)
    stored = storage.put_atomic(namespace=namespace, data=result.png_bytes)
    faults.hit(CrashPoint.AFTER_BLOB_RENAME, job.id)
    projects.require_not_tombstoned_for_write(job.project_id)
    if recorded is not None:
        if (stored.key, stored.sha256) != (recorded.key, recorded.sha256):
            raise CheckpointDigestMismatch(job.id)
        return
    faults.hit(CrashPoint.BEFORE_CHECKPOINT_COMMIT, job.id)
    provider_result_checkpoints.commit_once(job.id, stored.key, stored.sha256)
    faults.hit(CrashPoint.AFTER_CHECKPOINT_COMMIT, job.id)

def persist_and_finalize_provider_result(
    job_id: str, result: NormalizedImageResult
) -> None:
    persist_provider_result_blob(job_id, result)
    finalize_provider_stage(job_id)
```

- [ ] **Step 7: Run RED→GREEN verification**

Run:

```bash
.venv/bin/python -m pytest \
  apps/api/tests/unit/infrastructure/test_atomic_storage.py \
  apps/api/tests/integration/jobs/test_blob_checkpoint_recovery.py -q
```

Expected: PASS; interruption never exposes partial bytes, and replay produces one digest-verified file, one Provider-result checkpoint and one domain-terminal checkpoint. Identity generation still derives local alpha/timing and advances to `IDENTITY_REVIEW`; part regeneration still CAS-updates source hashes/revision/wait accounting before `SUCCEEDED`.

- [ ] **Step 8: Commit the independently reviewable change**

```bash
git add \
  apps/api/src/pindou_pet/infrastructure/storage.py \
  apps/api/src/pindou_pet/modules/jobs/tasks.py \
  apps/api/tests/unit/infrastructure/test_atomic_storage.py \
  apps/api/tests/integration/jobs/test_blob_checkpoint_recovery.py
git commit -m "feat(api): make asset storage atomic and recoverable"
```

---

### Task 4: TTL、墓碑、删除清单与独立 Janitor

**Files:**

- Modify: `apps/api/src/pindou_pet/modules/projects/models.py`
- Modify: `apps/api/src/pindou_pet/modules/projects/repository.py`
- Modify: `apps/api/src/pindou_pet/modules/projects/deletion.py`
- Create: `apps/api/src/pindou_pet/modules/projects/retention.py`
- Create: `apps/api/src/pindou_pet/modules/projects/janitor.py`
- Create: `apps/api/src/pindou_pet/commands/janitor.py`
- Create: `apps/api/src/pindou_pet/modules/projects/janitor_scheduler.py`
- Modify: `apps/api/src/pindou_pet/api/dependencies.py`
- Modify: `apps/api/src/pindou_pet/modules/projects/routes.py`
- Modify: `apps/api/src/pindou_pet/modules/projects/schemas.py`
- Modify: `apps/api/src/pindou_pet/modules/jobs/routes.py`
- Modify: `apps/api/src/pindou_pet/modules/assets/service.py`
- Modify: `apps/api/src/pindou_pet/modules/assets/routes.py`
- Modify: `apps/api/src/pindou_pet/modules/exports/routes.py`
- Modify: `packages/contracts/src/generated.ts`
- Create: `apps/web/src/features/project/AssetRetentionStatus.tsx`
- Create: `apps/web/src/features/project/AssetRetentionStatus.test.tsx`
- Modify: `apps/web/src/features/interaction/components/InteractionPage.tsx`
- Modify: `apps/web/src/features/export/components/ExportPage.tsx`
- Modify: `apps/api/src/pindou_pet/main.py`
- Modify: `apps/api/src/pindou_pet/modules/jobs/tasks.py`
- Create: `migrations/versions/0008_retention_fields.py`
- Create: `apps/api/tests/unit/projects/test_retention_policy.py`
- Create: `apps/api/tests/integration/projects/test_tombstone_deletion.py`
- Create: `apps/api/tests/integration/projects/test_late_provider_result.py`
- Create: `apps/api/tests/integration/projects/test_janitor_cli.py`
- Create: `apps/api/tests/unit/projects/test_janitor_scheduler.py`

**Interfaces:**

- Consumes: `ObjectStorage.list_orphans()` from Task 3, Provider `cancel()`, durable `deletion_items`, and Task 2 lease/reconciliation.
- Produces: `Clock`, `RetentionPolicy`, explicit `AccessKind`, item-level raw/export expiry, `tombstone_project()`, `assert_project_accessible()`, `run_janitor_once()`, an anchored monotonic scheduler, and a standalone process command.

```python
class Clock(Protocol):
    def now(self) -> datetime: ...

@dataclass(frozen=True)
class RetentionPolicy:
    raw_upload_ttl: timedelta = timedelta(hours=24)
    draft_media_staging_ttl: timedelta = timedelta(hours=1)
    intermediate_idle_ttl: timedelta = timedelta(hours=24)
    intermediate_max_ttl: timedelta = timedelta(days=7)
    approved_idle_ttl: timedelta = timedelta(days=180)
    export_ttl: timedelta = timedelta(hours=24)

@dataclass(frozen=True)
class JanitorReport:
    tombstoned_projects: int
    deleted_items: int
    failed_items: int
    purged_projects: int
```

Migration `0008_retention_fields.py` follows Task 1's `0007_provider_result_checkpoint.py` and adds the missing `last_user_access_at`, `asset_expires_at`, access-revocation, deletion-attempt, Provider-receipt and orphan-cleanup fields/indexes to the Phase 2/4 tables; it extends rather than recreates the Phase 2 `deletion_items` table and must not recreate or rename earlier tables.

Retention ownership is frozen by resource type: a raw upload expiring at 24 hours deletes only that upload file/row; unconsumed draft-media staging expires at one hour and consumed staging follows its draft/run reference rule; an export expiring at 24 hours deletes only that export's files/row; an unapproved project reaching the earlier of idle 24 hours or age 7 days is tombstoned as a whole; an approved project reaching `last_user_access_at + 180 days` is tombstoned as a whole. Raw/staging/export expiry must never delete or tombstone an otherwise live approved asset.

- [ ] **Step 1: Write fake-clock tests for every TTL and activity boundary**

```python
def test_raw_upload_expires_exactly_24_hours_after_creation(policy, t0):
    assert policy.raw_upload_expires_at(t0) == t0 + timedelta(hours=24)

def test_unconsumed_draft_media_expires_exactly_one_hour_after_creation(policy, t0):
    assert policy.draft_media_staging_expires_at(t0) == t0 + timedelta(hours=1)

def test_intermediate_expiry_uses_earlier_idle_or_hard_cap(policy, t0):
    created = t0
    last_activity = t0 + timedelta(days=6, hours=12)
    assert policy.intermediate_expires_at(created, last_activity) == t0 + timedelta(days=7)

def test_background_poll_does_not_extend_approved_asset_ttl(project_service, clock):
    original = project_service.get("p1").asset_expires_at
    clock.advance(days=30)
    project_service.record_background_poll("p1")
    assert project_service.get("p1").asset_expires_at == original

def test_real_user_access_extends_approved_asset_ttl(
    project_service, owner_session, clock
):
    clock.advance(days=30)
    project_service.record_user_access("p1", owner_session.id)
    assert project_service.get("p1").asset_expires_at == clock.now() + timedelta(days=180)

def test_handoff_and_user_access_refresh_are_linearized(
    project_service, owner_session, receiver_session, ready_project, race
):
    access_status, claim_status = race(
        lambda: project_service.record_user_access(ready_project.id, owner_session.id),
        lambda: claim_to(receiver_session, ready_project.id),
    )
    assert claim_status == 200
    assert access_status in {200, 404}
    assert no_old_owner_refresh_committed_after_claim(ready_project.id)

def test_handoff_respects_effective_expiry_boundary(
    ctx, ready_project, owner, receiver
):
    token = ctx.handoffs.issue(ready_project.id, owner.id)
    ctx.clock.set(ready_project.asset_expires_at - timedelta(milliseconds=1))
    assert ctx.handoffs.claim(token, receiver.id).project_id == ready_project.id
    assert ctx.projects.require(ready_project.id).asset_expires_at == (
        ctx.clock.now() + timedelta(days=180)
    )

    token2 = ctx.handoffs.issue(ready_project.id, receiver.id)
    ctx.clock.set(ctx.projects.require(ready_project.id).asset_expires_at)
    with pytest.raises(HandoffNotFound):
        ctx.handoffs.claim(token2, owner.id)
    assert ctx.projects.require_including_tombstone(ready_project.id).tombstoned_at is not None

def test_claim_and_janitor_cannot_revive_expired_project(
    ctx, expiring_project, receiver, race
):
    token = ctx.handoffs.issue(expiring_project.id, expiring_project.owner_session_id)
    ctx.clock.set(expiring_project.effective_expires_at)
    claim_status, _ = race(
        lambda: claim_handoff(receiver, token),
        lambda: ctx.janitor.run_janitor_once(ctx.clock.now()),
    )
    assert claim_status == 404
    assert ctx.projects.require_including_tombstone(expiring_project.id).tombstoned_at

def test_raw_upload_expiry_does_not_expire_approved_asset(ctx, ready_project):
    ctx.clock.set(ready_project.uploads[0].created_at + timedelta(hours=24))
    ctx.janitor.run_janitor_once(ctx.clock.now())
    assert ctx.uploads.count_for_project(ready_project.id) == 0
    assert ctx.projects.require(ready_project.id).tombstoned_at is None
    assert ctx.assets.count_for_project(ready_project.id) == 1

def test_export_expiry_does_not_tombstone_project(ctx, ready_project, export):
    ctx.clock.set(export.created_at + timedelta(hours=24))
    ctx.janitor.run_janitor_once(ctx.clock.now())
    assert ctx.exports.find(export.id) is None
    assert ctx.projects.require(ready_project.id).tombstoned_at is None
```

- [ ] **Step 2: Run retention tests and confirm RED**

Run:

```bash
.venv/bin/python -m pytest \
  apps/api/tests/unit/projects/test_retention_policy.py -q
```

Expected: FAIL because TTL calculations are not centralized and background reads currently cannot be distinguished from real user access.

- [ ] **Step 3: Implement explicit retention calculations and access kinds**

```python
class AccessKind(StrEnum):
    USER = "USER"
    STATUS_POLL = "STATUS_POLL"
    WORKER = "WORKER"
    JANITOR = "JANITOR"

def record_access(
    self,
    project_id: str,
    browser_session_id: str | None,
    kind: AccessKind,
    now: datetime,
) -> None:
    if kind in {AccessKind.WORKER, AccessKind.JANITOR}:
        raise ValueError("system access uses explicit non-browser entry points")
    if browser_session_id is None:
        raise ValueError("browser access requires browser_session_id")
    with begin_immediate(self.db):
        require_project_owner_in_transaction(
            self.db, project_id, browser_session_id
        )
        if kind is AccessKind.USER:
            self.db.execute(
                update(Project)
                .where(Project.id == project_id, Project.tombstoned_at.is_(None))
                .values(last_user_access_at=now, asset_expires_at=now + timedelta(days=180))
            )
```

The dependency must require an explicit access kind rather than defaulting to `USER`. Project-page GET, immutable approved-asset GET and user-initiated export manifest/file GET use `USER`: their routes authenticate only the `BrowserSession`, pass its ID to the service, and the service performs owner check plus TTL refresh in the same `BEGIN IMMEDIATE` before returning/streaming. Generation status polling uses `STATUS_POLL`: `get_generation_status(project_id, public_run_id, browser_session_id, now)` opens one short `BEGIN IMMEDIATE`, requires current ownership and run membership, derives/persists any exact-600-second `reconciliation_required_at` marker, and returns the representation without refreshing either session/project asset TTL. This prevents a stale owner from reading or writing the marker after handoff. Worker/reconciliation and janitor paths use explicit system repository methods and never call browser dependencies. The approval transaction initializes `last_user_access_at=approved_at` and `asset_expires_at=approved_at+180d`.

Extend the Phase 2 `require_not_effectively_expired` seam used by handoff issue/claim. Inside their existing `BEGIN IMMEDIATE`, compute the same effective deadline as read/Janitor paths before changing owner or activity. At `now >= effectiveExpiresAt`, atomically tombstone, revoke all tokens/create deletion inventory and fail issue as 410 or bearer claim as 404; never refresh activity. Only `now < deadline` may claim: READY refreshes `last_user_access_at/asset_expires_at`, while an unapproved project refreshes idle `last_activity_at` but never changes `created_at + 7d` hard cap. Add expiry-minus-1ms, exact-expiry, claim-vs-Janitor and issue-vs-expiry tests. Also add route tests proving old owner/stranger/foreign-run status requests return 404, the new owner gets 200, repeated legitimate status polling/health/worker reads leave expiry unchanged, and an authenticated room/export page load extends it once using the injected server clock; handoff-vs-USER/status-marker races may linearize before claim or return 404, never mutate from the old owner after claim.

Populate the distinct nullable `intermediateExpiresAt` and `assetExpiresAt` fields already frozen in Phase 2; upload slots retain their own raw-photo `expiresAt`, while export manifests retain export `expiresAt`. No ambiguous project-level `expiresAt` is introduced. `AssetRetentionStatus` renders `角色保留至 <localized assetExpiresAt>` in room and export whenever an approved asset exists, updates from the server response after genuine user access, and never displays raw-upload/export expiry as the asset deadline. Add component/API tests for the four distinct fields.

- [ ] **Step 4: Write deletion transaction, late-result and read-denial tests**

```python
def test_delete_transaction_revokes_access_and_creates_ledger(ctx, ready_project):
    ctx.deletion.tombstone_project(ready_project.id, DeletionReason.USER_REQUEST)
    project = ctx.projects.require_including_tombstone(ready_project.id)
    assert project.tombstoned_at == ctx.clock.now()
    assert project.access_revoked_at == ctx.clock.now()
    assert set(ctx.deletion_items.kinds_for(ready_project.id)) >= {
        "RAW_UPLOAD", "INTERMEDIATE", "ASSET", "EXPORT"
    }
    assert ctx.ownership_handoffs.active_count(ready_project.id) == 0
    response = ctx.client.get(f"/api/v1/projects/{ready_project.id}")
    assert response.status_code == 410

def test_late_provider_result_cannot_recreate_deleted_asset(ctx, polling_project):
    ctx.deletion.tombstone_project(polling_project.id, DeletionReason.USER_REQUEST)
    ctx.provider.complete(polling_project.provider_job_id)
    ctx.tasks.poll_stage(polling_project.stage_job_id, poll_number=5)
    assert ctx.assets.count_for_project(polling_project.id) == 0
    assert ctx.storage.keys_for_project(polling_project.id) == []

def test_failed_physical_delete_never_restores_access(ctx, ready_project):
    ctx.storage.fail_delete_for(ready_project.asset_key)
    ctx.deletion.tombstone_project(ready_project.id, DeletionReason.EXPIRED)
    report = ctx.janitor.run_janitor_once(ctx.clock.now())
    assert report.failed_items == 1
    assert ctx.client.get(f"/api/v1/projects/{ready_project.id}").status_code == 410
    assert ctx.projects.exists_including_tombstone(ready_project.id)

def test_project_row_is_purged_only_after_every_ledger_item_is_confirmed(
    ctx, handed_off_exported_ready_project
):
    ready_project = handed_off_exported_ready_project
    ctx.deletion.tombstone_project(ready_project.id, DeletionReason.USER_REQUEST)
    report = ctx.janitor.run_janitor_once(ctx.clock.now())
    assert report.failed_items == 0
    assert report.purged_projects == 1
    assert not ctx.projects.exists_including_tombstone(ready_project.id)
    assert ctx.uploads.count_for_project(ready_project.id) == 0
    assert ctx.asset_drafts.count_for_project(ready_project.id) == 0
    assert ctx.draft_media_staging.count_for_project(ready_project.id) == 0
    assert ctx.approved_assets.count_for_project(ready_project.id) == 0
    assert ctx.exports.count_for_project(ready_project.id) == 0
    assert ctx.ownership_handoffs.count_for_project(ready_project.id) == 0
    assert ctx.generation_runs.count_for_project(ready_project.id) == 0
    assert ctx.stage_jobs.count_for_project(ready_project.id) == 0
    assert ctx.stage_checkpoints.count_for_project(ready_project.id) == 0
    assert ctx.deletion_items.count_for_project(ready_project.id) == 0

def test_orphan_older_than_one_hour_is_deleted(ctx, orphan_blob):
    ctx.clock.advance(hours=1, seconds=1)
    report = ctx.janitor.run_janitor_once(ctx.clock.now())
    assert report.deleted_items >= 1
    assert not ctx.storage.exists(orphan_blob.key)
```

- [ ] **Step 5: Run deletion tests and confirm RED**

Run:

```bash
.venv/bin/python -m pytest \
  apps/api/tests/integration/projects/test_tombstone_deletion.py \
  apps/api/tests/integration/projects/test_late_provider_result.py -q
```

Expected: FAIL because current deletion can race with Worker writes or remove the database row before all deletion targets are confirmed.

- [ ] **Step 6: Implement tombstone-first deletion and per-item ledger retries**

The first transaction must revoke access and enumerate every deletion target; no external call occurs inside that transaction:

```python
def tombstone_project(self, project_id: str, reason: DeletionReason) -> None:
    now = self.clock.now()
    with begin_immediate(self.db):
        project = self.projects.require_including_tombstone(project_id)
        if project.tombstoned_at is not None:
            return
        targets = self.inventory.collect_targets(project_id)
        self.ownership_handoffs.revoke_all_for_project(project_id, now)
        self.projects.mark_tombstoned(project_id, reason, now)
        self.deletion_items.insert_missing(project_id, targets, now)

def assert_project_accessible(self, project_id: str, now: datetime) -> Project:
    project = self.projects.require_including_tombstone(project_id)
    if project.tombstoned_at is not None or project.effective_expires_at <= now:
        if project.tombstoned_at is None:
            self.tombstone_project(project_id, DeletionReason.EXPIRED)
        raise ProjectGone(project_id)
    return project

def run_janitor_once(self, now: datetime) -> JanitorReport:
    self.enqueue_due_raw_upload_deletions(now)
    self.enqueue_due_draft_media_deletions(now)
    self.enqueue_due_export_deletions(now)
    tombstoned = self.expire_due_unapproved_or_approved_projects(now)
    deleted, failed = self.process_due_items(now, exclude_kinds={"ORPHAN"})
    self.record_orphans(
        self.storage.list_orphans(
            referenced_keys=self.inventory.all_referenced_storage_keys(),
            older_than=now - timedelta(hours=1),
        )
    )
    orphan_deleted, orphan_failed = self.process_due_items(
        now, only_kinds={"ORPHAN"}
    )
    deleted += orphan_deleted
    failed += orphan_failed
    purged = 0
    for project_id in self.deletion_items.tombstoned_projects_with_all_items_confirmed():
        self.projects.purge_tombstoned(project_id)
        purged += 1
    return JanitorReport(tombstoned, deleted, failed, purged)
```

`enqueue_due_raw_upload_deletions`, `enqueue_due_draft_media_deletions` and `enqueue_due_export_deletions` atomically mark the item inaccessible/expired and create item-scoped ledger rows, then remove their database references only after physical deletion is confirmed; they never mark the project tombstoned. Unconsumed draft media becomes due at one hour. A staging row consumed by `MASK_REPLACEMENT` may be removed only after the draft reference owns the same content; a row consumed by `PART_REGENERATION` is protected while its linked run is nonterminal and becomes due immediately after its domain-terminal checkpoint unless another authoritative reference exists. `expire_due_unapproved_or_approved_projects` applies the separate whole-project rules above. Tombstoning revokes all pending ownership handoffs in the same first transaction, so no token can claim a project during cleanup. Final project purge is allowed only after every ledger item is `CONFIRMED`; inside one transaction it clears both reverse pointers `active_asset_version_id` and `current_generation_run_id`, clears any generation-lease holder for this project's stages, then deletes the Project. The frozen FK graph cascades uploads, draft-media staging, drafts, approved versions, exports/export files, completed deletion items, handoff rows, generation runs/stages and checkpoints. Tests use an approved, exported, handed-off project with generation history and require zero child rows in every table, so no default RESTRICT edge can block the DELETE. Worker calls `require_not_tombstoned_for_write()` immediately before Provider submission, immediately after Provider result fetch, immediately before every file write and immediately before every database commit. A failed deletion item retains either its project tombstone or its item-level inaccessible/expired marker, increments `attempt_count`, stores a sanitized error code and retries on the next anchored sweep.

- [ ] **Step 7: Write tests for the independent Janitor CLI and startup catch-up**

```python
def test_janitor_once_processes_expired_items(cli_runner, expired_project):
    result = cli_runner.run_module(
        "pindou_pet.commands.janitor", "--once", "--at", "2026-07-17T00:00:00Z"
    )
    assert result.exit_code == 0
    assert '"failed_items": 0' in result.stdout

def test_api_startup_runs_catchup_before_serving(app_factory, expired_project):
    app = app_factory()
    with TestClient(app) as client:
        response = client.get(f"/api/v1/projects/{expired_project.id}")
    assert response.status_code == 410
    assert app.state.janitor_catchup_completed is True

def test_scheduler_is_anchored_instead_of_sleeping_after_work(fake_monotonic, scheduler):
    scheduler.tick()                     # scheduled start 0
    fake_monotonic.advance(seconds=120)  # simulated sweep work
    assert scheduler.seconds_until_next_start() == 2880

def test_item_expiring_just_after_scan_is_deleted_within_one_hour(
    ctx, scheduler, fake_monotonic
):
    scheduler.tick()
    item = ctx.create_item(expires_at=ctx.clock.now() + timedelta(seconds=1))
    ctx.clock.advance(seconds=3599)
    fake_monotonic.advance(seconds=3599)
    scheduler.run_due_ticks()
    assert not ctx.storage.exists(item.key)
    assert ctx.deletion_items.confirmed_at(item.id) <= item.expires_at + timedelta(seconds=3600)
```

- [ ] **Step 8: Run Janitor tests and confirm RED**

Run:

```bash
.venv/bin/python -m pytest \
  apps/api/tests/integration/projects/test_janitor_cli.py \
  apps/api/tests/unit/projects/test_janitor_scheduler.py -q
```

Expected: FAIL because no standalone command, pre-serve catch-up or anchored scheduler exists.

- [ ] **Step 9: Implement the standalone command and catch-up gate**

```python
def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true")
    parser.add_argument("--at")
    parser.add_argument("--interval-seconds", type=int, default=3000)
    parser.add_argument("--max-healthy-sweep-seconds", type=int, default=600)
    return parser

def main() -> int:
    args = build_parser().parse_args()
    container = build_container()
    run_at = (
        datetime.fromisoformat(args.at.replace("Z", "+00:00"))
        if args.at is not None
        else container.clock.now()
    )
    if args.once:
        report = container.janitor.run_janitor_once(run_at)
        print(json.dumps(asdict(report), sort_keys=True))
        return 0 if report.failed_items == 0 else 2
    scheduler = AnchoredJanitorScheduler(
        janitor=container.janitor,
        wall_clock=container.clock,
        monotonic=container.monotonic,
        interval_seconds=args.interval_seconds,
        max_healthy_sweep_seconds=args.max_healthy_sweep_seconds,
    )
    scheduler.run_forever()

@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.janitor_catchup_completed = False
    app.state.container.janitor.run_janitor_once(app.state.container.clock.now())
    app.state.janitor_catchup_completed = True
    yield
```

Production invocation is independent of API and Worker:

```bash
.venv/bin/python -m pindou_pet.commands.janitor \
  --interval-seconds 3000 --max-healthy-sweep-seconds 600
```

`AnchoredJanitorScheduler` schedules each start from the previous monotonic deadline, not from the end of the previous sweep; a 120-second sweep therefore leaves 2880 seconds until the next 3000-second start. Due deletion-ledger items are processed before orphan discovery. A healthy sweep must finish within 600 seconds, so an item expiring immediately after a sweep is confirmed deleted no later than `3000 + 600 = 3600` seconds afterward. If a sweep exceeds the budget, the Janitor health check becomes failed and the next sweep starts immediately; the product must not claim the healthy-service guarantee while that alarm is active. Startup catch-up uses the same ordering.

- [ ] **Step 10: Run RED→GREEN verification**

Run:

```bash
.venv/bin/python -m pytest \
  apps/api/tests/unit/projects/test_retention_policy.py \
  apps/api/tests/integration/projects/test_tombstone_deletion.py \
  apps/api/tests/integration/projects/test_late_provider_result.py \
  apps/api/tests/integration/projects/test_janitor_cli.py \
  apps/api/tests/unit/projects/test_janitor_scheduler.py -q
.venv/bin/python -m alembic upgrade head
make contracts
pnpm contracts:check
pnpm --filter @pindou/web test --run src/features/project/AssetRetentionStatus.test.tsx
```

Expected: PASS; fake-clock cases match all four TTLs, late results are discarded, and deletion failure never restores access.

- [ ] **Step 11: Commit the independently reviewable change**

```bash
git add \
  apps/api/src/pindou_pet/modules/projects/models.py \
  apps/api/src/pindou_pet/modules/projects/repository.py \
  apps/api/src/pindou_pet/modules/projects/deletion.py \
  apps/api/src/pindou_pet/modules/projects/retention.py \
  apps/api/src/pindou_pet/modules/projects/janitor.py \
  apps/api/src/pindou_pet/modules/projects/janitor_scheduler.py \
  apps/api/src/pindou_pet/commands/janitor.py \
  apps/api/src/pindou_pet/api/dependencies.py \
  apps/api/src/pindou_pet/modules/projects/routes.py \
  apps/api/src/pindou_pet/modules/projects/schemas.py \
  apps/api/src/pindou_pet/modules/jobs/routes.py \
  apps/api/src/pindou_pet/modules/assets/service.py \
  apps/api/src/pindou_pet/modules/assets/routes.py \
  apps/api/src/pindou_pet/modules/exports/routes.py \
  packages/contracts \
  apps/web/src/features/project/AssetRetentionStatus.tsx \
  apps/web/src/features/project/AssetRetentionStatus.test.tsx \
  apps/web/src/features/interaction/components/InteractionPage.tsx \
  apps/web/src/features/export/components/ExportPage.tsx \
  apps/api/src/pindou_pet/main.py \
  apps/api/src/pindou_pet/modules/jobs/tasks.py \
  migrations/versions/0008_retention_fields.py \
  apps/api/tests/unit/projects/test_retention_policy.py \
  apps/api/tests/integration/projects/test_tombstone_deletion.py \
  apps/api/tests/integration/projects/test_late_provider_result.py \
  apps/api/tests/integration/projects/test_janitor_cli.py \
  apps/api/tests/unit/projects/test_janitor_scheduler.py
git commit -m "feat(api): enforce tombstones and retention deadlines"
```

---

### Task 5: Generation Provider 可恢复合同与适配器门禁

**Files:**

- Modify: `apps/api/src/pindou_pet/domain/providers.py`
- Modify: `apps/api/src/pindou_pet/providers/generation/adapter.py`
- Modify: `apps/api/src/pindou_pet/modules/projects/deletion.py`
- Modify: `apps/api/src/pindou_pet/modules/projects/janitor.py`
- Modify: `apps/api/tests/fakes/generation_provider.py`
- Modify: `tests/contracts/providers/test_generation_contract.py`
- Create: `tests/contracts/providers/test_generation_adapter.py`
- Create: `tests/live/providers/test_generation_provider_live.py`
- Create: `apps/api/tests/integration/projects/test_provider_deletion.py`
- Modify: `pyproject.toml`

**Interfaces:**

- Consumes: Task 1 `idempotency_key`, Task 2 reconciliation and existing `GenerationRequest` / `NormalizedImageResult` domain types.
- Produces: one reusable contract suite that every generation adapter must pass before configuration is accepted.

```python
class GenerationProvider(Protocol):
    @property
    def manifest(self) -> ProviderManifest: ...
    def submit(
        self, request: GenerationRequest, *, idempotency_key: str
    ) -> str: ...
    def lookup_by_idempotency_key(self, key: str) -> str | None: ...
    def status(self, provider_job_id: str) -> ProviderJobState: ...
    def result(self, provider_job_id: str) -> NormalizedImageResult: ...
    def cancel(self, provider_job_id: str) -> None: ...
    def delete(self, provider_job_id: str) -> ProviderDeletionResult: ...

class ProviderJobState(StrEnum):
    QUEUED = "QUEUED"
    RUNNING = "RUNNING"
    SUCCEEDED = "SUCCEEDED"
    FAILED_RETRYABLE = "FAILED_RETRYABLE"
    FAILED_FINAL = "FAILED_FINAL"
    REJECTED = "REJECTED"
    CANCELLED = "CANCELLED"

class ProviderDeletionResult(StrEnum):
    DELETED = "DELETED"
    NOT_FOUND = "NOT_FOUND"
    UNSUPPORTED = "UNSUPPORTED"

@dataclass(frozen=True)
class ProviderManifest:
    provider_name: str
    model_name: str
    model_version: str
    frozen_parameters_sha256: str
    supports_delete: bool
    declared_max_retention_hours: int | None
    data_policy_checksum: str
```

- [ ] **Step 1: Write the reusable fake-backed contract tests**

```python
class GenerationProviderContract:
    def make_provider(self) -> GenerationProvider:
        raise NotImplementedError

    def request(self) -> GenerationRequest:
        return frozen_generation_request()

    def test_same_key_returns_same_job(self):
        provider = self.make_provider()
        first = provider.submit(self.request(), idempotency_key="idem-1")
        second = provider.submit(self.request(), idempotency_key="idem-1")
        assert second == first

    def test_lookup_recovers_accepted_job(self):
        provider = self.make_provider()
        accepted = provider.submit(self.request(), idempotency_key="idem-2")
        assert provider.lookup_by_idempotency_key("idem-2") == accepted

    def test_cancel_is_idempotent(self):
        provider = self.make_provider()
        job_id = provider.submit(self.request(), idempotency_key="idem-3")
        provider.cancel(job_id)
        provider.cancel(job_id)
        assert provider.status(job_id) == ProviderJobState.CANCELLED

    def test_delete_matches_the_frozen_manifest(self):
        provider = self.make_provider()
        job_id = provider.submit(self.request(), idempotency_key="idem-delete")
        result = provider.delete(job_id)
        if provider.manifest.supports_delete:
            assert result in {ProviderDeletionResult.DELETED, ProviderDeletionResult.NOT_FOUND}
        else:
            assert result is ProviderDeletionResult.UNSUPPORTED

    def test_request_contract_carries_all_required_generation_controls(self):
        request = self.request()
        assert len(request.reference_images) == 3
        assert request.identity_traits
        assert request.target_pose.face_direction == "front"
        assert request.target_pose.body_rotation_degrees == 20
        assert request.target_pose.tail_side == "screen_right"
        assert request.attempt >= 0
        assert isinstance(request.seed, int)

    def test_manifest_freezes_model_and_data_policy(self):
        manifest = self.make_provider().manifest
        assert manifest.model_name
        assert manifest.model_version
        assert len(manifest.frozen_parameters_sha256) == 64
        assert len(manifest.data_policy_checksum) == 64
        assert manifest.supports_delete or manifest.declared_max_retention_hours is not None
```

Add explicit cases for queued, running, success, timeout after acceptance, rate limit, one retryable 5xx, content rejection, missing output, non-image output and corrupt image bytes. Add a second request fixture with `edit_mask`, `edit_instruction`, incremented `attempt` and fixed `seed` to prove local part regeneration is covered by the same contract.

- [ ] **Step 2: Run contract tests and confirm RED**

Run:

```bash
.venv/bin/python -m pytest \
  tests/contracts/providers/test_generation_adapter.py -q
```

Expected: FAIL because the adapter does not normalize every state or cannot recover an accepted request by idempotency key.

- [ ] **Step 3: Harden the Phase 1 frozen adapter without inventing a provider API**

```python
def lookup_by_idempotency_key(self, key: str) -> str | None:
    # `_frozen_api` is the provider-specific transport whose real lookup call
    # and official capability evidence passed Phase 1. No list-and-filter or
    # in-process key map is an acceptable substitute.
    return self._frozen_api.lookup_by_idempotency_key(key)

def status(self, provider_job_id: str) -> ProviderJobState:
    return self._frozen_api.normalized_status(provider_job_id)

def result(self, provider_job_id: str) -> NormalizedImageResult:
    downloaded = self._frozen_api.download_result_bytes(provider_job_id)
    metadata = self._frozen_api.normalized_result_metadata(provider_job_id)
    with Image.open(io.BytesIO(downloaded)) as decoded:
        width, height = decoded.size
        decoded.verify()
    png_bytes = normalize_to_png(downloaded)
    return NormalizedImageResult(
        png_bytes=png_bytes,
        width=width,
        height=height,
        content_hash=hashlib.sha256(png_bytes).hexdigest(),
        seed=metadata.seed,
        model_name=self.manifest.model_name,
        model_version=self.manifest.model_version,
        request_fingerprint=metadata.request_fingerprint,
    )
```

The exact `_frozen_api` calls and raw status mapping are copied from the passing Phase 1 adapter and its official capability audit; this task may add validation and redaction but may not replace them with a fabricated `client_reference` endpoint. The Provider job ID remains only on `StageJob`, and `ProviderManifest` remains on the adapter; neither is added to the already frozen `NormalizedImageResult` domain value.

The adapter logger may emit only internal job ID, normalized state, sanitized error code, duration, frozen model name and version. It must never log request images, prompts containing user traits, Base64, credentials, raw response or output URL.

The adapter maps the Provider's documented deletion endpoint to `ProviderDeletionResult`; it must not treat cancel as deletion. Task 4's janitor uses `cancel` for nonterminal jobs and, only when `manifest.supports_delete`, retains/retries a `PROVIDER_DELETE` ledger item until `DELETED` or `NOT_FOUND`. When deletion is unsupported, local purge is allowed after local targets are confirmed and no false remote-deletion ledger item is created. Public wording is receipt-driven: while any local item remains it says only “访问已撤销，正在清理”；after all local items are confirmed it may say “已从本系统存储删除；第三方仍按其已披露的数据政策处理”；only `supports_delete=True` with verified `DELETED/NOT_FOUND`, or a frozen zero-retention policy, may say “已从所有处理方删除”.

Add integration tests proving a terminal job with `supportsDelete=true` creates/retries `PROVIDER_DELETE` and does not display the global-deletion message before a verified receipt; an unsupported Provider creates no remote-deletion item, purges local data, and returns only the limited local-deletion message.

- [ ] **Step 4: Add a log-redaction contract test**

```python
def test_adapter_logs_exclude_sensitive_payload(caplog, provider, sensitive_request):
    provider.submit(sensitive_request, idempotency_key="idem-secret")
    rendered = "\n".join(record.getMessage() for record in caplog.records)
    image_bytes = sensitive_request.reference_images[0].png_bytes
    forbidden = [
        base64.b64encode(image_bytes).decode("ascii"),
        image_bytes.hex(),
        "private-trait-canary",
        sensitive_request.edit_instruction or "edit-instruction-canary",
        provider.api_key.get_secret_value(),
        "data:image/",
    ]
    assert all(value not in rendered for value in forbidden)
```

- [ ] **Step 5: Add the opt-in live Provider gate**

The live test uses three synthetic, non-user reference images from test fixtures and a disposable idempotency key. It records model/version/parameters but not URLs or image bytes in test output:

```python
@pytest.mark.live_provider
def test_live_provider_supports_submit_lookup_and_cancel(live_provider):
    cancel_key = f"contract-cancel-{uuid4()}"
    cancel_job_id = live_provider.submit(
        synthetic_request(), idempotency_key=cancel_key
    )
    assert live_provider.lookup_by_idempotency_key(cancel_key) == cancel_job_id
    live_provider.cancel(cancel_job_id)
    live_provider.cancel(cancel_job_id)
    if not live_provider.manifest.supports_delete:
        return
    delete_key = f"contract-delete-{uuid4()}"
    delete_job_id = live_provider.submit(
        synthetic_request(), idempotency_key=delete_key
    )
    try:
        assert live_provider.lookup_by_idempotency_key(delete_key) == delete_job_id
        assert live_provider.delete(delete_job_id) in {
            ProviderDeletionResult.DELETED,
            ProviderDeletionResult.NOT_FOUND,
        }
    except BaseException:
        live_provider.cancel(delete_job_id)
        raise
```

- [ ] **Step 6: Run local RED→GREEN contract verification**

Run:

```bash
.venv/bin/python -m pytest \
  tests/contracts/providers/test_generation_adapter.py \
  apps/api/tests/integration/projects/test_provider_deletion.py -q
```

Expected: PASS; the fake adapter demonstrates one accepted task per key and normalized error behavior.

- [ ] **Step 7: Run the explicitly authorized live gate**

Run only in an environment containing the configured Provider credential:

```bash
RUN_LIVE_PROVIDER=1 \
  .venv/bin/python -m pytest \
  tests/live/providers/test_generation_provider_live.py \
  -m live_provider -q
```

Expected: PASS; submit→lookup returns the same job ID and repeated cancel is safe. If this fails, stop Provider integration work; do not weaken the contract or compensate with automatic resubmission.

- [ ] **Step 8: Commit the independently reviewable change**

```bash
git add \
  apps/api/src/pindou_pet/domain/providers.py \
  apps/api/src/pindou_pet/providers/generation/adapter.py \
  apps/api/src/pindou_pet/modules/projects/deletion.py \
  apps/api/src/pindou_pet/modules/projects/janitor.py \
  apps/api/tests/fakes/generation_provider.py \
  tests/contracts/providers/test_generation_contract.py \
  tests/contracts/providers/test_generation_adapter.py \
  tests/live/providers/test_generation_provider_live.py \
  apps/api/tests/integration/projects/test_provider_deletion.py \
  pyproject.toml
git commit -m "test(api): enforce generation provider recovery contract"
```

---

### Task 6: 浏览器主路径、恢复路径与错误输入 E2E

**Files:**

- Create: `apps/web/e2e/fixtures/approved-asset-v1.json`
- Create: `apps/web/e2e/fixtures/input-cases.ts`
- Create: `apps/web/e2e/main-flow.spec.ts`
- Create: `apps/web/e2e/mobile-creation.spec.ts`
- Create: `apps/web/e2e/recovery-flow.spec.ts`
- Create: `apps/web/e2e/invalid-inputs.spec.ts`
- Modify: `apps/api/src/pindou_pet/main.py`
- Modify: `apps/api/tests/fakes/perception_bundle.py`
- Modify: `tests/e2e/server.py`
- Create: `tests/e2e/worker.py`
- Create: `tests/e2e/fake_provider_control.py`
- Modify: `apps/web/e2e/global-setup.ts`
- Modify: `apps/web/e2e/global-teardown.ts`
- Modify: `apps/web/playwright.config.ts`
- Modify: `apps/web/package.json`
- Modify: `apps/web/src/features/editor/components/EditorPage.tsx`
- Modify: `apps/web/src/features/interaction/components/InteractionStage.tsx`
- Modify: `apps/web/src/features/export/components/ExportPage.tsx`

**Interfaces:**

- Consumes: `/api/v1` OpenAPI client from `packages/contracts/src/generated.ts`, the fake Provider from Task 5, immutable approved asset API, revision-conflict API and approved-only export API.
- Produces: repeatable browser evidence for upload→生成→校正→逐豆→批准→互动→导出→删除 and all required recovery branches.

- [ ] **Step 1: Freeze the E2E environment and write the main path test**

Merge these fields into the existing Phase 3/4 config; do not replace its owner `storageState`, Vite/API lifecycle or hardware project definitions. Set Chromium viewport `1440×900`, `deviceScaleFactor: 1`, locale `zh-CN`, timezone `Asia/Shanghai`, reduced motion disabled, one Worker and retries disabled locally:

```ts
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    baseURL: "http://127.0.0.1:4173",
    storageState: resolveRepoPath("var/e2e/current/owner-storage-state.json"),
    browserName: "chromium",
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
    colorScheme: "light",
  },
  webServer: {
    command: "pnpm dev --host 127.0.0.1 --port 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
  },
  projects: [
    chromiumCiProject(),
    mobileEssentialProject({ viewport: { width: 390, height: 844 } }),
    frozenHardwareProject("frozen-desktop-real", "desktop"),
    frozenHardwareProject("frozen-mobile-real", "mobile"),
  ],
});
```

The four helpers are the Phase 4 config helpers backed by `config/interaction-performance-devices.json`; frozen projects fail fast when their approved device endpoint is absent, while ordinary `make check` selects only `chromium-ci`. This task adds `mobile-essential` without deleting or renaming the other three projects.

```ts
test("three photos reach an approved interactive and exportable asset", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("checkbox", { name: "同意第三方处理" }).check();
  await uploadThreeGuidedCatFixtures(page);
  await page.getByRole("button", { name: "开始生成" }).click();
  await expect(page.getByText("形象待确认", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "接受初稿" }).click();
  await completeLayerReview(page);
  await editOneBeadAndUndo(page);
  await page.getByRole("button", { name: "批准角色" }).click();
  await expect(page.getByText(/^资产版本 v\d+$/)).toBeVisible();
  await triggerAndAssertFiveActions(page);
  await expectDownload(page, "PNG");
  await expectDownload(page, "PDF");
  await page.getByRole("button", { name: "删除宠物" }).click();
  await expect(page.getByText("该宠物已删除")).toBeVisible();
});
```

- [ ] **Step 2: Run the main path and confirm RED**

Run:

```bash
pnpm --filter @pindou/web test:e2e -- main-flow.spec.ts --project=chromium-ci
```

Expected: FAIL at the first missing stable test ID, fake Provider wiring or delete confirmation behavior.

- [ ] **Step 3: Add only the deterministic E2E composition root required by the main path**

Reuse the Phase 3 `ServiceOverrides | None` application-factory seam; production passes `None` and follows the frozen real factories. `tests/e2e/server.py` remains the only E2E Uvicorn composition root: it constructs the app with the existing durable fake `GenerationProvider` plus the committed deterministic `LocalPerceptionBundle` fake that implements instance labels, foreground/part masks, view confidence and identity confidence for the synthetic valid/invalid fixtures. Layer generation must exercise the same service/task code with this interface fake; do not ship ONNX blobs or silently bypass perception stages.

Playwright global setup creates one private temporary root and starts both `tests.e2e.server:app` and one independent `tests.e2e.worker` process with explicit shared `PINDOU_DATABASE_URL=sqlite:////.../e2e.db`, `PINDOU_STORAGE_ROOT=.../storage`, test-only `PINDOU_REDIS_URL=redis://127.0.0.1:6379/14`, `PINDOU_SESSION_SECRET=<random test secret>`, and the durable fake-store path. Redis DB 14 is reserved for this E2E harness: setup verifies the URL ends in `/14` and `FLUSHDB`s it before migrations/Worker start; teardown stops Worker/API first and then `FLUSHDB`s DB 14 before destroying the root. Add an isolation smoke that runs the main suite twice and sees the same one-job counts. The setup waits for API health and Worker readiness. The default durable fake completes deterministically when the real Worker polls, so main/mobile paths cross `IDENTITY_EXTRACTION`, `IDENTITY_GENERATION` and `LAYER_GENERATION` without hanging.

Recovery setup is race-free: the non-HTTP CLI first pauses the E2E Worker and waits for an acknowledged idle/paused state, the browser creates the run/stage, then `arm-stage-manual --project-id <id> --kind <kind>` resolves the persisted stage/idempotency key from SQLite and atomically marks that exact fake submission manual before `resume-worker`. The helper asserts zero Provider accepts/polls/terminal checkpoints between pause and arm. The fake consumes the manual marker atomically on submit. Do not use “arm next” after an active Worker or a test-control HTTP route. `tests/e2e/fake_provider_control.py` owns pause/arm/resume and fake completion over the same durable store/repositories. Do not use the default `var/pindou.db`, a developer credential, a global model install, an undefined `PINDOU_PROVIDER` switch or a production-only branch. Vite remains the browser origin on `127.0.0.1:4173` and proxies `/api` to Uvicorn.

```json
{
  "scripts": {
    "test:e2e": "playwright test",
    "test:e2e:update": "playwright test --update-snapshots"
  }
}
```

- [ ] **Step 4: Write recovery E2E cases**

```ts
test("refresh resumes current review step", async ({ page }) => {
  const project = await createProjectAtLayerReview(page);
  await page.reload();
  await expect(page).toHaveURL(`/projects/${project.id}/edit?tab=layers`);
  await expect(page.getByText(`草稿修订 ${project.revision}`)).toBeVisible();
});

test("double generate click resolves to one durable job id", async ({ page }) => {
  await uploadValidProject(page);
  const jobIds = captureGenerationResponseJobIds(page);
  await page.getByRole("button", { name: "开始生成" }).dblclick();
  await expect.poll(() => jobIds()).toHaveLength(1);
});

test("stale revision displays conflict and preserves server draft", async ({ page }) => {
  await openTwoEditorsForSameDraft(page);
  await saveFromFirstEditor();
  await saveFromSecondEditor();
  await expect(page.getByText("角色已在另一个页面更新，请重新载入")).toBeVisible();
  expect(await fetchServerDraft()).toEqual(firstEditorDraft());
});

test("late provider result after deletion stays gone", async ({ page }) => {
  const project = await createPollingProject(page);
  await deleteProject(page, project.id);
  await completeFakeProviderJob(project.providerJobId);
  await runOneWorkerTurn();
  await expectProjectGone(project.id);
});
```

- [ ] **Step 5: Write the nine explicit invalid-input E2E cases**

`input-cases.ts` must name the expected photo slot and reason for: missing image, repeated angle, dog, multiple cats, blur, cropped paws, rear view, severe occlusion and clearly different cats.

```ts
for (const inputCase of invalidInputCases) {
  test(`rejects ${inputCase.id} with a localized reason`, async ({ page }) => {
    await page.goto("/");
    await inputCase.upload(page);
    const start = page.getByRole("button", { name: "开始生成" });
    if (inputCase.id === "missing") {
      await expect(start).toBeDisabled();
      await expect(page.getByRole("alert").filter({ hasText: inputCase.expectedReason }))
        .toBeVisible();
      return;
    }
    await start.click();
    await expect(page.getByRole("alert").filter({ hasText: inputCase.expectedReason }))
      .toBeVisible();
    await expect(start).toBeDisabled();
  });
}
```

Add a `mobile-essential` Playwright project at `390×844` and prove the creation/progress/shape-confirmation path is usable without horizontal overflow; navigating to `/edit` must show the approved desktop-only editing notice rather than a broken canvas:

```ts
test("mobile creation works and fine editing is explicitly desktop-only", async ({ page }) => {
  await page.goto("/");
  await consentAndUploadThreeGuidedPhotos(page);
  await page.getByRole("button", { name: "开始生成" }).click();
  await expect(page.getByText("形象待确认", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(390);
  await page.goto(currentProjectEditUrl());
  await expect(page.getByText(/宽度至少 1280px/)).toBeVisible();
});
```

- [ ] **Step 6: Run recovery and invalid-input tests and confirm RED**

Run:

```bash
pnpm --filter @pindou/web test:e2e -- \
  recovery-flow.spec.ts invalid-inputs.spec.ts --project=chromium-ci
pnpm --filter @pindou/web test:e2e -- mobile-creation.spec.ts --project=mobile-essential
```

Expected: FAIL until every case exposes a stable localized reason and recovery API state.

- [ ] **Step 7: Make the minimal UI/API testability corrections and run GREEN**

Only keep the already frozen `[data-testid="interaction-stage"]` canvas boundary; use roles, labels and visible status copy elsewhere. Do not duplicate application state in browser-only test stores. Worker restart and fake completion controls use the non-HTTP test-process CLI, fake Provider and the same repositories/tasks as production. The main-path test asserts that API and Worker PIDs differ and that every queued stage has a terminal checkpoint; clicking “开始生成” may not be followed by direct project-state mutation in the harness.

Run:

```bash
pnpm --filter @pindou/web test:e2e -- \
  main-flow.spec.ts recovery-flow.spec.ts invalid-inputs.spec.ts --project=chromium-ci
pnpm --filter @pindou/web test:e2e -- mobile-creation.spec.ts --project=mobile-essential
```

Expected: PASS with 1 desktop main path, 1 mobile creation/desktop-edit-boundary path, 4 recovery cases and 9 invalid-input cases.

- [ ] **Step 8: Commit the independently reviewable change**

```bash
git add \
  apps/web/e2e/fixtures/approved-asset-v1.json \
  apps/web/e2e/fixtures/input-cases.ts \
  apps/web/e2e/main-flow.spec.ts \
  apps/web/e2e/mobile-creation.spec.ts \
  apps/web/e2e/recovery-flow.spec.ts \
  apps/web/e2e/invalid-inputs.spec.ts \
  apps/api/src/pindou_pet/main.py \
  apps/api/tests/fakes/perception_bundle.py \
  tests/e2e/server.py \
  tests/e2e/worker.py \
  tests/e2e/fake_provider_control.py \
  apps/web/e2e/global-setup.ts \
  apps/web/e2e/global-teardown.ts \
  apps/web/playwright.config.ts \
  apps/web/package.json \
  apps/web/src/features/editor/components/EditorPage.tsx \
  apps/web/src/features/interaction/components/InteractionStage.tsx \
  apps/web/src/features/export/components/ExportPage.tsx
git commit -m "test(web): cover creation recovery and deletion flows"
```

---

### Task 7: 互动性能、视觉回归与实体导出合同

**Files:**

- Modify: `apps/web/src/features/interaction/model/sampleAnimation.ts`
- Modify: `apps/web/src/features/interaction/components/InteractionStage.tsx`
- Create: `apps/web/src/features/interaction/performance.ts`
- Create: `apps/web/src/features/interaction/performance.test.ts`
- Create: `apps/web/e2e/performance/interaction-performance.spec.ts`
- Create: `apps/web/e2e/visual/approved-asset.visual.spec.ts`
- Modify: `apps/web/playwright.config.ts`
- Modify: `apps/web/playwright.visual.config.ts`
- Modify: `config/interaction-performance-devices.json`
- Create: `apps/api/tests/modules/exports/test_png_contract.py`
- Create: `apps/api/tests/modules/exports/test_pdf_contract.py`
- Create: `apps/api/tests/modules/exports/test_board_reassembly.py`

**Interfaces:**

- Consumes: Phase 4 `F01`–`F05` instrumentation fixtures, approved canonical asset, five action names, neutral matrix, project ID, `canonicalAssetHash`, `rendererVersion`, PNG/PDF renderer and four-board splitter.
- Produces: deterministic animation sampling, measurable first visual frame, reproducible screenshots and project-scoped export assertions. This task validates the instrument with fixtures; Task 8 runs it on private formal `C01`–`C05` across both frozen devices.

```ts
export type ActionName =
  | "breath"
  | "blink"
  | "tail_wag"
  | "raise_screen_left_front_paw"
  | "bounce";

// Import and preserve Phase 4's `AnimationSample` contract:
// { nodePoses, activeVariantByGroup }. Do not redefine it as transforms only.
export { sampleAnimation, type AnimationSample } from "./model/sampleAnimation";

export function percentile(values: readonly number[], percentile: number): number;

// Reuse Phase 4 `ActionFrameMetric` and the single event name
// `pindou:action-frame`; do not introduce a second telemetry contract.
export type { ActionFrameMetric } from "./components/InteractionStage";
```

- [ ] **Step 1: Write unit tests for deterministic animation and percentile math**

```ts
it("samples the same keyframe independent of wall clock", () => {
  expect(sampleAnimation(asset, "tail_wag", 250))
    .toEqual(sampleAnimation(asset, "tail_wag", 250));
});

it("returns the exact neutral transform at action end", () => {
  for (const action of ACTION_NAMES) {
    expect(sampleAnimation(asset, action, durationOf(asset, action)))
      .toEqual(neutralSample(asset));
  }
});

it("treats a blink variant switch as a visual change", () => {
  const neutral = neutralSample(asset);
  const closed = sampleAnimation(asset, "blink", 80);
  expect(hasVisualChange(closed, neutral)).toBe(true);
  expect(closed.nodePoses).toEqual(neutral.nodePoses);
});

it("calculates nearest-rank p95", () => {
  expect(percentile(Array.from({ length: 100 }, (_, index) => index + 1), 95)).toBe(95);
});
```

- [ ] **Step 2: Run interaction unit tests and confirm RED**

Run:

```bash
pnpm --filter @pindou/web test -- \
  src/features/interaction/performance.test.ts
```

Expected: FAIL because animation sampling still depends on live RAF state or percentile instrumentation is absent.

- [ ] **Step 3: Harden the existing Phase 4 sampling and first-frame event**

Keep Phase 4's `pindou:action-frame` and `ActionFrameMetric` unchanged. Verify `InteractionStage` saves the trigger timestamp and returned `requestedRunId`, then emits only after the requested run is active and its complete `AnimationSample` differs visually from `neutralSample`—either a node pose changes or `activeVariantByGroup` changes. Comparing transforms alone is forbidden because blink can be variant-only; accepting any non-neutral frame is forbidden because an old idle/restoring run may still be visible:

```ts
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) throw new Error("percentile requires samples");
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil((p / 100) * sorted.length) - 1];
}
```

Add Phase 5 regression cases for variant-only blink and a user action triggered during an old idle/restoring pose. Instrumentation observes rendering but does not modify animation data, queue actions or production thresholds.

- [ ] **Step 4: Write the 30-trigger-per-action Playwright performance test**

```ts
for (const fixtureId of ["F01", "F02", "F03", "F04", "F05"] as const) {
  test(`@hardware-performance ${fixtureId} five actions meet budgets`, async ({ page }) => {
    await openFrozenInteractionFixture(page, fixtureId);
    await warmUpEachAction(page, 3);
    for (const action of ACTION_NAMES) {
      const samples = await collectFirstFrameSamples(page, action, 30);
      expect(Math.max(...samples)).toBeLessThanOrEqual(200);
      test.info().annotations.push({
        type: `${fixtureId}-${action}-p95-ms`,
        description: String(percentile(samples, 95)),
      });
      const frameTimes = await collectActionFrameTimes(page, action, 30);
      expect(percentile(frameTimes, 95)).toBeLessThanOrEqual(33.3);
    }
  });
}
```

Use foreground Chromium only; fail the test if `document.visibilityState !== "visible"` or if the frozen device manifest is missing. Run this fixture matrix in both `frozen-desktop-real` and `frozen-mobile-real`; emulation cannot satisfy the mobile hardware gate.

- [ ] **Step 5: Write visual snapshots for neutral, five keyframes and four boards**

```ts
test("@visual approved asset keyframes remain stable", async ({ page }) => {
  await openFrozenInteractionFixture(page);
  await expect(page.getByTestId("interaction-stage")).toHaveScreenshot("neutral.png");
  for (const action of ACTION_NAMES) {
    await seekAction(page, action, keyframeMs[action]);
    await expect(page.getByTestId("interaction-stage"))
      .toHaveScreenshot(`${action.toLowerCase()}-keyframe.png`);
  }
});

test("@visual four board previews remain oriented", async ({ page }) => {
  await openFrozenExportFixture(page);
  for (const board of ["top-left", "top-right", "bottom-left", "bottom-right"]) {
    await expect(page.getByTestId(`board-${board}`)).toHaveScreenshot(`${board}.png`);
  }
});
```

- [ ] **Step 6: Write backend export contract tests**

```python
def test_png_decodes_and_matches_manifest(export_bundle):
    image = Image.open(export_bundle.png_path)
    image.verify()
    assert image.format == "PNG"
    assert export_bundle.manifest.canonical_asset_hash == APPROVED_HASH
    assert export_bundle.manifest.renderer_version == RENDERER_VERSION

def test_pdf_is_a4_and_contains_expected_pages(export_bundle):
    reader = PdfReader(export_bundle.pdf_path)
    assert len(reader.pages) == 6
    for page in reader.pages:
        assert float(page.mediabox.width) == pytest.approx(595.2756, abs=0.5)
        assert float(page.mediabox.height) == pytest.approx(841.8898, abs=0.5)
    extracted = "\n".join(page.extract_text() or "" for page in reader.pages)
    assert "50 mm" in extracted
    assert "材料清单" in extracted

def test_four_boards_reassemble_exact_neutral_matrix(approved_asset):
    neutral = compose_neutral_matrix(approved_asset)
    boards = split_boards(neutral)
    assert reassemble_boards(boards) == neutral
    assert sum(sum(count_colors(board).values()) for board in boards) == count_non_empty(neutral)
```

The PDF contract expects 6 pages: one full preview, four physical boards and one material list. Each board page records board ID, orientation, `canonicalAssetHash`, `rendererVersion`, actual peg pitch and the 50mm calibration line.

- [ ] **Step 7: Run all new tests and confirm RED**

Run:

```bash
pnpm --filter @pindou/web test -- \
  src/features/interaction/performance.test.ts
node tools/device/android-chrome.mjs with-session \
  --manifest config/interaction-performance-devices.json -- \
  pnpm --filter @pindou/web test:e2e -- --grep @hardware-performance \
    --project=frozen-desktop-real --project=frozen-mobile-real
pnpm --filter @pindou/web test:e2e -- --config=playwright.visual.config.ts \
  --grep @visual --project=visual-test
.venv/bin/python -m pytest apps/api/tests/modules/exports -q
```

Expected: FAIL until deterministic seeking, performance instrumentation, screenshots and export metadata all exist.

- [ ] **Step 8: Implement only the missing deterministic/export metadata seams**

Keep the canonical asset and Phase 4 export DTO unchanged. Verify the repository's existing project-scoped cache identity and manifest fields; do not add a second `cacheKey` or rename `neutralMatrixHash`:

```python
cache_identity = (project.id, approved.canonical_asset_hash, renderer.version)
manifest = export_service.create_export(project.id, approved.immutable_version_id, [])
assert repository.cache_identity(manifest.export_id) == cache_identity
assert manifest.canonical_asset_hash == approved.canonical_asset_hash
assert manifest.neutral_matrix_hash == compose_neutral_matrix(approved).neutral_matrix_hash
assert manifest.renderer_version == renderer.version
```

Do not update snapshot baselines to hide an unexplained difference. Generate the first baseline explicitly, review every neutral/action/board image against the approved asset, and only then retain it:

```bash
pnpm --filter @pindou/web test:e2e:update -- \
  --config=playwright.visual.config.ts --grep @visual --project=visual-test
```

- [ ] **Step 9: Run RED→GREEN verification**

Run:

```bash
pnpm --filter @pindou/web test -- \
  src/features/interaction/performance.test.ts
node tools/device/android-chrome.mjs with-session \
  --manifest config/interaction-performance-devices.json -- \
  pnpm --filter @pindou/web test:e2e -- --grep @hardware-performance \
    --project=frozen-desktop-real --project=frozen-mobile-real
pnpm --filter @pindou/web test:e2e -- --config=playwright.visual.config.ts \
  --grep @visual --project=visual-test
.venv/bin/python -m pytest apps/api/tests/modules/exports -q
```

Expected: PASS; performance output contains device/fixture/action P95 and maximum for 30 triggers after three warmups across 2 devices × 5 fixtures × 5 actions, visual snapshots are stable, and board reconstruction is cell-identical to the 58×58 neutral matrix.

- [ ] **Step 10: Commit the independently reviewable change**

```bash
git add \
  apps/web/src/features/interaction/model/sampleAnimation.ts \
  apps/web/src/features/interaction/components/InteractionStage.tsx \
  apps/web/src/features/interaction/performance.ts \
  apps/web/src/features/interaction/performance.test.ts \
  apps/web/e2e/performance/interaction-performance.spec.ts \
  apps/web/e2e/visual/approved-asset.visual.spec.ts \
  apps/web/e2e/visual/approved-asset.visual.spec.ts-snapshots \
  apps/web/playwright.config.ts \
  apps/web/playwright.visual.config.ts \
  config/interaction-performance-devices.json \
  apps/api/tests/modules/exports/test_png_contract.py \
  apps/api/tests/modules/exports/test_pdf_contract.py \
  apps/api/tests/modules/exports/test_board_reassembly.py
git commit -m "test: verify interaction performance and physical exports"
```

---

### Task 8: 五猫正式验收协议、证据采集与全量门禁

**Files:**

- Create: `acceptance/five-cat-protocol.yaml`
- Create: `acceptance/ten-cat-extension-protocol.yaml`
- Create: `tools/acceptance/models.py`
- Create: `tools/acceptance/prepare_run.py`
- Create: `tools/acceptance/collect_run.py`
- Create: `tools/acceptance/collect_automated_audits.py`
- Create: `tools/acceptance/collect_perception_audit.py`
- Create: `tools/acceptance/record_operator_training.py`
- Create: `tools/acceptance/record_pose_quality.py`
- Create: `tools/acceptance/record_similarity.py`
- Create: `tools/acceptance/record_action_quality.py`
- Create: `tools/acceptance/verify_run.py`
- Create: `tools/acceptance/formal_stack.py`
- Create: `tools/acceptance/test_formal_stack.py`
- Create: `tools/acceptance/browser-harness.mjs`
- Create: `tools/acceptance/browser-harness.test.mjs`
- Create: `apps/api/tests/acceptance/evidence_fixtures.py`
- Create: `apps/api/tests/acceptance/test_evidence_validator.py`
- Modify: `.gitignore`
- Modify: `Makefile`

**Interfaces:**

- Consumes: all Phase 5 test evidence, approved asset manifests, Provider/palette manifests and private dataset path `PINDOU_ACCEPTANCE_DATA_DIR`.
- Produces: a content-addressed, original-photo-free five-cat gate, per-cat asset/action/review-presentation evidence, and a separate ten-cat extension report. A non-zero five-cat validator exit blocks acceptance; the ten-cat report never hides or replaces that decision.

Python owns protocol parsing, hashes and sanitized evidence; it does not import Python Playwright. `browser-harness.mjs` is the sole browser subprocess with versioned JSON IPC subcommands for the physical-mobile creation flow, headed desktop review, two in-product ownership handoffs, export preview, pose/action review, blind similarity presentation and real-rAF interaction metrics. The root tool resolves Playwright explicitly from the Web workspace with `createRequire(new URL("../../apps/web/package.json", import.meta.url))("@playwright/test")`; a bare root import is forbidden under pnpm's strict layout. It imports Phase 4's `tools/device/android-chrome.mjs` directly for ADB reverse/forward/open/cleanup; both it and `apps/web/e2e/device/androidChrome.ts` reuse that `.mjs` transport, so the acceptance harness does not import TypeScript at runtime. Python writes a mode-`0600` request file under the ignored private-state directory containing only private input paths/project IDs/device role, and launches exactly `pnpm --filter @pindou/web exec node ../../tools/acceptance/browser-harness.mjs --request-file <private-path>`. The Node process reads each Mac-private image into a `Buffer` and calls `setInputFiles` with a Playwright `FilePayload {name,mimeType,buffer}`; it never passes a host path to Android. Before C01 it proves this on the real CDP-connected phone with a synthetic byte payload in an in-memory `<input type=file>` page, reads back name/type/size/SHA-256 in the browser, and fail-closes if payload injection is unsupported—there is no unverified host-path or adb-push fallback. The sanitized device capability/hash goes to `environment.json`; private source bytes, payloads and paths remain only in the mode-0600 request/Node memory and never reach stdout/artifacts. It validates exit code plus the `schemaVersion:1` JSON response, hashes it, then deletes the raw IPC file. Each sample's two raw handoff tokens are created, claimed and discarded entirely inside that one Node process; they never cross JSON IPC. While each token is still in memory, the harness exact-scans its own captured console/network/request/trace buffers and private harness logs for that value, then emits only transition ID plus zero/nonzero match count and scanner checksum; it never emits the token or its digest. Cookies and source paths never appear on argv/stdout/artifacts; stdout contains sanitized metrics/hashes only. Contract tests reject unknown commands/fields, non-private permissions, use of path strings in `setInputFiles`, mismatched project/canonical/device hashes, any response containing a cookie/raw token/full handoff URL/image payload, or any nonzero in-process leak count.

**Evidence layout:**

```text
.artifacts/acceptance/<run-id>/
  environment.json
  sample-manifest.json
  provider-manifest.json
  palette-manifest.json
  project-timeline.ndjson
  sample-failures.json
  creation-device-evidence.json
  handoff-evidence.json
  handoff-audit.json
  secret-leak-audit.json
  input-validation.json
  perception-validation.json
  recovery-audit.json
  retention-audit.json
  pre-correction-layers.json
  asset-quality.json
  pose-quality.json
  action-quality.json
  review-presentation.json
  operator-training.json
  correction-times.json
  interaction-metrics.json
  export-checksums.json
  export-preview-evidence.json
  similarity-scores.csv
  summary.json
  report.md
  seal.json
```

- [ ] **Step 1: Write the frozen protocol file**

Use exactly these gates:

```yaml
schema_version: 1
report_mode: formal_gate
sample_ids: [C01, C02, C03, C04, C05]
coverage:
  required_patterns: [solid, orange, tabby, tuxedo]
  required_coats: [long, short]
inputs_per_cat: 3
invalid_inputs:
  required_cases: [missing, repeated_view, dog, multiple_cats, blur, cropped_paws, rear_view, severe_occlusion, different_cats]
  require_photo_specific_reason: true
  require_ui_wiring_audit: true
  require_frozen_perception_bundle_audit: true
creation:
  creation_device: frozen_mobile
  editing_device: frozen_desktop
  final_interaction_device: frozen_mobile
  queue_must_be_empty_for_timing: true
ownership_handoff:
  required_sequence: [mobile_to_desktop, desktop_to_same_mobile]
  required_case_ids:
    - token_free_bootstrap
    - committed_response_loss_same_session_replay
    - other_session_replay_rejected
    - page_memory_loss_project_list_recovery
    - token_ttl_599_600
    - token_rotation_and_double_claim
    - active_run_continuity
    - effective_project_expiry_and_claim_vs_janitor
    - claim_vs_owner_mutations
    - claim_vs_draft_read_timing
    - claim_vs_status_marker_persistence
    - claim_vs_export_cache_hit
    - old_new_owner_item_status_and_list_exclusion
    - handoff_headers_and_token_leakage
  require_product_ui_claim: true
  require_single_owner_after_each_claim: true
  token_ttl_seconds: 600
  require_single_use_rotation_and_race_audit: true
  forbid_cookie_import_between_devices: true
  forbid_raw_token_in_ipc_storage_logs_traces_and_evidence: true
initial_draft_seconds_max: 120
correction_minutes:
  operator_training_demo_minutes: 5
  require_training_completion_before_first_sample: true
  exclude_part_provider_wait: true
  exclude_bead_editing: true
  median_max: 5
  per_cat_max: 10
regeneration:
  full_after_initial_max: 1
  local_max: 2
  server_wait_seconds_max: 300
similarity:
  reviewers: 3
  overall_mean_min: 4.0
  per_cat_mean_min: 3.5
  role_display: final_approved_neutral_58x58_nearest_neighbor_8x
asset:
  grid: [58, 58]
  board_size: 29
  required_groups:
    - BODY
    - HEAD
    - SCREEN_LEFT_FRONT_PAW
    - SCREEN_RIGHT_FRONT_PAW
    - TAIL
    - EYES
  logical_group_count_min: 6
  logical_group_count_max: 8
  palette_colors_max: 32
  require_nonempty_groups: true
  require_source_bead_rig_correspondence: true
  require_cell_exact_save_roundtrip: true
  require_pre_correction_layer_checkpoint: true
  reject_out_of_bounds_duplicate_cells_parent_cycles_and_unknown_colors: true
pose:
  require_face_front: true
  body_right_target_degrees: 20
  body_right_tolerance_degrees: 10
  require_tail_screen_right: true
  require_frozen_automatic_metrics: true
  require_blinded_operator_confirmation: true
actions:
  required:
    - breath
    - blink
    - tail_wag
    - raise_screen_left_front_paw
    - bounce
  max_joint_gap_beads: 1
  require_no_scale_detachment_wrong_occlusion_or_crop: true
  require_exact_neutral_end: true
interaction:
  required_devices: [frozen_desktop, frozen_mobile]
  triggers_per_action: 30
  first_frame_max_ms: 200
  report_first_frame_p95: true
  frame_time_p95_max_ms: 33.3
export:
  preview_devices: [frozen_desktop, frozen_mobile]
  boards: 4
  board_grid: [29, 29]
  require_cell_exact_reassembly: true
  require_color_count_equality: true
  require_png_decode: true
  require_pdf_a4_and_50mm_calibration: true
  require_actual_file_validation_per_cat: true
recovery:
  explanatory_failure_or_reconciliation_seconds_max: 600
  require_single_provider_accept_per_idempotency_key: true
retention:
  require_fake_clock_ttl_audit: true
  require_anchored_scheduler_audit: true
  max_deletion_lag_seconds_while_service_healthy: 3600
failure_evidence:
  allow_typed_terminal_pipeline_failure: true
  require_dependency_derived_not_applicable_gates: true
  never_convert_failed_sample_to_pass: true
pass_rule: all_five_cats_must_pass_every_gate
```

The typed protocol model requires `ownership_handoff.required_case_ids` to be nonempty, unique and exactly equal to the validator's supported case-ID set; unknown, missing or duplicated IDs fail protocol loading rather than silently weakening the gate. `acceptance/ten-cat-extension-protocol.yaml` references this exact gate schema/checksum—including the identical ordered handoff case list—expands `sample_ids` to `C01`–`C10`, and sets `report_mode: extension_diagnostic`. It cannot change thresholds or the five-cat pass decision; it produces per-sample failures and aggregate distributions after the formal gate.

- [ ] **Step 2: Write validator tests for a passing run and one-cat failure**

```python
def test_passing_fixture_returns_zero(tmp_path):
    run = write_passing_run(tmp_path / "passing-run")
    result = verify_run(run, PROTOCOL)
    assert result.exit_code == 0
    assert result.failed_samples == []

def test_one_failed_cat_fails_the_entire_run():
    run = write_failing_single_cat_run(tmp_path / "failing-run", sample_id="C03")
    result = verify_run(run, PROTOCOL)
    assert result.exit_code == 1
    assert result.failed_samples == ["C03"]

def test_evidence_rejects_original_image_files(tmp_path):
    run = write_passing_run(tmp_path / "passing-run")
    (run / "cat.jpg").write_bytes(b"private")
    result = verify_run(run, PROTOCOL)
    assert result.exit_code == 1
    assert "forbidden image file" in result.errors

def test_evidence_rejects_unfrozen_environment(tmp_path):
    run = write_passing_run(tmp_path / "passing-run")
    environment = read_json(run / "environment.json")
    del environment["chromium_version"]
    write_json(run / "environment.json", environment)
    assert verify_run(run, PROTOCOL).exit_code == 1

def test_evidence_rejects_missing_or_discontinuous_product_handoff(tmp_path):
    run = write_passing_run(tmp_path / "passing-run")
    rows = read_json(run / "handoff-evidence.json")
    rows[0]["newOwnerStatus"] = 404
    write_json(run / "handoff-evidence.json", rows)
    result = verify_run(run, PROTOCOL)
    assert result.exit_code == 1
    assert "handoff continuity" in result.errors

def test_evidence_and_private_logs_reject_handoff_token_canary(tmp_path):
    run = write_passing_run(tmp_path / "passing-run")
    environment = read_json(run / "environment.json")
    environment["chromium_version"] = HANDOFF_TOKEN_CANARY
    write_json(run / "environment.json", environment)
    result = verify_run(run, PROTOCOL)
    assert result.exit_code == 1
    assert "credential leak" in result.errors

def test_formal_stop_scans_actual_private_log_and_fails_closed(tmp_path):
    stack = write_stopped_formal_stack(tmp_path)
    stack.private_process_log("api").write_text(
        'POST /ownership-handoffs/claim {"token":"HANDOFF_TOKEN_CANARY"}'
    )
    result = stop_formal_stack(stack)
    audit = read_json(stack.run_dir / "secret-leak-audit.json")
    assert result.exit_code == 1
    assert audit["pass"] is False
    assert audit["forbiddenMatchCount"] == 1
    assert "HANDOFF_TOKEN_CANARY" not in json.dumps(audit)

def test_extension_accepts_typed_pre_approval_failure_as_structurally_complete():
    run = write_extension_run_with_terminal_failure(
        sample_id="C08",
        failed_stage="LAYER_GENERATION",
        not_applicable={"asset", "pose", "actions", "interaction", "export", "similarity"},
    )
    result = verify_run(run, EXTENSION_PROTOCOL)
    assert result.exit_code == 0
    assert result.failed_samples == ["C08"]

def test_failure_record_cannot_hide_independent_or_upstream_missing_evidence():
    run = write_extension_run_with_terminal_failure(
        sample_id="C08",
        failed_stage="EXPORT",
        not_applicable={"similarity"},
    )
    result = verify_run(run, EXTENSION_PROTOCOL)
    assert result.exit_code == 1
    assert "invalid not_applicable dependency" in result.errors
```

- [ ] **Step 3: Run validator tests and confirm RED**

Run:

```bash
.venv/bin/python -m pytest \
  apps/api/tests/acceptance/test_evidence_validator.py -q
.venv/bin/python -m pytest tools/acceptance/test_formal_stack.py -q
pnpm --filter @pindou/web exec node --test ../../tools/acceptance/browser-harness.test.mjs
```

Expected: FAIL because the protocol parser and evidence validator do not exist.

- [ ] **Step 4: Implement typed evidence parsing and fail-closed validation**

```python
@dataclass(frozen=True)
class VerificationResult:
    exit_code: int
    failed_samples: list[str]
    errors: list[str]
    metrics: dict[str, float]

FORBIDDEN_EVIDENCE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp", ".heic"}

def verify_run(run_dir: Path, protocol_path: Path) -> VerificationResult:
    errors = validate_required_files(run_dir)
    errors.extend(reject_image_files(run_dir, FORBIDDEN_EVIDENCE_SUFFIXES))
    protocol = load_protocol(protocol_path)
    evidence = load_evidence(run_dir)
    errors.extend(validate_frozen_environment(evidence.environment))
    failed_samples = [
        sample_id
        for sample_id in protocol.sample_ids
        if not sample_passes_every_gate(sample_id, evidence, protocol)
    ]
    blocks_on_sample_failure = protocol.report_mode != "extension_diagnostic"
    exit_code = 0 if not errors and (not failed_samples or not blocks_on_sample_failure) else 1
    return VerificationResult(exit_code, failed_samples, errors, aggregate(evidence))
```

Every JSON/CSV input must reject missing fields, NaN, infinity, duplicate sample IDs, timestamps outside the run interval, mismatched canonical hashes and checksums that do not match files. `sample-failures.json` contains at most one terminal pipeline failure per sample with `sampleId`, project/public-run IDs when created, `failedStage`, sanitized error code, server timestamp, bounded attempt counters, hashes of completed evidence, and a sorted `notApplicableGates`. The validator owns an explicit dependency graph: only failure before an approved asset may make asset/pose/actions/interaction/export/similarity not applicable; failure of interaction or export cannot hide the independent similarity gate, and no failure may hide an upstream/completed gate. Missing downstream rows are structurally valid only when exactly justified by this graph, but the sample always remains in `failed_samples`. Formal-gate mode therefore exits 1; `extension_diagnostic` may exit 0 only for complete typed evidence while still reporting the failure. `input-validation.json` proves browser/UI error wiring with the deterministic fake; the separate `perception-validation.json` must prove that the deployed frozen instance/view-yaw/re-ID/segmenter bundle itself accepts every protocol-declared sample and rejects every private invalid case with the expected slot/code, binding freeze/model/threshold/data-manifest checksums. Neither file may substitute for the other. `secret-leak-audit.json` is required for every sealed segment and must bind the stopped segment ID, harness in-process exact-scan row count, sanitized formal-private-state scan counts/checksums, zero forbidden matches and `pass:true`; a missing row, nonzero count, unscanned required location or scanner-version mismatch prevents sealing.

For each sample, `creation-device-evidence.json` must prove the physical mobile browser used the product UI to create the project, upload three views, submit exactly one initial generation, observe progress and reach shape confirmation; the desktop must not be given its cookie. `handoff-evidence.json` must then contain exactly two sanitized transitions: physical mobile → frozen desktop before editing, and frozen desktop → the same preserved mobile `BrowserSession` after approval. Each transition records direction, server times, hashed anonymous session IDs, project ID, the public `currentGenerationJobId` immediately before/after that claim, old-owner item GET 404, old-owner session list 200 excluding the project, and new-owner item GET/list membership 200; the job-ID values for one claim must be equal, while later legitimate pipeline requests may advance the field. The second transition additionally binds the unchanged approved canonical hash. It may not contain a token, full claim URL, cookie, screenshot, trace, console log or network body. After the first claim only desktop performs editor mutations and desktop performance/export-preview/download collection; after the second claim only mobile performs mobile performance/export-preview collection and remains final owner. Exactly one project and one final active approved asset exist; there is exactly one accepted initial run, no duplicate run per request/business key, and only the specification's bounded full/layer/part runs. `handoff-audit.json` must bind one passing row to every ID in the frozen protocol's `ownership_handoff.required_case_ids`; an unknown, missing, skipped, duplicated or failed row invalidates the audit. `pre-correction-layers.json` must bind the first successful `LAYER_GENERATION` checkpoint, a timestamp before correction opened, zero user-edit revisions, 6–8 nonempty automatic groups and each source mask/rig hash. `asset-quality.json` must prove the approved canonical hash, 6–8 nonempty logical groups, source↔bead rig/variant/z-order correspondence, legal cells/colors, save roundtrip and palette count. `pose-quality.json` must bind that canonical hash and the frozen pose-evaluator checksum, record automatic `faceYawDegrees`, `bodyRightDegrees`, tail/body centroids and the derived three booleans, plus separate operator confirmations; face-front, body 10–30 degrees inclusive and tail on screen right must all pass automatically and visually. `operator-training.json` must prove one uninterrupted 300-second demo completed by the hashed operator before C01 correction opened, and every correction record binds its hash.

`action-quality.json` must contain all five actions and explicit pass/fail observations for scale, detachment, occlusion, crop, joint gap and exact neutral end. `export-checksums.json` must contain per-cat results from decoding the actual downloaded PNG/PDF before deletion: four 29×29 board matrices, exact 58×58 reassembly/neutral hash, per-color and total counts, PNG dimensions/mode, A4 media box and a 50 mm calibration vector measured as 141.732 PDF points within the frozen tolerance. A file checksum alone is insufficient. `export-preview-evidence.json` must prove both frozen devices opened the same canonical asset and rendered all four boards, material/color table, risk legend and physical-color disclaimer without horizontal overflow or missing controls. `review-presentation.json` must bind three private reference hashes, the approved canonical/neutral-matrix hash, nearest-neighbor scale 8, anchor-text checksum and blinded order used for scoring.

The protocol model uses `extra="forbid"`, and `verify_run` must fail if any declared protocol gate lacks a validator; this prevents silently adding a YAML key that the evidence checker ignores. Global UI-input, real-perception, recovery-deadline and anchored fake-clock retention audits are required evidence alongside per-cat gates. Only `extension_diagnostic` changes exit semantics: complete valid evidence exits 0 while preserving `failed_samples`; it never changes thresholds or the formal five-cat gate result.

`--write-report --seal` is allowed only on an unsealed, stopped segment: it writes deterministic summary/report bytes and then the sorted content manifest in `seal.json`. `--check-seal` opens everything read-only, recomputes protocol/producer/evidence/report hashes, and exits nonzero on any byte drift; it never rewrites a timestamp or report. Every other collector/preparer refuses a sealed run directory.

- [ ] **Step 5: Implement run preparation without copying source photos**

`prepare_run.py` reads this external structure:

```text
$PINDOU_ACCEPTANCE_DATA_DIR/
  C01/{FRONT,CAT_LEFT_FRONT_45,CAT_RIGHT_FRONT_45}.*
  C02/{FRONT,CAT_LEFT_FRONT_45,CAT_RIGHT_FRONT_45}.*
  C03/{FRONT,CAT_LEFT_FRONT_45,CAT_RIGHT_FRONT_45}.*
  C04/{FRONT,CAT_LEFT_FRONT_45,CAT_RIGHT_FRONT_45}.*
  C05/{FRONT,CAT_LEFT_FRONT_45,CAT_RIGHT_FRONT_45}.*
  C06...C10/{FRONT,CAT_LEFT_FRONT_45,CAT_RIGHT_FRONT_45}.*  # ten-cat extension
  invalid-inputs/
    manifest.yaml
    <case-id>/**  # private files/slots declared by the manifest
  sample-metadata.yaml
```

It writes only hashes and metadata:

```python
def build_sample_manifest(data_dir: Path, protocol: AcceptanceProtocol) -> dict[str, object]:
    return {
        "samples": [
            {
                "sample_id": sample_id,
                "coverage": metadata[sample_id],
                "inputs": {
                    angle: {
                        "sha256": sha256_file(resolve_private_input(data_dir, sample_id, angle)),
                        "byte_size": resolve_private_input(data_dir, sample_id, angle).stat().st_size,
                    }
                    for angle in ("FRONT", "CAT_LEFT_FRONT_45", "CAT_RIGHT_FRONT_45")
                },
            }
            for sample_id in protocol.sample_ids
        ]
    }
```

The script must refuse an output directory inside `PINDOU_ACCEPTANCE_DATA_DIR` and refuse to copy, symlink or hard-link image files. It also creates the explicitly supplied `.acceptance-private/<run-id>` directory with mode `0700`. That ignored directory—not `.artifacts`—owns per-sample project IDs, device-scoped resume state, resumable operator state and the private blinding map. Any desktop storage state may reopen only the same frozen desktop role; any physical-mobile resume state may be restored only into the same manifest-matched Android Chrome role. Moving either cookie state into the other device is forbidden. The final mobile browser normally keeps its cookie on-device through its dedicated tab. The directory never contains a handoff token or complete handoff URL; raw tokens live only in one Node process between issuance and claim. Cookie-bearing state files use mode `0600`. Artifact manifests contain only hashes of this state, never cookies or signed tokens.

- [ ] **Step 6: Implement collection and blind similarity recording**

`collect_automated_audits.py` runs before the formal real-Provider stack starts. It reserves Redis DB 13 for crash/reconciliation tests and DB 14 for fake browser E2E, while formal collection later uses DB 15; it refuses equal URLs/database indexes and records the three sanitized roles in `environment.json`. It runs the exact committed invalid-input Playwright suite with the JSON reporter, the Redis-backed crash/reconciliation/deadline selection, and one committed handoff test selection that covers every ID in `protocol.ownership_handoff.required_case_ids`. It also runs the fake-clock TTL plus anchored-Janitor-scheduler selection using temporary reports. It fail-closes on any unknown, duplicated, missing, skipped or failed required case, including deletion-lag boundaries, then writes sanitized `input-validation.json`, `handoff-audit.json`, `recovery-audit.json`, and `retention-audit.json` containing commit SHA, command, runtime versions, test-file hashes, the protocol-derived required case IDs, pass counts/durations and raw-report checksum; it deletes temporary raw reports, scans its own DB13/14 test artifacts and temporary logs for handoff-token/cookie canaries, flushes only DB 13/14 after child processes stop, and never reads private acceptance photos. This preliminary scan does not substitute for the stopped DB15 formal-segment scan below.

`collect_perception_audit.py` is a separate no-Provider command. It loads `config/segmentation.freeze.yaml` through the production perception factory—not `ServiceOverrides`—and iterates exactly `protocol.sample_ids` plus `invalid-inputs/manifest.yaml` from the private dataset. Formal five-cat mode therefore audits C01–C05; extension `--record-missing-only` verifies every existing C01–C05 row/hash against the sealed source, computes only C06–C10, merges by unique sample ID in protocol order and refuses overwrite/drift. It runs the real `inspect_photo_set` path, requires every valid group to pass, and requires every invalid case to return its frozen photo slot/code without a confirmation fallback. Tests cover five-cat, ten-cat missing-only merge, duplicate/drift rejection and interrupted atomic rewrite. It writes only image hashes, expected/actual code+slot, confidence-band decision, freeze/model/license/ABI/threshold checksums and pass booleans to `perception-validation.json`; raw images, embeddings and masks stay out of artifacts. A fake E2E pass cannot make this audit pass.

`collect_run.py` iterates `protocol.sample_ids` (or only their missing IDs under `--collect-missing-only`) using `--private-state-dir` and calls one long-lived `browser-harness.mjs` command per sample rather than a Python browser library. Before the first sample it requires the physical Android FilePayload capability proof above. The Node harness opens the manifest-matched physical-mobile browser, creates the project through the real UI, reads each private input into memory and injects it as a `FilePayload` buffer, accepts exactly one backend generation request, observes progress and reaches shape confirmation. It then clicks the product handoff control, keeps the first raw fragment token only in a JavaScript variable, claims it in a separately initialized headed desktop browser, runs the in-process exact leak scan, discards the token, and asserts mobile 404/desktop 200 with the same project and `currentGenerationJobId`. The trained operator performs all shape/layer/bead editing and approval in that desktop UI. Desktop action/performance/export-preview/download evidence is collected while desktop is owner. The harness then performs a second in-product handoff entirely in memory back to the same saved mobile session, exact-scans and discards that token, asserts desktop 404/mobile 200 with the same project/run/canonical hash, and collects mobile action/performance/export-preview evidence. No `context.addCookies`, cookie copying or browser-storage token bridge is permitted. `--resume` probes both saved browser states: exactly one must own the project; it resumes that persisted `currentStep` and can issue a fresh product handoff if needed, but never recreates the project, resets server timing or persists a raw token. If a sample reaches a terminal pipeline failure before approval, the collector records the typed server-grounded failure and dependency-derived `notApplicableGates` in `sample-failures.json`, never fabricates downstream rows, and continues only as allowed by the protocol; later recorders skip exactly those justified gates. Post-approval threshold failures still require all independent evidence and are never marked not-applicable. The collector records sanitized transition rows and zero/nonzero in-process scan results without secrets, server timestamps and the untouched first `LAYER_GENERATION` checkpoint in `pre-correction-layers.json`, then runs the approved-asset validator into `asset-quality.json`; `formal_stack.py stop` later binds those scan results into the final `secret-leak-audit.json`.

After approval and before the second handoff, `collect_run.py` downloads each real export as the desktop owner to a private temporary directory outside the evidence tree. Before deletion it opens every PNG with Pillow, samples all board cells against the frozen palette, reassembles four 29×29 matrices, compares the exact neutral matrix and color counts, opens the PDF with `PdfReader`, verifies A4 media boxes and inspects the decoded content stream for the frozen 141.732-point (50 mm) calibration vector. It writes the structured results and file hashes to `export-checksums.json`, then deletes the files. The Node harness records desktop preview/performance while desktop owns the project, performs the second product handoff, then records physical-mobile preview/performance while mobile owns it; the two rows bind the same canonical hash and show four boards, material table, risk legend and physical-color disclaimer. It uses 3 warmups plus 30 measured triggers for each action and fails if device manifest, physical-mobile endpoint, project/canonical hash or sample count differs; viewport emulation cannot populate formal hardware evidence. Direct cookie import between device contexts is a protocol violation.

`record_operator_training.py` serves the frozen non-acceptance demo, records an uninterrupted server-timed 300-second exercise and writes only demo checksum, hashed operator ID, start/completion times and pass to `operator-training.json`. It must run before C01 correction begins; `collect_run.py` refuses correction mode without its hash.

`record_pose_quality.py` opens the formal SQLite/storage in read-only acceptance mode, resolves each project's active immutable version and high-resolution neutral source composition directly from the repository, and uses the Phase 1 frozen pose evaluator to record face yaw, body-right angle and tail/body centroids. It never loads or imports a browser cookie. It presents the final neutral 58×58 role at nearest-neighbor scale to an operator blinded to Provider and thresholds. The operator confirms face front/body right/tail screen right. It writes only metrics, booleans, canonical/evaluator/device hashes and hashed operator ID to `pose-quality.json`; any automatic or visual failure fails that cat.

`record_action_quality.py` calls the Node harness to reconnect over CDP to the same dedicated physical-mobile Chrome tab that remained final owner after the second claim; it does not restore that cookie into a desktop/reviewer context. It steps the meaningful keyframes for each action without writing screenshots, traces or network bodies to the run directory, overlays the one-bead joint-gap gauge, and requires a trained operator to answer the frozen booleans `noScale`, `noDetachment`, `correctOcclusion`, `notCropped`, `jointGapAtMostOneBead`, and `exactNeutralEnd`. It writes only hashed operator ID, sample/action, booleans, timestamp, canonical hash and device manifest hash to `action-quality.json`; any false/missing value fails that cat.

`record_similarity.py` serves a loopback-only review page that reads the three original references directly from `PINDOU_ACCEPTANCE_DATA_DIR` and reads the final active approved neutral 58×58 role through the formal repository/storage in read-only acceptance mode. It never imports the mobile cookie or calls a user-authenticated product API. It verifies the repository canonical hash against `asset-quality.json`, keeps all pixels in memory, and displays the role at exactly 464×464 using nearest-neighbor scaling beside all three references and the frozen 1/3/5 anchor text from the spec. It writes no image/cache/service-worker file, randomizes anonymous role order per reviewer, hides provider/thresholds, records the presentation hashes/config in `review-presentation.json`, and accepts scores only in `[1, 2, 3, 4, 5]`:

```python
def record_score(
    run_dir: Path,
    private_state_dir: Path,
    reviewer_id: str,
    anonymous_role_id: str,
    score: int,
) -> None:
    if score not in {1, 2, 3, 4, 5}:
        raise ValueError("score must be an integer from 1 to 5")
    mapping = load_private_blinding_map(private_state_dir / "blinding-map.json")
    append_score(
        run_dir / "similarity-scores.csv",
        reviewer_id=sha256_text(reviewer_id),
        sample_id=mapping[anonymous_role_id],
        score=score,
    )
```

The reviewer file stores hashed reviewer IDs, sample ID, score and timestamp only. Provider name and pass thresholds are not shown during rating.

- [ ] **Step 7: Run validator RED→GREEN tests**

Run:

```bash
.venv/bin/python -m pytest \
  apps/api/tests/acceptance/test_evidence_validator.py -q
```

Expected: PASS; the passing fixture exits 0, any single-cat gate failure exits 1, and evidence containing an image file is rejected.

- [ ] **Step 8: Extend the complete repository gate without replacing earlier checks**

Keep the Phase 0 `lint`, `contracts-check`, `test`, `typecheck`, and `build` targets. Add only these new targets and extend `check`; do not replace earlier recipes:

```make
.PHONY: e2e visual acceptance-evidence-check
e2e:
	pnpm --filter @pindou/web test:e2e -- --project=chromium-ci --grep-invert '@live|@hardware-performance|@visual'

visual:
	pnpm --filter @pindou/web test:e2e -- --config=playwright.visual.config.ts --project=visual-test --grep '@visual'

acceptance-evidence-check:
	.venv/bin/python -m pytest apps/api/tests/acceptance -q
	.venv/bin/python -m pytest tools/acceptance/test_formal_stack.py -q
	node --test tools/device/android-chrome.test.mjs
	pnpm --filter @pindou/web exec node --test ../../tools/acceptance/browser-harness.test.mjs

check: lint contracts-check test typecheck build e2e visual acceptance-evidence-check
```

Add these ignore rules:

```gitignore
.artifacts/
.acceptance-private/
```

- [ ] **Step 9: Run the complete automated gate**

Run:

```bash
RUN_REDIS_TESTS=1 PINDOU_REDIS_URL=redis://127.0.0.1:6379/15 make check
```

Expected: PASS; Python unit/contract/export/integration tests (including Redis-marked cases), Web tests, typecheck, production build and non-live/non-hardware Playwright tests all exit 0.

- [ ] **Step 10: Commit the evidence producers before collecting evidence**

Commit the protocol, validator, formal-stack launcher and browser harness now—not after the run they produce:

```bash
git add \
  acceptance/five-cat-protocol.yaml \
  acceptance/ten-cat-extension-protocol.yaml \
  tools/acceptance/models.py \
  tools/acceptance/prepare_run.py \
  tools/acceptance/collect_run.py \
  tools/acceptance/collect_automated_audits.py \
  tools/acceptance/collect_perception_audit.py \
  tools/acceptance/record_operator_training.py \
  tools/acceptance/record_pose_quality.py \
  tools/acceptance/record_similarity.py \
  tools/acceptance/record_action_quality.py \
  tools/acceptance/verify_run.py \
  tools/acceptance/formal_stack.py \
  tools/acceptance/test_formal_stack.py \
  tools/acceptance/browser-harness.mjs \
  tools/acceptance/browser-harness.test.mjs \
  apps/api/tests/acceptance/evidence_fixtures.py \
  apps/api/tests/acceptance/test_evidence_validator.py \
  .gitignore \
  Makefile
git commit -m "test: add reproducible pet acceptance protocols"
git status --short
git rev-parse HEAD
```

Expected: the worktree is empty. Every audit and formal artifact from the next steps records this exact committed SHA plus producer-file hashes. Do not modify or commit producer/application code during collection; a necessary fix invalidates the run and requires a new clean run from the new commit.

- [ ] **Step 11: Prepare the formal five-cat run**

Run:

```bash
.venv/bin/python tools/acceptance/prepare_run.py \
  --protocol acceptance/five-cat-protocol.yaml \
  --data-dir "$PINDOU_ACCEPTANCE_DATA_DIR" \
  --run-dir .artifacts/acceptance/current \
  --private-state-dir .acceptance-private/current
```

Expected: creates `.artifacts/acceptance/current`, records exactly C01–C05 with three SHA-256 hashes each, freezes OS/device/browser/network/provider/palette manifests, and contains no image files.

- [ ] **Step 12: Collect isolated automated audits, then one real end-to-end run**

First keep the formal Web/API/Worker/Janitor stopped and run isolated audits. DB 13 is the Redis integration-audit database, DB 14 is the fake E2E database, and DB 15 is declared only so the script can prove it will not touch the later formal database:

```bash
PINDOU_AUDIT_REDIS_URL=redis://127.0.0.1:6379/13 \
PINDOU_E2E_REDIS_URL=redis://127.0.0.1:6379/14 \
PINDOU_FORMAL_REDIS_URL=redis://127.0.0.1:6379/15 \
  .venv/bin/python tools/acceptance/collect_automated_audits.py \
  --protocol acceptance/five-cat-protocol.yaml \
  --run-dir .artifacts/acceptance/current
.venv/bin/python tools/acceptance/collect_perception_audit.py \
  --protocol acceptance/five-cat-protocol.yaml \
  --data-dir "$PINDOU_ACCEPTANCE_DATA_DIR" \
  --run-dir .artifacts/acceptance/current
```

After those commands finish and their child processes release ports 4173/8000, use the scoped formal-stack launcher. `prepare` resolves a run-specific private root `.acceptance-private/current/formal-stack/`, creates a mode-0600 shared session secret, and configures a fresh SQLite DB plus empty storage beneath that root. Its required `--segment-private-state-dir` identifies the browser/recorder-private root for the current evidence segment; the raw path is stored only in the mode-0600 launcher config, while `environment.json` receives only its role and canonical identity hash. It refuses an existing DB/storage object, any DB-15 Redis key, occupied port, live recorded PID, nonempty project/run/stage/deletion tables or generation-lease holder; it never silently resets them. It builds the Web app and runs Alembic against that exact DB. Only an explicit `prepare --resume` may reuse a stopped stack; it verifies the recorded git/config/schema hashes, preserves DB/storage/session secret and requires empty DB 15 so startup reconciliation can rebuild RQ state. The private launcher config keeps an append-only `runId -> segmentPrivateRootHash` registry: retrying the same segment must match its prior hash, while a new ten-cat extension run may register a previously unregistered distinct root exactly once after sealed-source/link checks. That new root may contain only the allowlisted mode-0600 metadata created by `prepare_run` (including `formal-stack-link.json` and frozen blinding/run metadata); any prior browser context, request/response file, log, scratch output or unknown entry is stale state and causes refusal. Any other mismatch fails instead of migrating or resetting the evidence run. Unit tests use fake processes/ports/Redis to prove fresh-run refusal, same-segment root mismatch, one-time extension-root registration with allowlisted prepare metadata, rejection of extra stale state, shared environment, partial-start rollback and owned PID/PGID process-group stop behavior.

`start` launches exactly these four child commands with one frozen environment map and private log/PID files:

```text
.venv/bin/python -m uvicorn --factory pindou_pet.main:create_app --host 127.0.0.1 --port 8000
.venv/bin/python -m pindou_pet.worker
.venv/bin/python -m pindou_pet.commands.janitor --interval-seconds 3000 --max-healthy-sweep-seconds 600
pnpm --filter @pindou/web exec vite preview --host 127.0.0.1 --port 4173
```

The shared map contains `PINDOU_ENV=acceptance`, the launcher-computed absolute `PINDOU_DATABASE_URL`, `PINDOU_STORAGE_ROOT`, `PINDOU_REDIS_URL=redis://127.0.0.1:6379/15`, private `PINDOU_SESSION_SECRET`, `PINDOU_SESSION_COOKIE_SECURE=false`, frozen Provider/perception paths and inherited Provider credential; Web alone also receives `PINDOU_API_ORIGIN=http://127.0.0.1:8000`. The insecure-cookie setting is a frozen loopback-only acceptance exception required by the physical phone's ADB-reversed `http://127.0.0.1:4173`; it is recorded in sanitized environment evidence, binds only 127.0.0.1, and deployed `PINDOU_ENV=production` requires TLS plus `PINDOU_SESSION_COOKIE_SECURE=true`. The launcher starts each of the four child commands with `start_new_session=True`, records both leader PID and owned PGID, and never adopts an existing process. This is required for the pnpm→Vite descendant tree. `wait-ready` requires all four process-group leaders alive, Alembic at head, direct and Web-proxied `/api/health/ready` success, a real public-Web GET `/handoff` with `Cache-Control: no-store` and `Referrer-Policy: no-referrer`, one registered RQ Worker and a live Janitor process. It appends only sanitized config/path hashes, schema revision, PIDs/PGIDs, executable/runtime versions, header checks, start times and command hashes to `environment.json`; secrets, cookies and raw paths do not enter artifacts. `stop` requires the same `--segment-private-state-dir` identity recorded by `prepare`, sends TERM only to recorded owned process groups, waits a bounded interval, sends KILL to surviving owned groups, and verifies every descendant plus ports 4173/8000 is gone; partial-start rollback uses the same path. After logs are immutable, it consumes the harness's sanitized exact-token scan counts and scans both the shared formal-stack private root and the current segment-private root, including text logs, request/IPC directories, artifact tree, and allowlisted SQLite text/JSON columns, for `/handoff#`, token-in-query/path, `pindou_session`/Cookie headers, claim-body token fields and frozen canaries. When both roots are the same, canonical-path deduplication scans each file/row once. It asserts all mode-0600 browser request/response scratch files were deleted; only the legitimate 64-hex `OwnershipHandoff.token_digest` column is exempt. It does not pattern-scan private image/media bytes. It writes `secret-leak-audit.json` with segment/run IDs, scanner/canary checksums, both hashed scan-root identities, file/row/transition counts, `forbiddenMatchCount` and pass—never a matched value, raw path, cookie or token. A match or segment-root mismatch still completes process/Redis shutdown, writes `pass:false`, and exits nonzero so sealing is impossible. It then records a checksum/count of formal Redis keys, flushes only DB 15 after shutdown (SQLite can reconstruct any durable work), preserves private SQLite/storage for evidence/resume, and fails if an unrelated PID/PGID would be targeted. Tests cover a wrapper that forks a descendant, child failure, SIGINT, partial start, idempotent stop, segment-root mismatch, a clean two-root private-state scan, and a canary inserted into an actual private process log that produces only sanitized failed evidence. If any recorder, review or validator command fails before Step 15, do not continue: immediately run the exact active-segment `formal_stack.py stop` command, then investigate against the preserved DB/storage.

Run the launcher, then the recorders. In every recorder, `--base-url` means the public Web origin and API calls use its `/api/v1` path. Cross-device access occurs only through the product handoff UI; no recorder imports or copies cookies:

```bash
.venv/bin/python tools/acceptance/formal_stack.py prepare \
  --run-dir .artifacts/acceptance/current \
  --private-state-dir .acceptance-private/current \
  --segment-private-state-dir .acceptance-private/current \
  --redis-url redis://127.0.0.1:6379/15 \
  --api-port 8000 --web-port 4173
.venv/bin/python tools/acceptance/formal_stack.py start \
  --private-state-dir .acceptance-private/current
.venv/bin/python tools/acceptance/formal_stack.py wait-ready \
  --run-dir .artifacts/acceptance/current \
  --private-state-dir .acceptance-private/current
.venv/bin/python tools/acceptance/record_operator_training.py \
  --base-url http://127.0.0.1:4173 \
  --protocol acceptance/five-cat-protocol.yaml \
  --run-dir .artifacts/acceptance/current \
  --private-state-dir .acceptance-private/current \
  --operator-id correction-operator-1
.venv/bin/python tools/acceptance/collect_run.py \
  --base-url http://127.0.0.1:4173 \
  --protocol acceptance/five-cat-protocol.yaml \
  --data-dir "$PINDOU_ACCEPTANCE_DATA_DIR" \
  --run-dir .artifacts/acceptance/current \
  --private-state-dir .acceptance-private/current \
  --operator-mode headed
```

Expected: the four structured automated audits (`input`, `handoff`, `recovery`, `retention`) plus the real frozen-perception audit exist and bind current commit/test/model hashes; the 300-second training record predates C01 correction. The launcher proves one clean DB/storage/Redis role shared by the four live processes. The collector runs cats sequentially and proves the SQLite stage queue/global lease are empty immediately before each accepted generation request. Each sample reaches an immutable approved asset or is recorded as failed; timelines include initial draft duration, regeneration counts/wait, correction duration and canonical hash. `creation-device-evidence.json` proves physical-mobile creation and exactly one accepted initial job; `handoff-evidence.json` proves the two real product claims, owner denial/continuity and final mobile ownership without cookie import. `pre-correction-layers.json` and `asset-quality.json` each contain one complete record per sample. `interaction-metrics.json` contains exactly 2 devices × 5 cats × 5 actions, each with 3 warmups, 30 real-rAF measurements, P95 and maximum; `export-checksums.json` contains actual decoded PNG/PDF validation and `export-preview-evidence.json` covers desktop before and mobile after the second claim. The collector never retries beyond one full and two local regenerations.

- [ ] **Step 13: Record the per-cat fixed-pose and five-action quality gates**

Run once with a trained operator after all five assets are approved:

```bash
.venv/bin/python tools/acceptance/record_pose_quality.py \
  --base-url http://127.0.0.1:4173 \
  --protocol acceptance/five-cat-protocol.yaml \
  --run-dir .artifacts/acceptance/current \
  --private-state-dir .acceptance-private/current \
  --operator-id pose-reviewer-1
.venv/bin/python tools/acceptance/record_action_quality.py \
  --base-url http://127.0.0.1:4173 \
  --protocol acceptance/five-cat-protocol.yaml \
  --run-dir .artifacts/acceptance/current \
  --private-state-dir .acceptance-private/current \
  --operator-id action-reviewer-1
```

Expected: exactly five pose rows and 25 sample/action rows; every automatic/visual pose and action boolean is true, each row binds the approved canonical hash and frozen evaluator/device manifest, and no screenshot/image is written.

- [ ] **Step 14: Record three blinded similarity reviews**

Run once for each reviewer:

```bash
.venv/bin/python tools/acceptance/record_similarity.py \
  --base-url http://127.0.0.1:4173 \
  --protocol acceptance/five-cat-protocol.yaml \
  --run-dir .artifacts/acceptance/current \
  --private-state-dir .acceptance-private/current \
  --data-dir "$PINDOU_ACCEPTANCE_DATA_DIR" \
  --reviewer-id reviewer-1
.venv/bin/python tools/acceptance/record_similarity.py \
  --base-url http://127.0.0.1:4173 \
  --protocol acceptance/five-cat-protocol.yaml \
  --run-dir .artifacts/acceptance/current \
  --private-state-dir .acceptance-private/current \
  --data-dir "$PINDOU_ACCEPTANCE_DATA_DIR" \
  --reviewer-id reviewer-2
.venv/bin/python tools/acceptance/record_similarity.py \
  --base-url http://127.0.0.1:4173 \
  --protocol acceptance/five-cat-protocol.yaml \
  --run-dir .artifacts/acceptance/current \
  --private-state-dir .acceptance-private/current \
  --data-dir "$PINDOU_ACCEPTANCE_DATA_DIR" \
  --reviewer-id reviewer-3
```

Expected: 15 score rows total, three per sample, all integers 1–5; each reviewer sees the three private references plus the final neutral role at nearest-neighbor 8× with the frozen 1/3/5 anchors, randomized anonymous role IDs and no threshold/provider information. `review-presentation.json` contains only hashes/config/timestamps.

- [ ] **Step 15: Stop, seal, and verify the formal five-cat run**

Run:

```bash
.venv/bin/python tools/acceptance/formal_stack.py stop \
  --run-dir .artifacts/acceptance/current \
  --private-state-dir .acceptance-private/current \
  --segment-private-state-dir .acceptance-private/current
.venv/bin/python tools/acceptance/verify_run.py \
  --protocol acceptance/five-cat-protocol.yaml \
  --run-dir .artifacts/acceptance/current \
  --write-report --seal
```

`stop` appends the source segment end time and sanitized process/Redis shutdown record, performs the stopped DB15 private-state scan, and writes a passing `secret-leak-audit.json` before hashing. `verify_run --seal` writes deterministic `summary.json`/`report.md`, then writes `seal.json` containing the run ID, producer commit SHA, protocol checksum and a sorted hash manifest of every evidence file except `seal.json`. Once sealed, every tool opens the source run read-only and refuses to modify it. Expected for Phase 5 completion: exit 0, `failed_samples` is empty, `secret-leak-audit.json` reports zero matches and covers every handoff transition plus the actual formal logs/state, `summary.json` says `passed: true`, and `report.md` lists all raw timing/similarity/performance/export results plus frozen environment hashes. A non-zero exit is an evidence-backed product failure to investigate, not permission to change the recorded thresholds or discard the sample.

- [ ] **Step 16: Prepare, extend, and seal the ten-cat diagnostic report**

Reuse the sealed passing C01–C05 evidence and collect only C06–C10 under the unchanged schema/thresholds. `prepare_run` verifies the source `seal.json`, copies/references only its sealed evidence, and writes the source run ID/seal hash/start/end into the extension `environment.json`. It writes the actual formal-stack private-root pointer only to mode-0600 `.acceptance-private/ten-cat-extension/formal-stack-link.json`; no raw path enters artifacts. Resume uses the preserved SQLite/storage/session secret under `.acceptance-private/current/formal-stack`, starts a new extension process segment, and writes all new start/stop data only to the extension run. The source directory is never mutated. Every reused row carries `reusedFromRunId`; every new row carries the extension run ID. Timestamp validation uses the row's declared sealed segment and canonical/checksum equality proves reused rows are byte-identical. If any extension command fails, immediately run the shown extension-scoped `formal_stack.py stop` before investigating.

```bash
.venv/bin/python tools/acceptance/prepare_run.py \
  --protocol acceptance/ten-cat-extension-protocol.yaml \
  --data-dir "$PINDOU_ACCEPTANCE_DATA_DIR" \
  --reuse-run .artifacts/acceptance/current \
  --run-dir .artifacts/acceptance/ten-cat-extension \
  --private-state-dir .acceptance-private/ten-cat-extension \
  --formal-stack-private-state-dir .acceptance-private/current \
  --require-source-seal
.venv/bin/python tools/acceptance/formal_stack.py prepare \
  --resume \
  --run-dir .artifacts/acceptance/ten-cat-extension \
  --private-state-dir .acceptance-private/current \
  --segment-private-state-dir .acceptance-private/ten-cat-extension \
  --redis-url redis://127.0.0.1:6379/15 \
  --api-port 8000 --web-port 4173
.venv/bin/python tools/acceptance/formal_stack.py start \
  --private-state-dir .acceptance-private/current
.venv/bin/python tools/acceptance/formal_stack.py wait-ready \
  --run-dir .artifacts/acceptance/ten-cat-extension \
  --private-state-dir .acceptance-private/current
.venv/bin/python tools/acceptance/collect_perception_audit.py \
  --protocol acceptance/ten-cat-extension-protocol.yaml \
  --data-dir "$PINDOU_ACCEPTANCE_DATA_DIR" \
  --run-dir .artifacts/acceptance/ten-cat-extension \
  --record-missing-only
.venv/bin/python tools/acceptance/collect_run.py \
  --base-url http://127.0.0.1:4173 \
  --protocol acceptance/ten-cat-extension-protocol.yaml \
  --data-dir "$PINDOU_ACCEPTANCE_DATA_DIR" \
  --run-dir .artifacts/acceptance/ten-cat-extension \
  --formal-stack-private-state-dir .acceptance-private/current \
  --private-state-dir .acceptance-private/ten-cat-extension \
  --operator-mode headed \
  --collect-missing-only
.venv/bin/python tools/acceptance/record_pose_quality.py \
  --base-url http://127.0.0.1:4173 \
  --protocol acceptance/ten-cat-extension-protocol.yaml \
  --run-dir .artifacts/acceptance/ten-cat-extension \
  --formal-stack-private-state-dir .acceptance-private/current \
  --private-state-dir .acceptance-private/ten-cat-extension \
  --operator-id pose-reviewer-1 --record-missing-only
.venv/bin/python tools/acceptance/record_action_quality.py \
  --base-url http://127.0.0.1:4173 \
  --protocol acceptance/ten-cat-extension-protocol.yaml \
  --run-dir .artifacts/acceptance/ten-cat-extension \
  --formal-stack-private-state-dir .acceptance-private/current \
  --private-state-dir .acceptance-private/ten-cat-extension \
  --operator-id action-reviewer-1 --record-missing-only
.venv/bin/python tools/acceptance/record_similarity.py \
  --base-url http://127.0.0.1:4173 \
  --protocol acceptance/ten-cat-extension-protocol.yaml \
  --run-dir .artifacts/acceptance/ten-cat-extension \
  --formal-stack-private-state-dir .acceptance-private/current \
  --private-state-dir .acceptance-private/ten-cat-extension \
  --data-dir "$PINDOU_ACCEPTANCE_DATA_DIR" \
  --reviewer-id reviewer-1 --record-missing-only
.venv/bin/python tools/acceptance/record_similarity.py \
  --base-url http://127.0.0.1:4173 \
  --protocol acceptance/ten-cat-extension-protocol.yaml \
  --run-dir .artifacts/acceptance/ten-cat-extension \
  --formal-stack-private-state-dir .acceptance-private/current \
  --private-state-dir .acceptance-private/ten-cat-extension \
  --data-dir "$PINDOU_ACCEPTANCE_DATA_DIR" \
  --reviewer-id reviewer-2 --record-missing-only
.venv/bin/python tools/acceptance/record_similarity.py \
  --base-url http://127.0.0.1:4173 \
  --protocol acceptance/ten-cat-extension-protocol.yaml \
  --run-dir .artifacts/acceptance/ten-cat-extension \
  --formal-stack-private-state-dir .acceptance-private/current \
  --private-state-dir .acceptance-private/ten-cat-extension \
  --data-dir "$PINDOU_ACCEPTANCE_DATA_DIR" \
  --reviewer-id reviewer-3 --record-missing-only
.venv/bin/python tools/acceptance/formal_stack.py stop \
  --run-dir .artifacts/acceptance/ten-cat-extension \
  --private-state-dir .acceptance-private/current \
  --segment-private-state-dir .acceptance-private/ten-cat-extension
.venv/bin/python tools/acceptance/verify_run.py \
  --protocol acceptance/ten-cat-extension-protocol.yaml \
  --run-dir .artifacts/acceptance/ten-cat-extension \
  --write-report --seal
```

Expected: the source seal still verifies byte-for-byte; `report.md` covers C01–C10, distinguishes reused/new evidence, lists every failed sample/metric and aggregate distributions, and contains no source/generated images. The extension stop time and its own passing private-state/token scan are recorded before its seal; reused source rows remain bound to the source segment's sealed `secret-leak-audit.json`. It is a required diagnostic deliverable but does not convert a failed five-cat gate into PASS.

---

## Final Verification

- [ ] **Run every automated check from a clean worktree**

```bash
RUN_REDIS_TESTS=1 PINDOU_REDIS_URL=redis://127.0.0.1:6379/15 make check
```

Expected: PASS with no skipped non-live/non-hardware tests; Redis-marked tests use the explicit DB 15 above, while the frozen-device performance gate runs separately in the formal five-cat protocol.

- [ ] **Run a clean Redis recovery audit**

```bash
RUN_REDIS_TESTS=1 PINDOU_REDIS_URL=redis://127.0.0.1:6379/15 \
  .venv/bin/python -m pytest \
  apps/api/tests/integration/jobs/test_crash_idempotency.py \
  apps/api/tests/integration/jobs/test_rq_reconciliation.py \
  apps/api/tests/integration/jobs/test_generation_lease.py \
  apps/api/tests/integration/jobs/test_explanation_deadline.py \
  -q
```

Expected: PASS; each named crash point converges to one Provider job, one result checkpoint and one terminal checkpoint; Provider-backed and local stages cross the 599/600-second boundary into a visible safe state without duplicate submission.

- [ ] **Run the deletion audit with a fake clock**

```bash
.venv/bin/python -m pytest \
  apps/api/tests/unit/projects/test_retention_policy.py \
  apps/api/tests/integration/projects/test_tombstone_deletion.py \
  apps/api/tests/integration/projects/test_late_provider_result.py \
  apps/api/tests/integration/projects/test_janitor_cli.py \
  apps/api/tests/unit/projects/test_janitor_scheduler.py -q
```

Expected: PASS; every TTL, late-result and failed-physical-delete scenario remains inaccessible after expiration, and the anchored healthy-service schedule proves physical deletion lag at most 3600 seconds.

- [ ] **Verify the five-cat evidence package one final time**

```bash
.venv/bin/python tools/acceptance/verify_run.py \
  --protocol acceptance/five-cat-protocol.yaml \
  --run-dir .artifacts/acceptance/current \
  --check-seal
```

Expected: exit 0 and five individually passing samples. Phase 5 is not complete if this command exits non-zero, even when all synthetic tests pass.

- [ ] **Verify the required ten-cat extension report one final time**

```bash
.venv/bin/python tools/acceptance/verify_run.py \
  --protocol acceptance/ten-cat-extension-protocol.yaml \
  --run-dir .artifacts/acceptance/ten-cat-extension \
  --check-seal
```

Expected: structural exit 0, every C01–C10 sample has either complete gate evidence or a valid dependency-scoped terminal failure record, and diagnostic failures remain listed in both `sample-failures.json` and `report.md`; the formal five-cat PASS remains separately visible. `--check-seal` is byte-compare-only and refuses to rewrite sealed reports.

## Stop Rules

- Stop if the configured Provider cannot return the same job by `idempotency_key`; do not add automatic duplicate-submission compensation.
- Stop if any retry path can submit before checking both the project tombstone and Provider lookup.
- Stop if clearing Redis loses a SQLite-durable non-terminal stage after one 30-second reconciliation interval.
- Stop if a physical delete failure restores API access or if a late Provider result can recreate a deleted file/reference.
- Stop if evidence collection writes original images into `.artifacts`, logs, Redis, reports or Git.
- Stop if one of C01–C05 fails any formal gate; report the exact sample and metric rather than averaging it away.
- Reassess architecture before supporting more than one concurrent generation, public operation, cross-device accounts or backups; these are outside this plan.
