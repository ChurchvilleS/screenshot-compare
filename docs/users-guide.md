# User Guide

This guide explains how to run the visual comparison tool without needing deep technical knowledge.

## 1. Prerequisites
- Install Node.js LTS (https://nodejs.org)
- Open a terminal and run `npm install` inside the project folder once
- Ensure you know the website addresses for the environments you want to compare (for example staging vs production)
- If your sites require passwords or tokens, ask an administrator for the required credentials and set them as environment variables before running the tool

## 2. Install Browser Support (first-time only)
1. Open a terminal in the project directory
2. Run `node src/index.js setup`
3. Wait for the message `Playwright browsers installed`

## 3. Launch the Web UI
The new web interface provides a guided way to queue comparisons and review recent runs.

1. Install dependencies if you have not already: `npm install`
2. Start the UI in a terminal: `npm run ui:dev`
   - The command serves the app at `http://127.0.0.1:5173` by default
3. Open the printed URL in your browser and complete the form:
   - Enter the reference URL (for example the staging site)
   - Enter the target URL (for example production)
   - Press **Submit** to queue the comparison
4. Watch the status banner for validation errors or success messages.
5. Scroll to **Recent Runs** to see queued and completed jobs. The list supports pagination, manual refresh, and direct links to generated reports.

> **Tip:** The UI blocks duplicate submissions for 10 seconds to avoid accidentally queueing the same comparison repeatedly. Fix any validation errors highlighted beneath each input before resubmitting.

> **Dimension Note:** When two pages render at different sizes the backend crops both screenshots to their shared viewport (default `crop` strategy) before diffing. If you need full-page coverage, configure a consistent viewport or adjust the normalization strategy in `config/*.json`.

## 4. Capture Screenshots (CLI)
Use this when you want fresh screenshots for two URLs (for example staging and production):
1. Run `node src/index.js capture <sourceUrl> <targetUrl>`
   - Example: `node src/index.js capture https://staging.example.com https://www.example.com`
2. Optional flags:
   - `--paths / /pricing /features` to capture multiple pages
   - `--viewports 1280x720@desktop,414x896@mobile` to capture desktop and mobile sizes
   - `--compare` to immediately create a difference report
3. After the command finishes, screenshots are saved under the `screenshots/` folder

## 5. Compare Environments by Name
If your environment URLs are stored in `config/environments.json`, you can compare by key names:
1. Confirm the required environment variables (for example `STAGING_BASE_URL`) are set
2. Run `node src/index.js compare <referenceEnv> <targetEnv>`
   - Example: `node src/index.js compare staging production`
3. When the command completes, note the summary printed in the terminal. A link to the HTML report is displayed with a unique name (for example `screenshots/regression/diff/comparison-report_staging-production_10-27-25_14-22pm.html`)

## 6. Review the HTML Report
1. Open the report path printed by the CLI in a web browser. Each filename encodes the environment identifiers and run timestamp so you can keep multiple runs side by side
2. Each section shows the reference screenshot, target screenshot, and the highlighted difference layer (if any)
3. Rows marked as “Significant change detected” deserve attention before release

### Need the Latest Report?
- Run `node scripts/validate-comparison.js` to generate a fresh comparison sample and confirm the most recent HTML report path using the new discovery helper
- The script prints both the generated location and the most recent report that matches `comparison-report*.html`, so you can copy/paste the path without hunting through folders

## 7. Quick Troubleshooting
- **Missing Playwright browsers**: run `node src/index.js setup` again
- **Permission errors**: ensure you have write access to the `screenshots/` directory
- **Environment variables not found**: double-check spelling and casing, then rerun the command
- **Network timeouts**: add `--retries 2 --retry-delay 500` to capture commands

## 8. Optional Validation Checks
- `node scripts/validate-screenshot-service.js` verifies screenshot capture
- `ENABLE_COMPARISON_WORKFLOW=true node scripts/validate-comparison-workflow.js` performs a full comparison dry run

Once you finish reviewing the report, share the findings with your team or sign off the release.
