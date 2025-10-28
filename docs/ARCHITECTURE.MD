# Architecture Overview

## Component Structure
1. **Core Screenshot Service**
   - Browser automation with Playwright
   - Screenshot capture and saving
   - Path handling and URL construction

2. **CLI Interface**
   - Command parsing
   - Configuration loading
   - Results reporting

3. **Comparison Utilities**
   - Side-by-side view generation
   - Optional: Image diff generation

4. **File Management**
   - Consistent naming convention
   - Directory organization
   - Metadata storage

## Data Flow
1. User provides base URLs and paths
2. System navigates to each URL combination
3. Screenshots are captured and saved
4. Comparison views are generated
5. Results are presented to the user

## File Structure
screenshot-comparison-tool/ ├── src/ │ ├── services/ │ │ ├── screenshot.js # Core screenshot functionality │ │ └── comparison.js # Image comparison utilities │ ├── utils/ │ │ ├── file-manager.js # File handling utilities │ │ └── url-builder.js # URL construction and validation │ └── cli.js # Command-line interface ├── tests/ │ ├── unit/ # Unit tests │ └── integration/ # Integration tests ├── config/ │ └── default.json # Default configuration ├── screenshots/ # Output directory └── package.json