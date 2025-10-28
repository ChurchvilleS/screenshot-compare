const path = require('path');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const fs = require('fs-extra');
const { ComparisonService } = require('./services/comparison');
const configLoader = require('./utils/configLoader');

const config = configLoader.getConfig();
const portEnv = process.env.API_PORT || process.env.PORT;
const PORT = Number(portEnv || 5001);
const HOST = process.env.HOST || '0.0.0.0';
const SCREENSHOTS_ROOT = path.resolve(config.outputDir || 'screenshots');
const DATA_DIR = path.resolve(__dirname, '..', 'data');
const JOB_STORE_PATH = process.env.JOB_STORE_PATH
  ? path.resolve(process.env.JOB_STORE_PATH)
  : path.join(DATA_DIR, 'jobs.json');

let ComparisonServiceImpl = ComparisonService;

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use('/artifacts', express.static(SCREENSHOTS_ROOT));

let jobs = [];

async function loadJobs() {
  try {
    const existing = await fs.readJson(JOB_STORE_PATH);
    if (Array.isArray(existing)) {
      jobs = existing.map((job) => ({ ...job }));
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn(`Unable to read job store: ${error.message}`);
    }
    jobs = [];
  }
}

async function saveJobs() {
  await fs.ensureDir(path.dirname(JOB_STORE_PATH));
  await fs.writeJson(JOB_STORE_PATH, jobs, { spaces: 2 });
}

function toHistoryItem(job) {
  return {
    id: job.id,
    title: job.title,
    status: job.status,
    createdAt: job.createdAt,
    diffPercent: job.diffPercent || null,
    href: job.href || null,
    errorMessage: job.errorMessage || null,
    normalization: job.normalization || null,
    normalizationSummary: job.normalization?.message || null
  };
}

function paginate(items, page, limit) {
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / limit));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const start = (safePage - 1) * limit;
  const pagedItems = items.slice(start, start + limit);
  return {
    items: pagedItems,
    pagination: {
      currentPage: safePage,
      totalPages,
      totalItems,
      pageSize: limit
    }
  };
}

async function processComparison(job) {
  job.status = 'running';
  job.startedAt = new Date().toISOString();
  job.updatedAt = job.startedAt;
  await saveJobs();

  const comparisonService = new ComparisonServiceImpl();
  const paths = Array.isArray(job.paths) && job.paths.length ? job.paths : ['/'];

  try {
    const result = await comparisonService.compareBatch({
      reference: job.reference,
      target: job.target,
      paths,
      viewports: job.viewports,
      capture: job.captureOptions || {},
      comparison: job.comparisonOptions || {},
      report: {
        title: job.reportTitle,
        outputDir: job.reportOutputDir,
        generate: true
      }
    });

    job.status = 'success';
    job.completedAt = new Date().toISOString();
    job.updatedAt = job.completedAt;
    job.reportPath = result.reportPath || null;

    const topChange = result.filtered?.[0]?.changeRatio ?? result.results?.[0]?.changeRatio ?? null;
    if (topChange != null) {
      const percent = Math.round(topChange * 10000) / 100;
      job.changeSummary = `${percent}% change`;
      job.diffPercent = job.changeSummary;
    }

    if (job.reportPath) {
      const relativeReport = path.relative(SCREENSHOTS_ROOT, job.reportPath).replace(/\\/g, '/');
      job.reportRelativePath = relativeReport;
      job.href = `/artifacts/${relativeReport}`;
    }

    const normalizedEntries = Array.isArray(result.results)
      ? result.results.filter((item) => item.normalization?.applied)
      : [];

    if (normalizedEntries.length > 0) {
      const primary = normalizedEntries[0].normalization;
      job.normalization = {
        strategy: primary?.strategy || job.comparisonOptions.normalizeStrategy,
        width: primary?.width || null,
        height: primary?.height || null,
        count: normalizedEntries.length,
        paths: normalizedEntries.map((entry) => entry.pathSlug),
        message: primary?.message || `Normalized ${normalizedEntries.length} capture${normalizedEntries.length === 1 ? '' : 's'}`
      };
    } else {
      job.normalization = null;
    }
  } catch (error) {
    job.status = 'error';
    job.errorMessage = error.message || 'Comparison failed.';
    job.completedAt = new Date().toISOString();
    job.updatedAt = job.completedAt;
    job.normalization = null;
    console.error(`Comparison job ${job.id} failed: ${job.errorMessage}`);
  } finally {
    await saveJobs();
  }
}

app.get('/healthz', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/comparisons', (req, res) => {
  const page = Number.parseInt(req.query.page, 10) || 1;
  const limit = Number.parseInt(req.query.limit, 10) || 5;
  const sorted = jobs.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const { items, pagination } = paginate(sorted.map(toHistoryItem), page, limit);
  res.json({ items, pagination });
});

app.post('/api/comparisons', async (req, res) => {
  const { reference, target, paths, viewports, title, comparison } = req.body || {};
  const referenceUrl = reference?.baseUrl || reference?.url;
  const targetUrl = target?.baseUrl || target?.url;
  const normalizeStrategy = comparison?.normalizeStrategy
    || req.body?.comparisonOptions?.normalizeStrategy
    || req.body?.normalizeStrategy
    || config.comparison?.normalizeStrategy
    || 'crop';

  if (!referenceUrl || !targetUrl) {
    return res.status(400).json({ message: 'reference.baseUrl and target.baseUrl are required.' });
  }

  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const job = {
    id,
    title: title || `${referenceUrl} → ${targetUrl}`,
    status: 'pending',
    createdAt,
    updatedAt: createdAt,
    reference: {
      name: reference?.name || 'Reference',
      slug: reference?.slug || null,
      baseUrl: referenceUrl
    },
    target: {
      name: target?.name || 'Target',
      slug: target?.slug || null,
      baseUrl: targetUrl
    },
    paths: Array.isArray(paths) && paths.length ? paths : ['/'],
    viewports: Array.isArray(viewports) && viewports.length ? viewports : undefined,
    reportTitle: title || `${reference?.name || 'Reference'} vs ${target?.name || 'Target'}`,
    reportOutputDir: undefined,
    captureOptions: {
      outputDir: config.outputDir
    },
    comparisonOptions: {
      diffDir: config.comparison?.diffDir,
      threshold: config.comparison?.threshold,
      normalizeStrategy
    },
    changeSummary: null,
    diffPercent: null,
    href: null,
    reportPath: null,
    reportRelativePath: null,
    errorMessage: null,
    normalization: null
  };

  jobs.push(job);
  await saveJobs();

  processComparison(job).catch((error) => {
    console.error(`Unexpected processing error for job ${job.id}:`, error);
  });

  return res.status(202).json({
    comparisonId: id,
    status: job.status,
    createdAt,
    message: 'Comparison request accepted.'
  });
});

app.use((req, res) => {
  res.status(404).json({ message: 'Not found' });
});

async function start() {
  await loadJobs();
  app.listen(PORT, HOST, () => {
    console.log(`API server listening on http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
    console.log(`Serving artifacts from ${SCREENSHOTS_ROOT}`);
  });
}

function getJobs() {
  return jobs;
}

function resetJobs(newJobs = []) {
  jobs = Array.isArray(newJobs) ? newJobs : [];
}

function setComparisonService(ServiceClass) {
  ComparisonServiceImpl = ServiceClass || ComparisonService;
}

if (require.main === module) {
  start().catch((error) => {
    console.error('Failed to start API server:', error);
    process.exitCode = 1;
  });

  process.on('SIGINT', () => {
    console.log('Shutting down gracefully...');
    process.exit(0);
  });
}

module.exports = {
  app,
  start,
  loadJobs,
  saveJobs,
  processComparison,
  getJobs,
  resetJobs,
  setComparisonService,
  toHistoryItem,
  paginate
};
