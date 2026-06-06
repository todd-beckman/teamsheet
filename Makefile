# Teamsheet — Vite-based dev/build/serve (mirrors ../playgroundgl).
# Bare `make` runs the dev server (serves src/index.html with HMR rebuild).

.PHONY: dev build preview test

dev:
	npm run dev

build:
	npm run build

preview:
	npm run preview

test:
	npm test
