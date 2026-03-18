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
