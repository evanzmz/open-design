import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type WebPathModule = typeof import('../../src/utils/web-path');

describe('web path helpers', () => {
  let daemonResourceUrl: WebPathModule['daemonResourceUrl'];
  let isSameOriginApiUrl: WebPathModule['isSameOriginApiUrl'];

  beforeEach(async () => {
    vi.resetModules();
    vi.stubGlobal('window', {
      location: {
        origin: 'http://localhost:3000',
      },
      __NEXT_DATA__: {
        basePath: '/od',
      },
    });
    ({ daemonResourceUrl, isSameOriginApiUrl } = await import('../../src/utils/web-path'));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('prepends the Next basePath to same-origin daemon resource paths', () => {
    expect(daemonResourceUrl('/api/version')).toBe('/od/api/version');
    expect(daemonResourceUrl('/artifacts/p1/image.png')).toBe('/od/artifacts/p1/image.png');
    expect(daemonResourceUrl('/frames/demo/index.html')).toBe('/od/frames/demo/index.html');
  });

  it('does not double-prefix or rewrite non-daemon paths', () => {
    expect(daemonResourceUrl('/od/api/version')).toBe('/od/api/version');
    expect(daemonResourceUrl('/odish/api/version')).toBe('/odish/api/version');
    expect(daemonResourceUrl('/marketplace/plugin')).toBe('/marketplace/plugin');
    expect(daemonResourceUrl('https://example.com/api/version')).toBe('https://example.com/api/version');
    expect(daemonResourceUrl('//example.com/api/version')).toBe('//example.com/api/version');
  });

  it('recognizes same-origin API URLs under the active basePath', () => {
    expect(isSameOriginApiUrl('/od/api/version')).toBe(true);
    expect(isSameOriginApiUrl('http://localhost:3000/od/api/version')).toBe(true);
    expect(isSameOriginApiUrl('/api/version')).toBe(false);
    expect(isSameOriginApiUrl('http://localhost:3000/api/version')).toBe(false);
  });

  it('rejects third-party and basePath-like API URLs', () => {
    expect(isSameOriginApiUrl('https://provider.example/api/version')).toBe(false);
    expect(isSameOriginApiUrl('/odish/api/version')).toBe(false);
    expect(isSameOriginApiUrl('/marketplace/api/version')).toBe(false);
  });

  it('uses unprefixed daemon resource paths when Next has no basePath', () => {
    vi.stubGlobal('window', {
      location: {
        origin: 'http://localhost:3000',
      },
      __NEXT_DATA__: {
        basePath: '',
      },
    });

    expect(daemonResourceUrl('/api/version')).toBe('/api/version');
    expect(isSameOriginApiUrl('/api/version')).toBe(true);
  });
});

describe('web path helper injected basePath fallback', () => {
  const previousBasePath = process.env.NEXT_PUBLIC_OD_BASE_PATH;

  afterEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    if (previousBasePath == null) {
      delete process.env.NEXT_PUBLIC_OD_BASE_PATH;
    } else {
      process.env.NEXT_PUBLIC_OD_BASE_PATH = previousBasePath;
    }
  });

  it('uses the client-visible env when Next data has no basePath', async () => {
    process.env.NEXT_PUBLIC_OD_BASE_PATH = '/od';
    vi.stubGlobal('window', {
      location: {
        origin: 'http://localhost:3000',
      },
      __NEXT_DATA__: {},
    });

    const { daemonResourceUrl, isSameOriginApiUrl } = await import('../../src/utils/web-path');

    expect(daemonResourceUrl('/api/version')).toBe('/od/api/version');
    expect(isSameOriginApiUrl('/od/api/version')).toBe(true);
    expect(isSameOriginApiUrl('/api/version')).toBe(false);
  });
});
