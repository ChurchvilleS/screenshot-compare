# Workflow Guide

## Copilot Prompt Structure
Each prompt to GitHub Copilot should follow this structure:

1. **Review**: Begin by asking Copilot to review PROJECT-PROGRESS.md to understand current status
2. **Task Definition**: Clearly define a testable task with specific requirements
3. **Validation**: Include validation criteria or a validation script requirement
4. **Progress Tracking**: Request an update to PROJECT-PROGRESS.md with completed work
5. **Next Steps**: Ask for suggestions on what to tackle next

## Development Process
1. Create a prompt following the structure above
2. Implement the requested feature/component
3. Validate the implementation using the specified tests
4. Update progress tracking
5. Only proceed to next task when validation passes

## CLI Workflow
The project exposes a CLI that orchestrates screenshot capture and comparison workflows.

### Setup
- Install dependencies: `npm install`
- Verify Playwright browsers: `node src/index.js setup --check` (runs installation when omitted)
- Export required environment variables (see `docs/PROJECT-PROGRESS.md` and `config/environments.json`)

### Capture Flow
- Command: `node src/index.js capture <sourceUrl> <targetUrl>`
- Common flags:
	- `--paths / /pricing` to capture multiple routes
	- `--viewports 1280x720@desktop,414x896@mobile` for responsive runs
	- `--compare` to immediately trigger comparisons after each capture
	- `--retries 2 --retry-delay 500` to harden against transient failures
- Outputs land under `screenshots/` unless `--output` overrides the directory.

### Comparison Flow
- Command: `node src/index.js compare <referenceEnv> <targetEnv>` where environments map to keys in `config/environments.json` (for example `dev`, `staging`, `production`).
- Optional arguments:
	- `--paths / /pricing` to scope to explicit routes (defaults to configured paths)
	- `--viewports 1280x720@desktop` to pin viewport overrides
	- `--threshold 0.2` to tweak pixelmatch sensitivity
	- `--significant-threshold 0.05` to flag meaningful changes in output
	- `--report-output screenshots/reports` to relocate generated HTML reports
- The command captures fresh screenshots (if needed), runs pixel-diff comparisons, prints a summary of significant changes, and publishes an HTML report path.
- Reports are now named using `<reference>-<target>_<timestamp>` tokens (e.g., `comparison-report_staging-production_10-27-25_14-22pm.html`) so every run produces a unique artifact.
- Use `node scripts/validate-comparison.js` when you need to list or verify the most recent report; the script relies on the shared `findMostRecentReport` helper.

### Validation Scripts
- `node scripts/validate-screenshot-service.js` smoke-tests multi-viewport capture.
- `node scripts/validate-comparison-workflow.js` exercises the end-to-end comparison pipeline (requires `ENABLE_COMPARISON_WORKFLOW=true`).
- `node scripts/validate-cli.js` checks argument validation and optional capture smoke tests.

## Example Prompt
Review PROJECT-PROGRESS.md and implement [specific component] following these requirements:

Create [file path] with the following functionality:

[Specific requirement 1]
[Specific requirement 2]
[Specific requirement 3]
Create a validation script at scripts/validate-[component].js that:

[Test case 1]
[Test case 2]
[Error handling verification]
Update PROJECT-PROGRESS.md to reflect:

New component status
Add completed step
Update "Next Steps" section
The implementation should follow our established patterns and be testable in isolation.