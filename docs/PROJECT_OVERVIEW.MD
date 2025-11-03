# Screenshot Comparison Tool

## Project Purpose
A comprehensive tool that captures and compares screenshots from multiple environments (development, staging, production) of complex websites to assist with visual QA and regression testing.

## Core Requirements
- Accept two or more base URLs (dev, staging, production environments)
- Navigate to multiple view paths for each environment
- Capture screenshots with consistent naming and metadata
- Enable side-by-side visual comparison with pixel-level diffing
- Store screenshots with metadata for future reference and historical tracking
- Support multi-viewport capture (desktop, mobile, tablet)
- Provide multiple access methods: CLI for automation, web UI for users, REST API for integration

## Technical Approach

### Architecture Overview
- **Node.js application** using Playwright for cross-browser automation
- **Multi-interface design** serving different user needs:
  - **CLI Interface**: Command-line tool for automation, scripting, and CI/CD pipelines
  - **Web UI**: React-based interface for non-technical users with form validation and history
  - **REST API**: Express server exposing capture/comparison endpoints for programmatic access
- **Modular architecture** with clear separation of concerns (services, utilities, configuration)
- **Environment-aware configuration** with fallbacks and overrides for deployment flexibility

### Key Features
- **Pixel-diff comparison** using pixelmatch library with configurable thresholds
- **Dynamic HTML report generation** with unique timestamped filenames
- **Image normalization** for mismatched dimensions (crop strategy) to accommodate responsive layouts
- **Multi-viewport support** for testing across different device sizes
- **Retry logic** with configurable delays for resilient screenshot capture
- **Job persistence** with JSON-based storage for comparison history
- **Express REST server** defaults to port 5001 with environment variable overrides

### Technology Stack
- **Runtime**: Node.js (>=20 || ^18)
- **Browser Automation**: Playwright
- **CLI Framework**: Commander.js
- **API Server**: Express with CORS support
- **UI Framework**: React with Vite build tooling
- **Image Comparison**: Pixelmatch + PNG.js
- **Testing**: Jest with coverage tracking

## User Interfaces

### 1. Command-Line Interface (CLI)
Primary interface for developers and automation:
- `capture` command: Capture screenshots from specified URLs
- `compare` command: Compare environments by name
- `setup` command: Install required browser binaries
- Supports flags for paths, viewports, retries, and comparison thresholds

### 2. Web UI (React)
User-friendly interface for non-technical team members:
- Form-based submission with URL validation
- Real-time job status tracking
- Paginated history view with filtering
- Direct links to generated HTML reports
- Responsive design with Bootstrap styling
- Optimistic updates and error handling

### 3. REST API (Express)
Programmatic access for integrations:
- `POST /api/comparisons`: Queue new comparison jobs
- `GET /api/comparisons`: Retrieve paginated job history
- `GET /healthz`: Health check endpoint
- `/artifacts`: Static file serving for screenshots and reports
- JSON-based job persistence in `data/jobs.json`

## Success Criteria
- ✅ Successfully captures screenshots from multiple environments
- ✅ Generates properly named files with environment, path, and timestamp
- ✅ Provides pixel-level comparison with HTML diff reports
- ✅ Handles errors gracefully with retry logic and validation
- ✅ Can be run by non-technical team members via web UI
- ✅ Supports automation through CLI and API interfaces
- ✅ Maintains job history for tracking and audit purposes
- ✅ Normalizes images for consistent cross-environment comparison

## Deployment Scenarios

### Local Development
- CLI-only usage for quick comparisons
- Combined API + UI with Vite dev server proxy

### Production Deployment
- Nginx reverse proxy with TLS termination
- Separate UI static hosting and API backend
- Environment-specific configuration via variables

## Future Enhancements
- Authentication and authorization for shared deployments
- Background job queue for long-running comparisons
- Cross-browser testing (Firefox, WebKit)
- Authenticated browsing with credentials
- Report retention and cleanup automation
- Trend analysis and regression tracking