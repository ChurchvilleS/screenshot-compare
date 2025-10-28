# Live Testing Plan

This plan provides end-to-end guidance for validating the Screenshot Comparison Tool against production-like URLs. It exercises core functionality, error paths, performance benchmarks, and browser variations to ensure the tool is reliable before wider rollout.

## Test Readiness Checklist

- [ ] Playwright browsers installed (`npm run setup`)
- [ ] API server accessible (local or deployed environment)
- [ ] UI build configured with correct API target (`VITE_API_TARGET`)
- [ ] Baseline configuration files (`config/*.json`) reviewed for current environments/paths
- [ ] Storage budget agreed upon for screenshots and diff artifacts

---

## Functional Test Suites

### 1. Basic Functionality

| Test ID | Description | Steps | Expected Result |
| ------- | ----------- | ----- | --------------- |
| F-01 | Capture and compare default landing page | Run `npm run validate:live` or submit `https://www.mozilla.org` vs `https://www.wikipedia.org` via UI | Job completes with diff report, normalization metadata noted if dimensions differ |
| F-02 | Multi-path comparison | Trigger CLI/UI job with paths `/, /privacy, /mission` | Report contains entries for each path, history lists job with correct status |
| F-03 | Report accessibility | Open generated HTML report in browser | Report loads with reference/target/diff images and summary, no missing assets |
| F-04 | Artifact serving | Access `/artifacts/...` URL returned by API | Asset downloads successfully, HTTP 200 |

### 2. Edge Cases

| Test ID | Description | Steps | Expected Result |
| ------- | ----------- | ----- | --------------- |
| E-01 | Large page capture | Compare `https://www.bbc.com` vs `https://www.cnn.com` with `fullPage=true` | Capture completes within timeout (adjust as needed), memory usage stable |
| E-02 | Slow-loading site | Compare `https://www.nytimes.com` vs `https://www.latimes.com` with `waitUntil=networkidle`, `timeout=60000` | Job completes without Playwright timeout; warnings logged if retries needed |
| E-03 | Authentication-protected page | Attempt capture on known auth-gated URL | Error surfaced in history entry, user-facing message indicates auth requirement |
| E-04 | Missing target URL | Submit job with invalid target (e.g., `https://invalid.domain.test`) | Job transitions to error state, history shows failure reason, no crash |

### 3. Performance Benchmarks

Use `npm run validate:live` or run comparisons via automated script harness.

| Metric | Target | Notes |
| ------ | ------ | ----- |
| Total runtime | < 10 minutes for 3 paths | Investigate paths exceeding target; consider reducing full-page captures or increasing Compute |
| Memory delta | < 500 MB per run | Monitor via script output; if exceeded, evaluate concurrency or paging |
| Disk growth | < 250 MB per run | Enforce retention or compression if artifacts exceed budget |
| Screenshot cache | Validate cleanup strategy | Confirm temporary directories are purged after job completion |

### 4. Cross-Browser Compatibility

| Test ID | Browser | Steps | Expected Result |
| ------- | ------- | ----- | --------------- |
| CB-01 | Chromium | Default Playwright runs | Baseline comparison succeeds |
| CB-02 | Firefox | Run `PLAYWRIGHT_BROWSERS=firefox` (or configure service) | Capture and diff succeed; note rendering differences |
| CB-03 | WebKit | Run `PLAYWRIGHT_BROWSERS=webkit` | Capture completes; watch for unsupported features |

Note: If cross-browser runs are optional for MVP, document the decision and plan follow-ups later.

---

## Test Matrix

| Scenario | Reference URL | Target URL | Paths | Browser(s) | Notes |
| -------- | ------------- | ---------- | ----- | ---------- | ----- |
| Smoke | https://www.mozilla.org | https://www.wikipedia.org | `/`, `/foundation`, `/privacy` | Chromium | Default live validation |
| News Sites | https://www.bbc.com | https://www.cnn.com | `/`, `/world`, `/technology` | Chromium, Firefox | Large pages, heavy media |
| Documentation | https://developer.mozilla.org | https://docs.github.com | `/`, `/en-US/docs/Web/JavaScript`, `/en` | Chromium | Long scroll pages |
| Ecommerce | https://www.apple.com | https://www.samsung.com | `/`, `/smartphones`, `/shop` | Chromium (full-page) | High-resolution imagery |
| Accessibility | https://www.wikipedia.org | https://www.wiktionary.org | `/`, `/wiki/Accessibility` | Chromium | Validate normalization summary |

Record results for each scenario including success/failure, runtime, memory/disk metrics, and notable differences in diff reports.

---

## Validation Criteria

- Jobs transition from `pending` to `success` or `error` with meaningful messages.
- Generated reports list expected number of comparisons and embed assets correctly.
- Normalization metadata is present when dimensions differ (strategy reported).
- API history endpoint reflects pagination and manual refresh results.
- Disk usage growth remains within operational targets after test runs.
- UI displays alerts and validation messages appropriately when errors occur.

---

## Troubleshooting Guide

| Symptom | Likely Cause | Resolution |
| ------- | ------------ | ---------- |
| Playwright timeout | Slow page load, blocked resources | Increase `timeout`, use `waitUntil=networkidle`, review network policies |
| ENOENT errors for artifacts | Disk cleanup removed required files, incorrect output path | Verify `config.outputDir`, ensure retention policy avoids active runs |
| API 404 for `/api/comparisons` | API server offline or misconfigured proxy | Check API logs, confirm `API_TARGET` and reverse proxy rules |
| High disk growth | Reports not pruned, large diff images | Implement retention script, compress artifacts, move to external storage |
| Memory leak warnings | Excessive concurrent captures | Reduce concurrency, run captures sequentially, monitor worker restarts |

---

## Reporting

- Capture console output from `npm run validate:live`.
- Archive diff reports and history JSON for audit trail.
- Log metrics into shared dashboard or spreadsheet for comparison across runs.
- Document anomalies with screenshots and associated metadata (timestamp, path, environment).
