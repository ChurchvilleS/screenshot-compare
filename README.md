# Screenshot Comparison Tool

A Playwright-driven CLI that captures paired screenshots, runs pixel-level comparisons, and emits shareable HTML diff reports for visual QA.

## Node Version Requirements
- Use Node.js 20.x (recommended) or any active 18.x release to satisfy build tooling like Vite.
- `.nvmrc` pins the workspace default; run `nvm use` (or align your version manager accordingly) before installing dependencies.
- Older Node versions may install with warnings or fail when running Vite or Jest.

## Dynamic Report Naming
- Each comparison run now produces an HTML report whose filename encodes the reference and target identifiers plus a timestamp, for example `comparison-report_staging-production_10-27-25_14-22pm.html`.
- The files live in the configured diff directory (default `screenshots/diff`). Running the workflow multiple times creates a unique report for each run instead of overwriting a static name.

## Finding the Latest Report
- The helper script `node scripts/validate-comparison.js` now locates the most recent report that matches the default pattern `comparison-report*.html` (or a custom pattern such as `cli-report*.html`).
- Reuse the exported `findMostRecentReport` utility in `scripts/validate-comparison.js` if you need programmatic access inside other tooling.

## CLI Quick Start
1. Install dependencies: `npm install`
2. Verify browsers (first run): `node src/index.js setup`
3. Capture and compare immediately: `node src/index.js capture <sourceUrl> <targetUrl> --compare`
4. Compare by environment key: `node src/index.js compare staging production`
5. After either command, open the printed report path or run `node scripts/validate-comparison.js` to list the freshest artifact.

See `docs/WORKFLOW-GUIDE.md` for detailed prompts and `docs/users-guide.md` for a non-technical walkthrough.

## Performance Baselines
- Run `node --expose-gc scripts/capture-performance-baseline.js` from a clean worktree to generate `performance-baseline.json` and `PERFORMANCE-BASELINE.md`.
- The script captures execution time, memory usage, and per-step metrics across representative test cases, tagging each run with the active git commit.
- Update the baseline only when intentional algorithmic or infrastructure changes materially affect performance. Obtain a code review that includes the phrase `BASELINE-UPDATE-APPROVED` before merging baseline changes.
- Current baseline commit: `88488a2996ce39a93d1a6b91c8269c9e763258d9`.
- Review the latest human-readable report at [`PERFORMANCE-BASELINE.md`](./PERFORMANCE-BASELINE.md) and consult `performance-baseline.json` for machine-readable comparisons.
