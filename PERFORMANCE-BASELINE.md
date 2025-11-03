# Performance Baseline Report

- Captured: 2025-11-03T23:54:43.881Z
- Commit: 88488a2996ce39a93d1a6b91c8269c9e763258d9
- Node.js: v19.4.0
- OS: win32 10.0.26100 (x64)
- CPU: Intel(R) Core(TM) i7-8850H CPU @ 2.60GHz
- Iterations per case: 5

## Aggregate Summary

| Metric | Value |
| --- | --- |
| Average total time (ms) | 124.44 |
| Peak total time (ms) | 253.73 |
| Peak RSS (MB) | 138.96 |
| Peak Heap (MB) | 23.7 |
| Slowest case | large-diff-heavy |

## Case Metrics

| Case | Dimensions | Avg Total (ms) | Avg Load (ms) | Avg Normalize (ms) | Avg Diff (ms) | Time/Pixel (ns) | Change Ratio (%) | Peak RSS (MB) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| mobile-minimal-diff | 375×667 | 53.03 | 35.31 | 0 | 17.66 | 212.01 | 3.25 | 84.14 |
| tablet-layout-shift | 768×1024 | 90.45 | 63.44 | 0 | 26.99 | 115.02 | 7.12 | 91.25 |
| desktop-content-change | 1280×720 | 103.33 | 68.37 | 0 | 34.93 | 112.12 | 77.73 | 96.52 |
| desktop-complex-page | 1440×900 | 140.14 | 95.87 | 0 | 44.23 | 108.13 | 13.58 | 112.01 |
| large-diff-heavy | 1920×1080 | 235.26 | 149.55 | 0 | 85.64 | 113.45 | 71.49 | 138.96 |

## Comparison Guidance

1. Run `node --expose-gc scripts/capture-performance-baseline.js` to generate a fresh report.
2. Compare new `performance-baseline.json` metrics against the values above.
3. Flag regressions where total time exceeds the recorded peak by more than 20%.
4. If updating the baseline is required, obtain a review comment containing `BASELINE-UPDATE-APPROVED`.
