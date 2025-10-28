const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { PNG } = require('pngjs');
const fileManager = require('../src/utils/file-manager');

const WORKER_SUFFIX = process.env.JEST_WORKER_ID ? `-${process.env.JEST_WORKER_ID}` : '';
const TEMP_ROOT = path.join(os.tmpdir(), `screenshot-comparison-tool-tests${WORKER_SUFFIX}`);

function ensureTempRoot() {
  fs.ensureDirSync(TEMP_ROOT);
}

function uniqueId() {
  return crypto.randomBytes(6).toString('hex');
}

function createTempDir(prefix = 'spec') {
  ensureTempRoot();
  const dir = path.join(TEMP_ROOT, `${prefix}-${Date.now()}-${uniqueId()}`);
  fs.ensureDirSync(dir);
  return dir;
}

function createPngBuffer(options = {}) {
  const width = options.width || 20;
  const height = options.height || 20;
  const png = new PNG({ width, height });
  const colors = options.colors || [[255, 0, 0, 255], [0, 0, 0, 0]];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (width * y + x) << 2;
      const color = colors[(x + y) % colors.length];
      png.data[offset] = color[0];
      png.data[offset + 1] = color[1];
      png.data[offset + 2] = color[2];
      png.data[offset + 3] = color[3] ?? 255;
    }
  }

  return PNG.sync.write(png);
}

async function writePng(filePath, options = {}) {
  const buffer = createPngBuffer(options);
  await fs.ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, buffer);
  return buffer;
}

async function createScreenshotFixture(options = {}) {
  const {
    baseDir,
    environment = { name: 'env', slug: 'env', baseUrl: 'https://example.test' },
    pathSegment = '/',
    device = 'desktop',
    viewport = { width: 1280, height: 720 },
    colors,
    timestamp = new Date(),
    image = {}
  } = options;

  const artifact = await fileManager.prepareCapture({
    baseDir,
    environment,
    pathSegment,
    url: `${environment.baseUrl}${pathSegment === '/' ? '' : pathSegment}`,
    viewport,
    device,
    label: options.label,
    sessionId: `test-${uniqueId()}`,
    timestamp
  });

  await writePng(artifact.filePath, {
    colors: colors || image.colors,
    width: image.width,
    height: image.height
  });
  const stats = await fs.stat(artifact.filePath);
  const metadata = await fileManager.finalizeCapture(artifact, {
    fileSize: stats.size,
    capturedAt: timestamp.toISOString()
  });

  return metadata;
}

async function createComparisonPair(baseDir, options = {}) {
  const {
    pathSlug = 'home',
    source = { name: 'Source', slug: 'source', baseUrl: 'https://source.test' },
    target = { name: 'Target', slug: 'target', baseUrl: 'https://target.test' },
    sourceColors,
    targetColors,
    referenceImage,
    targetImage
  } = options;

  const reference = await createScreenshotFixture({
    baseDir,
    environment: source,
    pathSegment: options.pathSegment || '/home',
    colors: sourceColors,
    image: referenceImage
  });

  const targetMeta = await createScreenshotFixture({
    baseDir,
    environment: target,
    pathSegment: options.pathSegment || '/home',
    colors: targetColors,
    image: targetImage
  });

  return {
    pathSlug,
    reference,
    target: targetMeta
  };
}

beforeAll(() => {
  ensureTempRoot();
});

afterAll(async () => {
  await fs.remove(TEMP_ROOT).catch(() => {});
});

afterEach(() => {
  jest.clearAllMocks();
});

const TestHelpers = {
  createTempDir,
  createPngBuffer,
  writePng,
  createScreenshotFixture,
  createComparisonPair
};

global.TestHelpers = TestHelpers;
module.exports = TestHelpers;
