# MindForge development commands

# List available recipes
default:
    @just --list

# Install all dependencies
install:
    bun install

# Run all unit tests
test:
    bun run test

# Run tests in watch mode
test-watch:
    bun run test:watch

# Run a specific test file (e.g., just test-file drag)
test-file name:
    bun run test -- --run 'packages/core/src/__tests__/{{name}}.test.ts'

# Run ESLint on all packages
lint:
    bun run lint

# Start the Vite dev server
start:
    bun run dev

# Production build
build:
    bun run build

# Run tests, lint, and type-check (CI check)
check: test lint typecheck

# Install pre-commit hook that runs `just check`
install-hooks:
    echo '#!/bin/sh\njust check' > .git/hooks/pre-commit
    chmod +x .git/hooks/pre-commit

# Type-check with TypeScript (builds core declarations, checks web)
typecheck:
    bunx tsc -b
