# Architecture Overview

## System Architecture

The Screenshot Comparison Tool follows a **multi-tier architecture** with three primary interfaces sharing common business logic:

```
┌─────────────────────────────────────────────────────────┐
│                     User Interfaces                      │
├──────────────┬────────────────────┬─────────────────────┤
│  CLI (Node)  │  Web UI (React)    │  REST API (Express) │
└──────┬───────┴──────────┬─────────┴──────────┬──────────┘
       │                  │                    │
       └──────────────────┼────────────────────┘
                          ▼
              ┌─────────────────────┐
              │  Business Services  │
              ├─────────────────────┤
              │ • ScreenshotService │
              │ • ComparisonService │
              └─────────────────────┘
                          ▼
              ┌─────────────────────┐
              │   Shared Utilities  │
              ├─────────────────────┤
              │ • Config Loader     │
              │ • URL Builder       │
              │ • File Manager      │
              │ • Environment Config│
              │ • Report Generator  │
              └─────────────────────┘
                          ▼
              ┌─────────────────────┐
              │  External Systems   │
              ├─────────────────────┤
              │ • Playwright        │
              │ • File System       │
              │ • Job Storage (JSON)│
              └─────────────────────┘
```

## Component Structure

### 1. User Interface Layer

#### CLI Interface (`src/cli.js`, `src/index.js`)
- **Command parsing** using Commander.js framework
- **Orchestration** of capture and comparison workflows
- **Configuration loading** from files and environment
- **Results reporting** with colored console output (chalk)
- **Browser setup** automation for Playwright
- **Commands**:
  - `setup`: Install Playwright browsers
  - `capture <sourceUrl> <targetUrl>`: Capture screenshots
  - `compare <refEnv> <targetEnv>`: Compare environments

#### Web UI (`ui/src/`)
- **React single-page application** built with Vite
- **Form validation** for URL inputs
- **Job submission** via REST API
- **History view** with pagination (5 items per page)
- **Status tracking** with automatic polling for pending jobs
- **Error handling** with dismissible alerts
- **Bootstrap styling** for responsive design
- **Key Components**:
  - `App.jsx`: Main application component
  - Form submission with validation
  - History list with pagination controls
  - Status badges (pending, success, error)

#### REST API Server (`src/server.js`)
- **Express.js** HTTP server
- **CORS enabled** for cross-origin requests
- **JSON request parsing** (1MB limit)
- **Static file serving** for artifacts at `/artifacts`
- **Endpoints**:
  - `POST /api/comparisons`: Queue new comparison job
  - `GET /api/comparisons`: Retrieve paginated history
  - `GET /healthz`: Health check
- **Job persistence** in `data/jobs.json`
- **Default port**: 5001 (configurable via `API_PORT`)

### 2. Business Logic Layer

#### Screenshot Service (`src/services/screenshot.js`)
- **Browser automation** using Playwright
- **Multi-viewport capture** (desktop, mobile, custom dimensions)
- **Retry logic** with configurable delays
- **Wait strategies** (`waitUntil`, `postWait`)
- **Screenshot capture** with metadata
- **Path-based navigation** for multiple routes
- **Error handling** and recovery
- **Output**: PNG files with structured naming

#### Comparison Service (`src/services/comparison.js`)
- **Batch comparison** orchestration
- **Image normalization** for dimension mismatches (crop strategy)
- **Pixel-diff comparison** using pixelmatch library
- **Threshold-based change detection** (configurable sensitivity)
- **HTML report generation** with embedded images
- **Dynamic report naming** with timestamps
- **Summary statistics** (total comparisons, significant changes)
- **Output**: HTML reports in configured directory

### 3. Utility Layer

#### Configuration Loader (`src/utils/configLoader.js`)
- Centralized configuration management
- Loads from `config/default.json` and environment-specific files
- Environment variable overrides
- Defaults and validation

#### URL Builder (`src/utils/urlBuilder.js`)
- URL construction and validation
- Path joining with trailing slash preservation
- Protocol enforcement
- Environment URL resolution

#### File Manager (`src/utils/file-manager.js`)
- Consistent file naming conventions
- Directory creation and management
- Metadata storage and retrieval
- Screenshot organization by environment

#### Environment Config (`src/utils/environmentConfig.js`)
- Environment-specific URL and credential management
- Secrets-aware configuration loader
- Support for multiple deployment environments
- Integration with CI/CD workflows

#### Report Path Generator (`src/utils/reportPathGenerator.js`)
- Dynamic report filename generation
- URL token extraction (domain, path)
- Timestamp formatting with minute granularity
- Unique report naming to prevent collisions

#### Browser Setup (`src/utils/browserSetup.js`)
- Playwright browser installation checker
- Automated browser binary installation
- Version management

### 4. CI/CD Integration (`src/ci/`)

#### Regression Runner (`src/ci/regressionRunner.js`)
- Automated comparison orchestration
- Environment-based comparison workflows
- CI pipeline integration
- Report artifact management

## Data Flow

### Capture Workflow
```
User Input (URLs/Env) → CLI/UI/API → ScreenshotService
    ↓
Playwright Navigation → Screenshot Capture → File System
    ↓
Metadata Storage → File Manager → JSON Persistence
```

### Comparison Workflow
```
User Request (Ref vs Target) → CLI/UI/API → ComparisonService
    ↓
Image Loading → Dimension Check → Normalization (if needed)
    ↓
Pixelmatch Diff → Threshold Analysis → Report Generation
    ↓
HTML Report → File System → User Access
```

### API Job Flow
```
POST /api/comparisons → Job Creation → Queue Storage
    ↓
Background Processing → ComparisonService → Result Update
    ↓
GET /api/comparisons → Job History → Paginated Response
```

## File Structure

```
screenshot-comparison-tool/
├── src/
│   ├── index.js                      # CLI entry point
│   ├── cli.js                        # Command-line interface
│   ├── server.js                     # Express API server
│   ├── report-path-generator.js      # Report naming utility
│   ├── services/
│   │   ├── screenshot.js             # Screenshot capture service
│   │   └── comparison.js             # Image comparison service
│   ├── utils/
│   │   ├── configLoader.js           # Configuration management
│   │   ├── urlBuilder.js             # URL construction/validation
│   │   ├── file-manager.js           # File handling utilities
│   │   ├── environmentConfig.js      # Environment configuration
│   │   ├── reportPathGenerator.js    # Report path generation
│   │   └── browserSetup.js           # Playwright setup
│   ├── ci/
│   │   └── regressionRunner.js       # CI/CD integration
│   └── config/
│       └── api-config.js             # API configuration
├── ui/
│   ├── src/
│   │   ├── App.jsx                   # React main component
│   │   ├── main.jsx                  # React entry point
│   │   └── styles.css                # Application styles
│   ├── tests/
│   │   └── playwright/               # E2E tests
│   ├── index.html                    # HTML template
│   ├── vite.config.js                # Vite build config
│   └── playwright.config.js          # Playwright test config
├── tests/
│   ├── unit/                         # Unit tests
│   │   ├── services/                 # Service tests
│   │   ├── utils/                    # Utility tests
│   │   └── scripts/                  # Script tests
│   └── integration/                  # Integration tests
├── scripts/
│   └── validate-*.js                 # Validation scripts
├── config/
│   ├── default.json                  # Default configuration
│   └── environments.json             # Environment definitions
├── data/
│   └── jobs.json                     # Job persistence store
├── screenshots/                      # Screenshot output directory
│   ├── [env]/                        # Environment-specific folders
│   └── diff/                         # Comparison reports
├── .github/
│   └── workflows/                    # CI/CD pipelines
├── package.json                      # Dependencies and scripts
├── jest.config.js                    # Test configuration
└── babel.config.js                   # Babel configuration
```

## Design Patterns & Principles

### Separation of Concerns
- **UI Layer**: Presentation and user interaction
- **Service Layer**: Business logic and orchestration
- **Utility Layer**: Reusable helper functions
- **Data Layer**: Configuration and persistence

### Dependency Injection
- Services accept dependencies via constructor
- Enables testing with mocks/stubs
- Supports multiple service implementations

### Configuration Management
- Centralized configuration loading
- Environment-specific overrides
- Validation and defaults
- Secrets management support

### Error Handling
- Graceful degradation
- Retry logic for transient failures
- User-friendly error messages
- Detailed logging for debugging

### Modularity & Extensibility
- Each component has single responsibility
- Clear interfaces between layers
- Easy to add new capture strategies
- Pluggable comparison algorithms

## Technology Choices

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Runtime | Node.js 20+ | Modern JS features, ecosystem support |
| Browser Automation | Playwright | Multi-browser, modern API, active development |
| CLI Framework | Commander.js | Robust parsing, extensible, well-documented |
| API Server | Express | Lightweight, flexible, extensive middleware |
| UI Framework | React | Component model, ecosystem, tooling |
| Build Tool | Vite | Fast HMR, modern bundling, dev experience |
| Image Comparison | Pixelmatch | Fast, accurate, configurable thresholds |
| Testing | Jest | Comprehensive features, coverage tracking |
| Validation Scripts | Custom Node.js | Direct integration, no external dependencies |

## Scalability Considerations

### Current Architecture (MVP)
- Synchronous job processing
- JSON file-based persistence
- Single-server deployment
- Suitable for: Small teams, internal tools, low-to-medium volume

### Future Enhancements
- **Job Queue**: Bull/BullMQ for async processing
- **Database**: SQLite/PostgreSQL for job persistence
- **Caching**: Redis for session and result caching
- **Load Balancing**: Multiple API instances behind proxy
- **Object Storage**: S3/Azure Blob for screenshots
- **Monitoring**: Prometheus + Grafana for metrics
- **Authentication**: OAuth/SAML for enterprise SSO

## Security Architecture

### Current State
- CORS enabled for cross-origin requests
- Input validation on URLs and parameters
- No authentication (suitable for internal networks only)

### Production Requirements
- API authentication (JWT or session-based)
- Rate limiting on endpoints
- Input sanitization for XSS prevention
- Secrets management for credentials
- TLS/HTTPS in production
- Access control for job history

## Testing Strategy

### Unit Tests (`tests/unit/`)
- Individual function testing
- Mocked dependencies
- Fast execution
- High coverage target (80%+)

### Integration Tests (`tests/integration/`)
- Service interaction testing
- Real file system operations
- Database persistence validation
- End-to-end workflow testing

### E2E Tests (`ui/tests/playwright/`)
- Full user journey validation
- Browser automation
- UI interaction testing
- Cross-browser compatibility

### Validation Scripts (`scripts/`)
- Component smoke testing
- Quick verification
- Development workflow validation
- CI/CD integration checks