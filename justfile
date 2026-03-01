# Limn development commands

# List available recipes
default:
    @just --list

# Install all dependencies
install:
    bun install

# Run all unit tests
test:
    bun run test

# Run tests with coverage
coverage:
    bun run test:coverage

# Run tests in watch mode
test-watch:
    bun run test:watch

# Run a specific test file (e.g., just test-file drag)
test-file name:
    bun run test -- --run 'packages/core/src/__tests__/{{name}}.test.ts'

# Run ESLint on all packages
lint:
    bun run lint

# Start the Vite dev server (skips if already running on :5173)
serve:
    @if lsof -i :5173 -sTCP:LISTEN >/dev/null 2>&1; then \
        echo "Dev server already running on port 5173"; \
    else \
        bun run dev 2>&1 | tee /tmp/limn-dev.log; \
    fi

# Production build
build:
    bun run build

# Run tests, lint, type-check, and build Obsidian plugin (CI check)
check: coverage lint typecheck obsidian-build

# Install pre-commit hook that runs `just check`
install-hooks:
    echo '#!/bin/sh\njust check' > .git/hooks/pre-commit
    chmod +x .git/hooks/pre-commit

# Type-check with TypeScript (builds core declarations, checks web)
typecheck:
    bunx tsc -b

# Build the Obsidian plugin (production)
obsidian-build:
    cd packages/obsidian && bun run build

# Build the Obsidian plugin in dev/watch mode
obsidian-dev:
    cd packages/obsidian && bun run dev

# Install plugin into an Obsidian vault via symlink
obsidian-install vault_path:
    just obsidian-build
    mkdir -p "{{vault_path}}/.obsidian/plugins"
    ln -sfn "$(pwd)/packages/obsidian/dist" "{{vault_path}}/.obsidian/plugins/obsidian-limn"
    @echo "Symlinked. Enable 'Limn' in Obsidian Settings -> Community plugins."

# Run obsidian package tests
obsidian-test:
    bun run test -- --run 'packages/obsidian/'

# Clean and reinstall node_modules (fixes esbuild EPIPE errors after bun add)
clean-install:
    rm -rf node_modules packages/core/node_modules packages/web/node_modules
    bun install
