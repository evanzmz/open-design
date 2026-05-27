/**
 * Centralized basePath-aware path construction for the web app.
 *
 * Next.js sets `basePath` in `next.config.ts` and injects it into
 * `window.__NEXT_DATA__.basePath` at runtime.  Every place that builds a
 * URL for fetch, EventSource, static assets, or page navigation must go
 * through these helpers so the prefix is applied consistently.
 */

const DAEMON_RESOURCE_PREFIXES = ['/api', '/artifacts', '/frames'] as const;

function normalizeBasePath(value: string | null | undefined): string {
  if (!value || value === '/') return '';
  const prefixed = value.startsWith('/') ? value : `/${value}`;
  return prefixed.replace(/\/+$/u, '');
}

const STATIC_BASE_PATH = normalizeBasePath(
  process.env.NEXT_PUBLIC_OD_BASE_PATH ?? process.env['NEXT_PUBLIC_OD_BASE_PATH'],
);

/** Read the runtime basePath injected by Next.js, falling back to the static deployment prefix. */
export function getBasePath(): string {
  if (typeof window === 'undefined') return STATIC_BASE_PATH;
  const basePath = (window as any).__NEXT_DATA__?.basePath;
  if (typeof basePath !== 'string') return STATIC_BASE_PATH;
  return normalizeBasePath(basePath);
}

/** Prepend basePath to an API URL.  `path` must start with `/`. */
export function apiUrl(path: string): string {
  if (!path.startsWith('/')) return path;
  return getBasePath() + path;
}

function hasPathPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function isDaemonResourcePath(pathname: string): boolean {
  return DAEMON_RESOURCE_PREFIXES.some((prefix) => hasPathPrefix(pathname, prefix));
}

/** Prepend basePath to same-origin daemon resource paths, without double-prefixing. */
export function daemonResourceUrl(url: string): string {
  if (!url.startsWith('/') || url.startsWith('//')) return url;
  const bp = getBasePath();
  if (bp && hasPathPrefix(url, bp)) return url;
  if (!isDaemonResourcePath(url)) return url;
  return bp + url;
}

function isApiPathForBasePath(pathname: string, basePath: string): boolean {
  if (!basePath) return hasPathPrefix(pathname, '/api');
  if (!hasPathPrefix(pathname, basePath)) return false;
  return hasPathPrefix(pathname.slice(basePath.length) || '/', '/api');
}

/** True when a URL points at the same-origin daemon API for the active basePath. */
export function isSameOriginApiUrl(url: unknown): boolean {
  if (typeof url !== 'string') return false;
  const bp = getBasePath();
  if (url.startsWith('/') && !url.startsWith('//')) return isApiPathForBasePath(url, bp);
  if (typeof window === 'undefined') return false;
  try {
    const parsed = new URL(url, window.location.origin);
    if (parsed.origin !== window.location.origin) return false;
    return isApiPathForBasePath(parsed.pathname, bp);
  } catch {
    return false;
  }
}

/** Prepend basePath to a static asset URL.  `path` must start with `/`. */
export function assetUrl(path: string): string {
  if (!path.startsWith('/')) return path;
  return getBasePath() + path;
}

/** Prepend basePath to a page route URL.  `path` must start with `/`. */
export function pageUrl(path: string): string {
  if (!path.startsWith('/')) return path;
  return getBasePath() + path;
}

/** Strip the basePath prefix from a pathname.  Used by the custom router. */
export function stripBasePath(pathname: string): string {
  const bp = getBasePath();
  if (!bp || (pathname !== bp && !pathname.startsWith(`${bp}/`))) return pathname;
  return pathname.slice(bp.length) || '/';
}
