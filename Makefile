UV := uv
PY := .venv/bin/python
export PYTHONPATH := $(CURDIR)/apps/api/src

.PHONY: install test lint typecheck build contracts contracts-check check

install:
	$(UV) sync --frozen --extra dev
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
