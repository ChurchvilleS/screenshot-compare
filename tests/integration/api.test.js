const path = require('path');
let fs;
const request = require('supertest');

jest.setTimeout(15000);

describe('API server endpoints', () => {
  let server;
  let tempDir;
  let compareBatchMock;
  let writeJsonSpy;
  let persistedSnapshots;

  class FakeComparisonService {
    async compareBatch(options) {
      return compareBatchMock(options);
    }
  }

  beforeEach(async () => {
    jest.resetModules();
    fs = require('fs-extra');

    tempDir = TestHelpers.createTempDir('api');
    process.env.JOB_STORE_PATH = path.join(tempDir, 'jobs.json');

    persistedSnapshots = [];
    writeJsonSpy = jest.spyOn(fs, 'writeJson').mockImplementation(async (filePath, data) => {
      const snapshot = JSON.parse(JSON.stringify(data));
      persistedSnapshots.push(snapshot);
    });

    compareBatchMock = jest.fn().mockResolvedValue({
      results: [],
      filtered: []
    });

    server = require('../../src/server');
    server.resetJobs();
    server.setComparisonService(FakeComparisonService);
    await server.saveJobs();
  });

  afterEach(async () => {
    delete process.env.JOB_STORE_PATH;
    jest.resetModules();
    if (writeJsonSpy) {
      writeJsonSpy.mockRestore();
    }
    if (tempDir && fs) {
      await fs.remove(tempDir).catch(() => {});
    }
  });

  it('responds with service status for /healthz', async () => {
    const response = await request(server.app).get('/healthz');

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('status', 'ok');
    expect(response.body).toHaveProperty('timestamp');
    expect(new Date(response.body.timestamp).toString()).not.toBe('Invalid Date');
  });

  it('rejects invalid comparison submissions', async () => {
    const response = await request(server.app)
      .post('/api/comparisons')
      .send({});

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('message');
  });

  it('accepts valid comparison submissions and queues a job', async () => {
    const payload = {
      reference: {
        name: 'Baseline',
        baseUrl: 'https://baseline.test'
      },
      target: {
        name: 'Candidate',
        baseUrl: 'https://candidate.test'
      },
      paths: ['/home'],
      title: 'Smoke Check'
    };

    const response = await request(server.app)
      .post('/api/comparisons')
      .send(payload);

    expect(response.status).toBe(202);
    expect(response.body).toMatchObject({
      status: 'running',
      message: 'Comparison request accepted.'
    });

    await new Promise((resolve) => setImmediate(resolve));
    const firstCall = compareBatchMock.mock.results[0]?.value;
    if (firstCall instanceof Promise) {
      await firstCall;
    }
    await new Promise((resolve) => setImmediate(resolve));

    expect(compareBatchMock).toHaveBeenCalledTimes(1);
  const jobs = server.getJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      title: 'Smoke Check',
      status: 'success',
      reference: expect.objectContaining({ baseUrl: 'https://baseline.test' }),
      target: expect.objectContaining({ baseUrl: 'https://candidate.test' }),
      normalization: null
    });

    expect(writeJsonSpy).toHaveBeenCalled();
    expect(persistedSnapshots).not.toHaveLength(0);
    const latestSnapshot = persistedSnapshots[persistedSnapshots.length - 1];
    expect(Array.isArray(latestSnapshot)).toBe(true);
    expect(latestSnapshot[0].id).toBe(jobs[0].id);
  });
});
