# UI API Integration Guide

The React UI communicates with a lightweight REST surface that exposes comparison jobs. This guide explains the required endpoints, payloads, and conventions so future changes remain compatible.

## Base URL
- All requests are made relative to the UI origin (for example `http://127.0.0.1:5173`).
- During development, configure a proxy or ensure your backend serves the `/api` namespace alongside the UI assets.

## Endpoints

### `POST /api/comparisons`
Queues a new comparison between two base URLs.

**Request body**
```json
{
  "reference": {
    "baseUrl": "https://staging.example.com"
  },
  "target": {
    "baseUrl": "https://www.example.com"
  },
  "comparison": {
    "normalizeStrategy": "crop"
  }
}
```

**Expected behaviour**
- Returns HTTP 202 or 200 when the job is accepted.
- The UI treats 4xx/5xx responses as errors and surfaces the `message` field when available.

**Successful response payload**
```json
{
  "comparisonId": "cmp-1234",
  "reportPath": "/reports/comparison-report_cmp-1234.html",
  "changeSummary": "2% change"
}
```

**Error response payload** (example)
```json
{
  "message": "Target environment is unavailable"
}
```

### `GET /api/comparisons`
Retrieves paginated history entries, ordered from newest to oldest.

**Query parameters**
- `page` (number, 1-indexed, default `1`)
- `limit` (number, default `5`)

**Successful response payload**
```json
{
  "items": [
    {
      "id": "cmp-1234",
      "title": "https://staging.example.com → https://www.example.com",
      "status": "success",
      "createdAt": "2025-10-27T15:42:00.000Z",
      "diffPercent": "2% change",
      "href": "/reports/comparison-report_cmp-1234.html",
      "normalizationSummary": "Cropped to shared dimensions 1280x720"
    }
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 3
  }
}
```

**Status field semantics**
- `pending`: job queued or in progress. UI polls every 5 seconds while pending entries exist.
- `success`: job completed successfully. `href` should point to a viewable report.
- `error`: job failed. Provide `errorMessage` to explain the failure.
- When dimensions differ, the backend applies the configured normalization strategy (default `crop`) and surfaces a `normalizationSummary` so the UI can message what happened.

**Failure handling**
- Return a JSON body with a `message` field to inform the UI. The message is bubbled into a dismissible alert.

## Client assumptions
- Duplicate submissions are throttled on the client for 10 seconds, but the API should still validate for idempotency.
- History responses should be stable between requests; pagination is reset to page 1 after a successful submission.
- Timestamps are displayed using the browser's locale. Always return ISO 8601 strings in UTC.

## Extending the API
- Add new item fields behind optional chaining to avoid breaking existing clients.
- When introducing filters or search, prefer additive query parameters so older versions keep working.
- Document any authentication requirements in this file and ensure the UI redirects to your login flow if needed.
