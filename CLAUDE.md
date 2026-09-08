# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

App Store Connect MCP Server — an MCP (Model Context Protocol) server that exposes 30+ tools for managing iOS app releases, TestFlight, screenshots, review submissions, and reports via the App Store Connect API.

## Commands

```bash
npm run build          # TypeScript → dist/ (tsc)
npm run dev            # Run with tsx (development)
npm start              # Run compiled dist/index.js
npm test               # Run all tests (vitest run)
npm run test:watch     # Watch mode
npx vitest run src/__tests__/tools-review.test.ts   # Single test file
```

## Architecture

**Entry point:** `src/index.ts` — registers all MCP tools via `server.tool()`, each with Zod schema validation and standardized error handling.

**Core layers:**
- `src/auth.ts` — JWT generation (ES256) with 20-min tokens, cached with 60s buffer. Requires 3 env vars: `APP_STORE_CONNECT_KEY_ID`, `APP_STORE_CONNECT_ISSUER_ID`, `APP_STORE_CONNECT_P8_PATH`.
- `src/client.ts` — HTTP client wrapping fetch for ASC API. Functions: `ascGet`, `ascPost`, `ascPatch`, `ascDelete`, `ascUploadChunk`, `ascGetReport`, `ascGetAll` (paginated, max 20 pages). Parses JSON:API responses and throws `ASCClientError`.
- `src/constants.ts` — Project locales (`en-US`, `tr`, `de-DE`, `es-MX`, `fr-FR`, `ru`, `ar-SA`), timeouts, pagination limits.

**Tool modules** (`src/tools/`):
- `apps.ts` — App listing, info, localization updates
- `versions.ts` — Version lifecycle (create, update What's New, assign builds, delete)
- `builds.ts` — Build listing, TestFlight beta groups, encryption compliance
- `review.ts` — Submission with 8 pre-flight checks, withdrawal, rejection reasons
- `screenshots.ts` — 3-step upload (reserve → chunk upload → commit), delete
- `reports.ts` — Sales/financial reports with gzip decompression and TSV parsing

## Key Patterns

- **Tool registration:** Each tool in `src/index.ts` follows the pattern: Zod schema → call tool function → return markdown text → catch `ASCClientError` with actionable help.
- **JSON:API handling:** ASC API returns `data` + `included` arrays. Tool functions map included resources by ID into lookup dictionaries for relationship resolution.
- **All tools return formatted markdown** with tables, status indicators (✓/✗), and warning sections.
- **ESM project** (`"type": "module"` in package.json, `Node16` module resolution).

## Testing

Tests in `src/__tests__/` use Vitest. They mock `global.fetch` and the auth module — no real API calls. Test files mirror tool modules (e.g., `tools-review.test.ts` tests `src/tools/review.ts`).

## Screenshots: prefer the batch tool

Replacing a store's screenshots is inherently a bulk job — one set per locale,
several images per set. `asc_upload_screenshot` handles a single image into a
known set, so driving a full refresh through it costs
`locales x (1 lookup + 1 clear + N uploads)` round trips; a real 7-locale x
9-image refresh came to seventy calls and ended up being scripted outside this
server instead of driven through it.

`asc_upload_screenshots_batch` is the entry point for anything multi-image or
multi-locale. It also folds in the two steps that always accompany the upload:
resolving the display type's set (creating it when a locale has none) and
clearing what is already there. Every file is validated and read before the
first upload, so a bad path in the last locale cannot leave earlier ones
emptied.

## Releases

Releases are automatic. `semantic-release` runs on every push to `main`,
reads the commits since the last release, and decides from them whether to
publish a patch, a minor, a major — or nothing. There is no version to bump:
`package.json` reads `0.0.0-development`, and the real version is written at
release time, because a number checked into the repository could only ever
be a stale copy of the released one.

This makes the commit message load-bearing:

- `fix:` → patch
- `feat:` → minor
- `!` after the type, or a `BREAKING CHANGE:` footer → major
- `docs:` `chore:` `ci:` `test:` `refactor:` → no release

A message that does not parse does not fail loudly — it silently contributes
nothing to the next release, and if every commit in a push is unparseable no
release happens and nobody is told why. The `commit-messages` job checks this
on pull requests so it surfaces there instead.

`main` is protected: no direct pushes, and the checks must pass before a
merge. Work goes through a branch and a pull request.

Do not add a workflow that publishes on a `v*` tag. semantic-release creates
those tags itself, so such a workflow publishes each version twice and the
second attempt fails with "You cannot publish over the previously published
versions".
