# Next Steps: HTML UI Plan

## Goal
Introduce a lightweight HTML interface that allows teams to trigger captures, run comparisons, and browse reports without using the command line.

## Progress Snapshot (2025-10-28)
- React/Vite UI implemented with accessibility and responsive refinements.
- Form validation, pagination, optimistic updates, and duplicate submission protection in place.
- Jest component coverage added for validation and pagination; Playwright smoke test validates the happy path with mocked APIs.
- User documentation refreshed with UI walkthrough and API contract notes.
- Express API server now wraps `ComparisonService.compareBatch`, persists job metadata to `data/jobs.json`, serves artifacts, and passes `/healthz` checks.
- Vite dev server proxies `/api` and `/artifacts` to the Express backend using env-configured host/port (default `http://localhost:5001`), confirmed working by starting the API with `npm run api:start` and submitting requests through the live UI.
- Cropping-based normalization automatically aligns mismatched screenshot dimensions (`comparison.normalizeStrategy = "crop"`), preventing cross-domain jobs from failing.
- Coverage recovery underway with extended normalization tests, positioning thresholds to rise from 22% toward the 28% target.
- React Testing Library suite now exercises App.jsx form validation, duplicate submission guardrails, pagination, normalization messaging, and error handling to back the coverage plan.
- First coverage milestone complete: Jest thresholds raised to 28% with suites passing under the new bar.
- Live URL validation script benchmarks Mozilla vs Wikipedia comparisons and records timing, memory, and storage metrics.
- Initial API configuration module now surfaces host/port/target from environment variables for future deployment wiring.
- UI now respects API configuration, enabling environment-specific targets without code changes.
- Deployment guide documents local, reverse-proxy, and direct hosting workflows with environment examples.
- Git repository initialized after completing .gitignore hardening and secrets audit (ready for initial commit preparation).
- Repository status reviewed to catalog files for the inaugural commit.
- Project files staged for the initial commit snapshot.
- Initial commit created capturing the full MVP baseline.
- GitHub repository creation steps documented for publishing workflow.
- Origin remote configured and initial commit pushed to `ChurchvilleS/screenshot-compare`.
- Branch protection rules drafted for the default branch to enforce PR-based changes.
- Repository synchronized with `origin/master`; review deleted/modified docs and merge PR `copilot/review-docs-and-code` if desired.

## Current Challenges
- Operationalize the live validation workflow (schedule runs, alert on regressions) while monitoring Playwright session duration and storage growth trends.
- Node version mismatch warnings resolved by pinning engines (`>=20 || ^18`) and adding `.nvmrc` guidance.
- Define production-ready configuration for the API base URL (env variables, reverse proxy) so the UI and server stay aligned outside local development.
- Execute staged coverage recovery plan (raise Jest thresholds 22% → 28% → 34% → 40% as suites land) focusing on API handlers, normalization flows, UI components, and service scripts.
- Implement the branch protection settings in GitHub, invite collaborators, and plan deployment/testing automation for the hosted repository.

## Milestones
1. **Requirements Gathering**
   - Interview target users to map critical workflows (capture vs compare vs report review)
   - Define authentication needs (local auth, CI tokens, or reuse existing SSO)
   - Capture accessibility and browser support requirements

2. **Design & Prototyping**
   - Draft wireframes for dashboard, capture form, and comparison results view
   - Decide on UI stack (for example Vite + React or plain server-rendered HTML)
   - Validate navigation flow with stakeholders

3. **Backend API Surface**
   - ~~Extract existing CLI orchestration logic into reusable service functions~~ (already satisfied by `ScreenshotService` and `ComparisonService` abstractions)
   - Expose REST endpoints for:
     - Listing environments and paths *(pending)*
     - ~~Triggering capture/comparison jobs~~
     - ~~Fetching run history and report metadata~~
   - ~~Add job status persistence (lightweight JSON store or database)~~ (implemented via `data/jobs.json`)

4. **Frontend Implementation**
   - ~~Build dashboard showing recent runs and quick actions~~
   - ~~Implement forms for capture and comparison requests (with validation)~~
   - Embed HTML diff reports or link out to generated files (links available; inline embedding still optional)
   - ~~Provide progress indicators and error feedback~~

5. **Automation & Deployment**
   - Add automated tests for API endpoints and UI flows (UI layer covered; API tests pending once service exists)
   - ~~Integrate with existing validation scripts (reuse Playwright for UI smoke tests)~~ (covered by current Playwright validation harness)
   - Define deployment plan (static hosting vs Node server); include strategy for colocating API with UI or configuring proxy

6. **Documentation & Training**
   - Update `docs/users-guide.md` with UI instructions
   - Record a short walkthrough video or slide deck for onboarding
   - Gather feedback from pilot users and iterate

## Dependencies
- Existing CLI comparison logic and scripts
- Environment configuration in `config/environments.json`
- Playwright setup for browser automation

## Risks & Mitigations
- **Long-running jobs**: introduce job queue or background worker
- **Credential management**: integrate with secrets manager or require runtime environment variables
- **Report storage growth**: enforce retention policies or archival rules in UI settings

## Success Metrics
- Non-technical users can run comparisons without CLI access
- Average time from capture request to report review decreases by 50%
- Positive feedback from pilot group (target satisfaction score > 4/5)

## Recommended Priorities

### Usability
1. Deliver a lightweight “run history” view that lists recent reports using the new dynamic naming scheme, linking directly to HTML outputs stored under `screenshots/cv`. ✅
2. Provide a guided capture/comparison form with sensible defaults (pre-populated environments, path chooser fed by configuration) to reduce setup friction for non-technical users. (Form live; extend with environment presets.)
3. Implement inline status updates for long-running comparisons (e.g., optimistic progress rows fed by polling) so users are not left guessing during Playwright runs. ✅ Pending real API plumbing to observe actual status transitions.
4. Wire the UI to the Express `/api/comparisons` endpoint (proxy or env-based base URL) so manual testers exercise the live workflow without tweaks. ✅
5. Add environment-driven configuration for the API base when deploying beyond localhost.
6. Implement image dimension normalization (e.g., consistent viewport/full-page settings or post-processing) to make cross-domain comparisons resilient. ✅

### Maintainability
1. Introduce a thin REST controller layer that reuses existing service modules, keeping CLI, UI, and automation paths on the same orchestration code. ✅
2. Stand up the REST service locally (or via proxy) so UI, CLI, and automation share the same orchestration logic in practice. ✅ API listening on `localhost:5001` by default with env overrides; configure UI proxy/env to consume it automatically.
3. Persist job metadata in a durable store (SQLite or lightweight JSON queue) to avoid OneDrive contention and enable future retention policies. (JSON store live; evaluate long-term durability.)
4. Add integration tests that spin up the mock mode workflow end-to-end via the new endpoints, ensuring regressions in dynamic report naming or capture orchestration are caught early once the API is available.
5. Keep test infrastructure healthy (jsdom dependency installed; coverage thresholds temporarily lowered to 22%—restore to ≥40% once additional suites are added).
