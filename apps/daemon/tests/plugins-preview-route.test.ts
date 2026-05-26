// Plan §6 Phase 2B / spec §11.6 / §9.2 — `/api/plugins/:id/preview`
// and `/api/plugins/:id/example/:name` sandbox envelope.
//
// Tests that:
//   - the preview endpoint resolves `od.preview.entry`, falls back
//     to common defaults, and serves with the §9.2 CSP + nosniff
//     headers (so the marketplace iframe can't reach back into
//     /api/*).
//   - example name matching honours basename / stem / title.
//   - traversal segments + symlink leaks are refused.
//   - unknown plugin ids and missing entries return 404.

import http from 'node:http';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';

type StartedServer = { server: http.Server; url: string };

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '../../..');
const serverRuntimeDataRoot = process.env.OD_DATA_DIR
  ? path.resolve(projectRoot, process.env.OD_DATA_DIR)
  : path.join(projectRoot, '.od');

const PLUGIN_ID = `phase2b-preview-${Date.now()}`;
let pluginRoot: string;
let server: http.Server | undefined;
let baseUrl: string;

beforeEach(async () => {
  pluginRoot = await mkdtemp(path.join(os.tmpdir(), 'od-preview-'));
  const folder = path.join(pluginRoot, PLUGIN_ID);
  await mkdir(path.join(folder, 'preview'), { recursive: true });
  await mkdir(path.join(folder, 'examples', 'desk-warm'), { recursive: true });
  await mkdir(path.join(folder, 'examples', 'wrapped'), { recursive: true });
  await writeFile(
    path.join(folder, 'preview', 'index.html'),
    '<!DOCTYPE html><title>preview</title><p>preview body</p>',
  );
  await writeFile(
    path.join(folder, 'examples', 'desk-warm', 'index.html'),
    '<!DOCTYPE html><title>desk-warm</title><p>example body</p>',
  );
  await writeFile(
    path.join(folder, 'examples', 'wrapped', 'index.html'),
    '<!DOCTYPE html><body><!-- shell --><iframe src="./inner.html" title="wrapped"></iframe></body>',
  );
  await writeFile(
    path.join(folder, 'examples', 'wrapped', 'inner.html'),
    '<!DOCTYPE html><title>wrapped</title><img src="./hero.png"><p>wrapped body</p>',
  );
  await writeFile(
    path.join(folder, 'open-design.json'),
    JSON.stringify({
      $schema: 'https://open-design.ai/schemas/plugin.v1.json',
      name: PLUGIN_ID,
      title: 'Preview fixture',
      version: '1.0.0',
      description: 'fixture',
      license: 'MIT',
      od: {
        kind: 'skill',
        capabilities: ['prompt:inject'],
        preview: { entry: 'preview/index.html' },
        useCase: {
          query: 'demo',
          exampleOutputs: [
            { path: 'examples/desk-warm/index.html', title: 'Desk warm' },
            { path: 'examples/wrapped/index.html', title: 'Wrapped shell' },
          ],
        },
      },
    }),
  );
  await writeFile(
    path.join(folder, 'SKILL.md'),
    `---\nname: ${PLUGIN_ID}\ndescription: preview fixture\n---\n# fixture\n`,
  );

  const started = (await startServer({ port: 0, returnServer: true })) as StartedServer;
  server = started.server;
  baseUrl = started.url;

  // Install via SSE — fully drain the stream so the success event
  // (which is what writes the installed_plugins row) lands before
  // we hit GET /api/plugins/:id.
  const installResp = await fetch(`${baseUrl}/api/plugins/install`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
    body: JSON.stringify({ source: folder }),
  });
  if (installResp.body) {
    const reader = installResp.body.getReader();
    let raw = '';
    const decoder = new TextDecoder();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      raw += decoder.decode(value);
    }
    // Sanity-check the SSE actually emitted a `success` event so the
    // test fails loudly if the installer didn't finalize.
    if (!raw.includes('event: success')) {
      throw new Error(`installer did not finalize:\n${raw}`);
    }
  }
});

afterEach(async () => {
  await new Promise((resolve, reject) => {
    if (!server) return resolve(undefined);
    server.close((error?: Error) => (error ? reject(error) : resolve(undefined)));
  });
  server = undefined;

  // Strip the test plugin row from the daemon's DB.
  try {
    const dbPath = path.join(serverRuntimeDataRoot, 'app.sqlite');
    const db = new Database(dbPath);
    db.prepare('DELETE FROM installed_plugins WHERE id = ?').run(PLUGIN_ID);
    db.close();
  } catch {
    // ignore — the DB might not exist in failure modes
  }

  await rm(pluginRoot, { recursive: true, force: true });
});

describe('GET /api/plugins/:id/preview', () => {
  it('serves preview/index.html with the §9.2 sandbox CSP', async () => {
    const resp = await fetch(`${baseUrl}/api/plugins/${PLUGIN_ID}/preview`);
    if (resp.status !== 200) {
      const text = await resp.text();
      throw new Error(`preview returned ${resp.status}: ${text}`);
    }
    expect(resp.status).toBe(200);
    expect(resp.headers.get('content-type')).toMatch(/text\/html/);
    const csp = resp.headers.get('content-security-policy') ?? '';
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("connect-src 'none'");
    expect(csp).not.toContain('https://cdn.tailwindcss.com');
    expect(resp.headers.get('x-content-type-options')).toBe('nosniff');
    const body = await resp.text();
    expect(body).toContain('preview body');
  });

  it('allows trusted bundled previews to load declared CDN assets while keeping fetch locked down', async () => {
    const dbPath = path.join(serverRuntimeDataRoot, 'app.sqlite');
    const db = new Database(dbPath);
    db.prepare(
      `UPDATE installed_plugins
       SET source_kind = 'bundled', trust = 'bundled'
       WHERE id = ?`,
    ).run(PLUGIN_ID);
    db.close();

    const resp = await fetch(`${baseUrl}/api/plugins/${PLUGIN_ID}/preview`);
    expect(resp.status).toBe(200);
    const csp = resp.headers.get('content-security-policy') ?? '';
    expect(csp).toContain('https://cdn.tailwindcss.com');
    expect(csp).toContain('https://fonts.googleapis.com');
    expect(csp).toContain('https://fonts.gstatic.com');
    expect(csp).toContain("connect-src 'none'");
  });

  it('returns 404 when the plugin id is unknown', async () => {
    const resp = await fetch(`${baseUrl}/api/plugins/does-not-exist/preview`);
    expect(resp.status).toBe(404);
  });
});

describe('GET /api/plugins/:id/example/:name', () => {
  it('matches a declared example by basename / stem / title', async () => {
    // Three lookup forms: the folder name (canonical), the
    // basename of the path inside the folder, and the declared title.
    for (const name of ['desk-warm', 'index.html', 'Desk warm']) {
      const resp = await fetch(
        `${baseUrl}/api/plugins/${PLUGIN_ID}/example/${encodeURIComponent(name)}`,
      );
      expect(resp.status, `lookup by ${name}`).toBe(200);
      expect(resp.headers.get('content-security-policy') ?? '').toContain("connect-src 'none'");
      const body = await resp.text();
      expect(body).toContain('example body');
    }
  });

  it('unwraps iframe-only HTML shells and rewrites relative assets', async () => {
    const resp = await fetch(`${baseUrl}/api/plugins/${PLUGIN_ID}/example/wrapped`);
    expect(resp.status).toBe(200);
    const body = await resp.text();
    expect(body).toContain('wrapped body');
    expect(body).not.toContain('<iframe');
    expect(body).toContain(
      `/api/plugins/${encodeURIComponent(PLUGIN_ID)}/asset/examples/wrapped/hero.png`,
    );
  });

  it('inlines the official Open Design GitHub metric so preview CSP can keep connect-src locked down', async () => {
    const dbPath = path.join(serverRuntimeDataRoot, 'app.sqlite');
    const db = new Database(dbPath);
    const row = db.prepare('SELECT fs_path, manifest_json FROM installed_plugins WHERE id = ?').get(PLUGIN_ID) as
      | { fs_path: string; manifest_json: string }
      | undefined;
    const manifest = JSON.parse(row?.manifest_json ?? '{}') as any;
    manifest.od.useCase.exampleOutputs.push({ path: 'examples/github.html', title: 'GitHub' });
    db.prepare(
      `UPDATE installed_plugins
       SET source_kind = 'bundled', trust = 'bundled', manifest_json = ?
       WHERE id = ?`,
    ).run(JSON.stringify(manifest), PLUGIN_ID);
    db.close();
    await writeFile(
      path.join(row!.fs_path, 'examples', 'github.html'),
      `<!DOCTYPE html><script>
        fetch('https://api.github.com/repos/nexu-io/open-design', {
          headers: { Accept: 'application/vnd.github+json' }
        }).then(function (r) { return r.json(); });
      </script>`,
    );

    const resp = await fetch(`${baseUrl}/api/plugins/${PLUGIN_ID}/example/github`);
    expect(resp.status).toBe(200);
    expect(resp.headers.get('content-security-policy') ?? '').toContain("connect-src 'none'");
    const body = await resp.text();
    expect(body).not.toContain('https://api.github.com/repos/nexu-io/open-design');
    expect(body).toContain('Promise.resolve({ ok:');
  });

  it('rejects traversal segments with 400', async () => {
    const resp = await fetch(`${baseUrl}/api/plugins/${PLUGIN_ID}/example/..%2Fescape`);
    expect(resp.status).toBe(400);
  });

  it('returns 404 for an unknown example name', async () => {
    const resp = await fetch(`${baseUrl}/api/plugins/${PLUGIN_ID}/example/missing-thing`);
    expect(resp.status).toBe(404);
  });
});
