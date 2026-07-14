.PHONY: install gen build test lint fmt typecheck ci

install:
	npm ci

# Regenerate the typed API client from the vendored OpenAPI schema.
# To re-vendor the schema from a conduit checkout, copy its
# proto/api/v1/api.swagger.json to src/api/api.swagger.json and record the
# source ref in SCHEMA_VERSION, then run `make gen`.
gen:
	npm run gen:api

typecheck:
	npm run typecheck

lint:
	npm run lint

fmt:
	npm run format

test:
	npm run test

build:
	npm run build

ci: typecheck lint test build
