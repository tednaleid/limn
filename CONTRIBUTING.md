# Contributing to Limn

Thanks for your interest in Limn. This document is a quick orientation for anyone
filing an issue, opening a pull request, or hacking on the codebase locally. For a
deeper overview of the architecture and stack, read [ONBOARDING.md](./ONBOARDING.md)
first.

## Reporting bugs and requesting features

Open an issue at <https://github.com/tednaleid/limn/issues>. Useful details:

- Which Limn build you hit it on: web (`tednaleid.github.io/limn`), Obsidian plugin
  (include Obsidian version), or macOS desktop (include version from About menu).
- A `.limn` file that reproduces the problem when possible. Limn files are ZIPs;
  feel free to drop them in the issue directly.
- Steps, expected behaviour, actual behaviour. Screenshots help a lot for
  rendering, layout, and keyboard-handling issues.

For security issues, please email <contact@naleid.com> rather than filing a public
issue.

## Development setup

```
git clone https://github.com/tednaleid/limn.git
cd limn
just install
just serve
```

Opens the web app at <http://localhost:5173/limn/>. For the Obsidian plugin or
macOS desktop builds, see [OBSIDIAN-PLUGIN.md](./OBSIDIAN-PLUGIN.md) and
[DESKTOP-APP.md](./DESKTOP-APP.md).

All tooling is driven through `just`. The most useful recipes:

- `just check` -- full CI gate (coverage + lint + typecheck + Obsidian plugin build)
- `just test` -- unit tests via vitest
- `just test-file <name>` -- run a single test file
- `just lint` -- ESLint
- `just fmt` -- ESLint with autofix
- `just typecheck` -- `tsc -b`

`just check` is what the pre-commit hook runs. Get it green before pushing.

## Branching and pull requests

- Open PRs against `main`.
- Keep changes focused. A bug fix and an unrelated refactor should be two PRs.
- Match the style of surrounding code; we don't have a separate style guide
  beyond what ESLint enforces.
- Tests are expected for new behaviour. We follow a red/green workflow: write
  the failing test first, then make it pass. See [TESTING.md](./TESTING.md) for
  the testing philosophy.
- Commits should be self-contained; pre-commit hooks run `just check` and will
  block commits that fail. Don't use `--no-verify`.

## Architectural invariants

A few rules the codebase relies on -- worth knowing before sending a PR that
touches state, persistence, or rendering:

- **Editor is the sole source of truth.** All document mutations go through
  `Editor` methods. The DOM renders from `Editor` state and never writes back.
- **`packages/core` has zero browser dependencies.** Nothing in `core` may
  import React, DOM APIs, or browser globals. Use the `TextMeasurer` interface
  for any layout work that needs text dimensions.
- **Undo is diff-based and document-only.** Camera and selection are session
  state, not undo state.
- **`.limn` files are ZIPs.** A `.limn` file contains `data.json` and an
  `assets/` directory. The file format is versioned; breaking changes need a
  migration in `packages/core/src/serialization/migration.ts` and a golden
  fixture update.

Changes to the file format (`schema.ts`, serialization behaviour, file shape)
should be discussed in an issue or draft PR before implementation. Architecture
decisions live in [adr/](./adr/).

## License

Limn is released under the MIT License. By contributing, you agree that your
contributions will be licensed under the same terms.
