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
dev:
    bun run dev

# Production build
build:
    bun run build

# Run tests and lint (CI check)
check: test lint

# Type-check with TypeScript (note: some strict errors may exist)
typecheck:
    bunx tsc -b --noEmit
