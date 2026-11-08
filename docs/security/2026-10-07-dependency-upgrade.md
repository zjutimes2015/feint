# Dependency upgrade record — 2026-10-07

This records the dependency upgrade performed on this date, including targeted
overrides and an unresolved development-tool advisory. The production audit
reported no advisories; the full audit retained one high-severity advisory.
Lint, type checking, 195 unit tests, 24 local E2E tests, the production build
and production smoke test passed. No website runtime path to the affected
parser was identified during this review.

Run `pnpm audit --prod` for the production dependency graph and `pnpm audit`
for the complete graph. An audit result is a dated snapshot, not a guarantee
that dependencies have no vulnerabilities. Validate updates with `pnpm check`,
local E2E against an isolated database, and `pnpm e2e:production`.

Keep `next`, `@next/env`, and `@next/third-parties` on the same exact version.

## Targeted overrides

- `@esbuild-kit/core-utils>esbuild` uses `0.25.12` to avoid
  [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99).
  The parent still requests the affected `0.18` series. Recheck migration and
  TypeScript loader compatibility when changing or removing this override.
- `fast-uri@3.1.4` uses `3.1.8` to cover the URI parser advisories affecting the
  version pinned by the React Email CLI's AJV dependency. Remove this override
  when the parent resolves a patched version without it.

## Remaining development-tool advisory

On October 7, 2026, `shadcn` still depends on `braces@3.0.3` through
`fast-glob` / `micromatch`. [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
has no published patched version. Deeply nested untrusted brace patterns can
exhaust the stack. Do not pass untrusted patterns to the component-generation
CLI. Recheck the upstream dependency graph and advisory before updating it.

`shadcn` is a development dependency: this application imports its static
`tailwind.css` during compilation, not its CLI or glob parser at runtime.
Build environments still install development dependencies, so this does not
remove the tooling risk or make a full audit clean.
