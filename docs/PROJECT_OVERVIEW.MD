# Screenshot Comparison Tool

## Project Purpose
A tool that captures and compares screenshots from development and staging environments of a complex website to assist with visual QA.

## Core Requirements
- Accept two base URLs (dev and staging environments)
- Navigate to multiple view paths for each environment
- Capture screenshots with consistent naming
- Enable side-by-side visual comparison
- Store screenshots with metadata for future reference

## Technical Approach
- Node.js application using Playwright for browser automation
- Simple command-line interface with potential for web UI
- Optional Express REST server exposing capture/comparison endpoints for the UI
- Express REST server defaults to port 5001 with environment variable overrides for deployment flexibility
- Comparison pipeline normalizes mismatched image dimensions (crop strategy) before running pixel diffs to accommodate responsive layouts
- Modular design for extensibility
- Focus on simplicity and speed of development

## Success Criteria
- Successfully captures screenshots from both environments
- Generates properly named files with environment, path, and date
- Provides a way to easily compare screenshots
- Handles errors gracefully
- Can be run by non-technical team members