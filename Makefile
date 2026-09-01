.PHONY: install up down migrate quality build

install:
	corepack enable
	pnpm install --frozen-lockfile

up:
	pnpm infra:up

down:
	pnpm infra:down

migrate:
	pnpm db:migrate:deploy

quality:
	pnpm quality

build:
	docker build -f apps/api/Dockerfile -t citari-api:local .
	docker build --build-arg NEXT_PUBLIC_API_BASE_URL=http://localhost:8000 -f apps/frontend/Dockerfile -t citari-frontend:local .
