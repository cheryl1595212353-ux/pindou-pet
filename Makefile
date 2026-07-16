UV := uv
PY := .venv/bin/python
export PYTHONPATH := $(CURDIR)/apps/api/src

.PHONY: install test test-nonredis redis-smoke lint typecheck build contracts contracts-check check

install:
	$(UV) sync --frozen --extra dev
	pnpm install --frozen-lockfile

test:
	$(PY) -m pytest -q -m 'not live_provider'
	pnpm test

test-nonredis:
	$(PY) -m pytest -q -m 'not redis and not live_provider'

redis-smoke:
	RUN_REDIS_TESTS=1 $(PY) -m pytest \
		apps/api/tests/infrastructure/test_redis_connection.py -m redis -q

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
