# 拼豆宠物 Web MVP

本仓库实现“三张猫照片 → 可校正的 2.5D 拼豆角色 → 五动作互动 → 实体拼豆图纸导出”的 Web MVP。

当前实施阶段是 Phase 0：只建立前后端骨架、存储、队列和接口合同，不连接真实 AI，也不提供上传、生成、编辑或导出业务功能。

## 固定运行时

- uv 0.11.29
- Python 3.12
- Node.js 24 LTS
- pnpm 11.9.0

## 首次安装

```bash
uv python install 3.12
uv sync --frozen --extra dev
corepack enable
pnpm install --frozen-lockfile
```

私有运行数据只写入被 Git 忽略的 `var/`。本地密钥只写入 `.env`，不得提交到仓库。

## 统一验证

```bash
make check
```

Phase 1 的真实 Provider 可行性门禁通过前，不实现完整业务页面。
