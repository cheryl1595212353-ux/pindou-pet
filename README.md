# 拼豆宠物 Web MVP

本仓库实现“三张猫照片 → 可校正的 2.5D 拼豆角色 → 五动作互动 → 实体拼豆图纸导出”的 Web MVP。

当前实施阶段是 Phase 0：只建立前后端骨架、存储、队列和接口合同，不连接真实 AI，也不提供上传、生成、编辑或导出业务功能。

## 固定运行时

- uv 0.11.29
- Python 3.12
- Node.js 24 LTS
- pnpm 11.9.0

## 首次安装

以下步骤是干净检出的基准流程，不依赖机器里已有的 Python 包、Node 包或浏览器缓存：

```bash
uv python install 3.12
uv sync --frozen --extra dev
corepack enable
pnpm install --frozen-lockfile
pnpm --filter @pindou/web exec playwright install chromium
mkdir -p var
PINDOU_DATABASE_URL=sqlite:///var/pindou.db .venv/bin/python -m alembic upgrade head
```

从模板创建本地配置，并至少替换会话密钥：

```bash
cp .env.example .env
```

## 本地启动

先启动 API：

```bash
PYTHONPATH=apps/api/src .venv/bin/python -m uvicorn \
  pindou_pet.main:create_app --factory --host 127.0.0.1 --port 8000
```

再在另一个终端启动 Web：

```bash
PINDOU_API_ORIGIN=http://127.0.0.1:8000 \
  pnpm --filter @pindou/web dev --host 127.0.0.1
```

浏览器打开 `http://127.0.0.1:5173`。浏览器只访问 Web origin；Vite 把 `/api` 反向代理到 FastAPI。

## Redis 真实依赖

队列合同测试使用内存 fake，但集成 smoke 必须连接 Redis 7，不会静默回退到 fake。可用 Docker 启动本地实例：

```bash
docker run --rm --name pindou-redis \
  -p 127.0.0.1:6379:6379 redis:7-alpine
```

Redis 启动后执行：

```bash
RUN_REDIS_TESTS=1 PINDOU_REDIS_URL=redis://127.0.0.1:6379/15 \
  .venv/bin/python -m pytest \
  apps/api/tests/infrastructure/test_redis_connection.py -m redis -q
```

未设置 `RUN_REDIS_TESTS=1` 时该测试明确显示 skipped。本地没有 Redis 时，只运行非 Redis 套件：

```bash
make test-nonredis
```

## 统一验证

```bash
make check
```

`make contracts-check` 会拒绝 OpenAPI 快照或生成 TypeScript 未同步的改动。CI 还会启动真实 Redis、升级空 SQLite 数据库到 migration head，并执行同一套 `make check`。

## 私有数据边界与实施门禁

- 私有图片和运行数据只写入被 Git 忽略的 `var/`；本地密钥只写入 `.env`，不得提交到仓库。
- 图片字节不进入 Redis、JSON 或日志；队列载荷只允许阶段任务 UUID。
- Phase 0 不调用真实 AI Provider，也不上传照片到第三方。
- Phase 1 的三猫 Provider 可行性门通过前，不继续实现上传、完整生成、精细编辑、互动或导出页面。
- 后续高清图层和逐豆编辑器只支持宽度至少 1280px 的桌面浏览器；创建页、互动房间和导出预览保留移动端边界。
