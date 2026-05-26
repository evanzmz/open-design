import type http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServer } from '../src/server.js';

describe('/api/version', () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    const started = await startServer({ port: 0, returnServer: true }) as {
      url: string;
      server: http.Server;
    };
    baseUrl = started.url;
    server = started.server;
  });

  afterAll(() => new Promise<void>((resolve) => {
    if (server == null) {
      resolve();
      return;
    }
    server.close(() => resolve());
  }));

  it('returns current app version info', async () => {
    const res = await fetch(`${baseUrl}/api/version`);
    const json = await res.json() as unknown;

    expect(res.ok).toBe(true);
    expect(json).toEqual({
      version: {
        version: expect.any(String),
        channel: expect.any(String),
        packaged: expect.any(Boolean),
        platform: expect.any(String),
        arch: expect.any(String),
      },
    });
  });

  it('keeps health version aligned with version endpoint', async () => {
    const [healthRes, versionRes] = await Promise.all([
      fetch(`${baseUrl}/api/health`),
      fetch(`${baseUrl}/api/version`),
    ]);
    const health = await healthRes.json() as { ok?: unknown; version?: unknown };
    const version = await versionRes.json() as { version?: { version?: unknown } };

    expect(healthRes.ok).toBe(true);
    expect(versionRes.ok).toBe(true);
    expect(health).toEqual({ ok: true, version: version.version?.version });
  });
});

describe('/api/version with OD_BASE_PATH', () => {
  let server: http.Server;
  let baseUrl: string;
  const previousBasePath = process.env.OD_BASE_PATH;

  beforeAll(async () => {
    process.env.OD_BASE_PATH = '/open-design';
    const started = await startServer({ port: 0, returnServer: true }) as {
      url: string;
      server: http.Server;
    };
    baseUrl = started.url;
    server = started.server;
  });

  afterAll(() => new Promise<void>((resolve) => {
    if (server == null) {
      if (previousBasePath == null) {
        delete process.env.OD_BASE_PATH;
      } else {
        process.env.OD_BASE_PATH = previousBasePath;
      }
      resolve();
      return;
    }
    server.close(() => {
      if (previousBasePath == null) {
        delete process.env.OD_BASE_PATH;
      } else {
        process.env.OD_BASE_PATH = previousBasePath;
      }
      resolve();
    });
  }));

  it('accepts API requests under the configured basePath', async () => {
    const res = await fetch(`${baseUrl}/open-design/api/health`);
    const json = await res.json() as { ok?: unknown; version?: unknown };

    expect(res.ok).toBe(true);
    expect(json).toEqual({ ok: true, version: expect.any(String) });
  });
});
