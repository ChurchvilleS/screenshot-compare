const path = require('path');
const fs = require('fs-extra');
const slugify = require('slugify');

const METADATA_VERSION = 1;
const TIMESTAMP_STRIP_REGEX = /[-:]/g;
const DEFAULT_DEVICE = 'desktop';
const ARCHIVE_DIR_DEFAULT = '_archive';

function formatTimestamp(date = new Date()) {
  return date.toISOString().replace(TIMESTAMP_STRIP_REGEX, '').replace(/\..*/, '');
}

function normalizePathSegment(segment) {
  const raw = segment == null ? '' : String(segment).trim();
  if (!raw || raw === '/') {
    return {
      original: '/',
      clean: '',
      slug: 'root',
      query: null,
      hash: null
    };
  }

  const [pathPartWithHash, query] = raw.split('?');
  const [pathPart, hash] = pathPartWithHash.split('#');
  const clean = pathPart.replace(/^\/+/, '').replace(/\/+$/, '');
  const slug = slugify(clean || 'root', { lower: true, strict: true }) || 'root';

  return {
    original: raw,
    clean,
    slug,
    query: query || null,
    hash: hash || null
  };
}

function slugifyValue(value, fallback) {
  const slug = slugify(String(value), { lower: true, strict: true });
  return slug || fallback;
}

function buildDeviceDescriptor(viewport = {}, deviceName = DEFAULT_DEVICE) {
  const nameSlug = slugifyValue(deviceName || DEFAULT_DEVICE, DEFAULT_DEVICE);
  const width = viewport?.width ?? 'na';
  const height = viewport?.height ?? 'na';
  const viewportToken = `${width}x${height}`;
  return {
    name: deviceName || DEFAULT_DEVICE,
    viewport,
    slug: `${nameSlug}-${viewportToken}`,
    viewportToken
  };
}

async function prepareCapture(options) {
  const {
    baseDir,
    environment = {},
    pathSegment = '',
    url,
    viewport = {},
    device,
    label,
    sessionId,
    timestamp = new Date()
  } = options;

  if (!baseDir) {
    throw new Error('baseDir is required to prepare capture paths.');
  }

  const resolvedBase = path.resolve(baseDir);
  const environmentName = environment.name || environment.id || 'environment';
  const environmentSlug = slugifyValue(environmentName, 'environment');
  const pathInfo = normalizePathSegment(pathSegment);
  const deviceInfo = buildDeviceDescriptor(viewport, device);
  const labelSlug = label ? slugifyValue(label, null) : null;
  const timestampIso = timestamp.toISOString();
  const timestampToken = formatTimestamp(timestamp);
  const dateParts = timestampIso.slice(0, 10).split('-');

  const relativeDirectory = path.join(environmentSlug, ...dateParts);
  const absoluteDirectory = path.join(resolvedBase, relativeDirectory);
  await fs.ensureDir(absoluteDirectory);

  const nameParts = [environmentSlug, pathInfo.slug, deviceInfo.slug];
  if (labelSlug) {
    nameParts.push(labelSlug);
  }
  nameParts.push(timestampToken);

  const baseFileName = nameParts.filter(Boolean).join('__');
  const fileName = `${baseFileName}.png`;
  const metadataFileName = `${baseFileName}.json`;

  const filePath = path.join(absoluteDirectory, fileName);
  const metadataPath = path.join(absoluteDirectory, metadataFileName);
  const relativePath = path.join(relativeDirectory, fileName);
  const metadataRelativePath = path.join(relativeDirectory, metadataFileName);

  const metadata = {
    version: METADATA_VERSION,
    status: 'pending',
    sessionId: sessionId || `session-${timestampToken}`,
    timestamp: timestampIso,
    environment: {
      name: environmentName,
      slug: environmentSlug,
      baseUrl: environment.baseUrl || null
    },
    url: url || null,
    path: {
      segment: pathInfo.original,
      slug: pathInfo.slug,
      clean: pathInfo.clean,
      query: pathInfo.query,
      hash: pathInfo.hash
    },
    label: label || null,
    device: {
      name: deviceInfo.name,
      viewport: {
        width: viewport?.width ?? null,
        height: viewport?.height ?? null
      },
      token: deviceInfo.slug
    },
    output: {
      directory: relativeDirectory,
      fileName,
      metadataFileName,
      relativePath,
      metadataRelativePath
    },
    capturedAt: null,
    fileSize: null,
    archived: false,
    archive: null,
    notes: null
  };

  return {
    filePath,
    metadataPath,
    metadata,
    baseDir: resolvedBase
  };
}

async function writeMetadata(artifact, overrides = {}) {
  const metadata = {
    ...artifact.metadata,
    ...overrides,
    status: overrides.status || artifact.metadata.status || 'success',
    updatedAt: new Date().toISOString()
  };

  await fs.writeJson(artifact.metadataPath, metadata, { spaces: 2 });

  return {
    ...metadata,
    absolutePath: artifact.filePath,
    metadataPath: artifact.metadataPath
  };
}

async function finalizeCapture(artifact, overrides = {}) {
  const metadataUpdates = {
    status: 'success',
    capturedAt: overrides.capturedAt || new Date().toISOString()
  };

  if (overrides.fileSize != null) {
    metadataUpdates.fileSize = overrides.fileSize;
  }

  if (overrides.notes) {
    metadataUpdates.notes = overrides.notes;
  }

  return writeMetadata(artifact, metadataUpdates);
}

async function recordFailure(artifact, error) {
  const failureMetadata = {
    status: 'error',
    capturedAt: new Date().toISOString(),
    error: {
      message: error?.message || String(error),
      stack: error?.stack || null
    }
  };

  return writeMetadata(artifact, failureMetadata);
}

async function listMetadata(baseDir, options = {}) {
  const resolvedBase = path.resolve(baseDir);
  if (!(await fs.pathExists(resolvedBase))) {
    return [];
  }

  const includeArchived = options.includeArchived === true;
  const items = [];

  async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }

      if (!entry.name.endsWith('.json')) {
        continue;
      }

      try {
        const metadata = await fs.readJson(fullPath);
        if (!includeArchived && metadata.archived) {
          continue;
        }
        const metadataRelativePath = path.relative(resolvedBase, fullPath);
        const absoluteImagePath = path.join(resolvedBase, metadata.output?.relativePath || '');
        items.push({
          ...metadata,
          metadataPath: fullPath,
          metadataRelativePath,
          absolutePath: absoluteImagePath,
          baseDir: resolvedBase
        });
      } catch (error) {
        items.push({
          error: `Failed to read metadata from ${fullPath}: ${error.message}`
        });
      }
    }
  }

  await walk(resolvedBase);

  return items.filter((item) => !item.error);
}

function groupByEnvironment(records) {
  return records.reduce((acc, record) => {
    const key = record.environment?.slug || 'unknown';
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(record);
    return acc;
  }, {});
}

async function getScreenshotsForComparison(baseDir, options = {}) {
  const { environments, limitPerEnvironment = 10, includeArchived = false } = options;
  const records = await listMetadata(baseDir, { includeArchived });
  const filtered = environments
    ? records.filter((record) =>
        environments.includes(record.environment?.slug) ||
        environments.includes(record.environment?.name)
      )
    : records;

  const groupedByPath = filtered.reduce((acc, record) => {
    const pathKey = record.path?.slug || 'root';
    const envKey = record.environment?.slug || 'unknown';

    if (!acc[pathKey]) {
      acc[pathKey] = {};
    }

    if (!acc[pathKey][envKey]) {
      acc[pathKey][envKey] = [];
    }

    acc[pathKey][envKey].push(record);
    return acc;
  }, {});

  Object.keys(groupedByPath).forEach((pathKey) => {
    Object.keys(groupedByPath[pathKey]).forEach((envKey) => {
      groupedByPath[pathKey][envKey].sort((a, b) => {
        return new Date(b.capturedAt || b.timestamp).getTime() - new Date(a.capturedAt || a.timestamp).getTime();
      });
      groupedByPath[pathKey][envKey] = groupedByPath[pathKey][envKey].slice(0, limitPerEnvironment);
    });
  });

  return groupedByPath;
}

async function pruneOldScreenshots(baseDir, options = {}) {
  const {
    maxPerEnvironment = 50,
    archiveDirName = ARCHIVE_DIR_DEFAULT
  } = options;

  if (!maxPerEnvironment || maxPerEnvironment < 0) {
    return { archived: [] };
  }

  const records = await listMetadata(baseDir);
  if (!records.length) {
    return { archived: [] };
  }

  const grouped = groupByEnvironment(records);
  const archived = [];

  for (const [envKey, envRecords] of Object.entries(grouped)) {
    envRecords.sort((a, b) => {
      return new Date(b.capturedAt || b.timestamp).getTime() - new Date(a.capturedAt || a.timestamp).getTime();
    });

    const toArchive = envRecords.slice(maxPerEnvironment);
    for (const record of toArchive) {
      const archiveRelativePath = path.join(archiveDirName, record.output?.relativePath || path.basename(record.absolutePath));
      const archiveMetadataRelativePath = path.join(archiveDirName, record.output?.metadataRelativePath || path.basename(record.metadataPath));
      const archiveAbsolutePath = path.join(record.baseDir, archiveRelativePath);
      const archiveMetadataPath = path.join(record.baseDir, archiveMetadataRelativePath);

      await fs.ensureDir(path.dirname(archiveAbsolutePath));
      await fs.ensureDir(path.dirname(archiveMetadataPath));

      if (await fs.pathExists(record.absolutePath)) {
        await fs.move(record.absolutePath, archiveAbsolutePath, { overwrite: true });
      }

      if (await fs.pathExists(record.metadataPath)) {
        await fs.move(record.metadataPath, archiveMetadataPath, { overwrite: true });
      }

      const archivedRecord = {
        ...record,
        archived: true,
        archive: {
          relativePath: archiveRelativePath,
          metadataRelativePath: archiveMetadataRelativePath,
          archivedAt: new Date().toISOString()
        },
        absolutePath: archiveAbsolutePath,
        metadataPath: archiveMetadataPath
      };

      await fs.writeJson(archiveMetadataPath, archivedRecord, { spaces: 2 });
      archived.push(archivedRecord);
    }
  }

  return { archived };
}

module.exports = {
  prepareCapture,
  finalizeCapture,
  recordFailure,
  listMetadata,
  groupByEnvironment,
  getScreenshotsForComparison,
  pruneOldScreenshots
};
