/**
 * Centralized basePath-aware path construction for the web app.
 *
 * Next.js sets `basePath` in `next.config.ts` and injects it into
 * `window.__NEXT_DATA__.basePath` at runtime.  Every place that builds a
 * URL for fetch, EventSource, static assets, or page navigation must go
 * through these helpers so the prefix is applied consistently.
 */

const STATIC_BASE_PATH = '/open-design';

/** Read the runtime basePath injected by Next.js, falling back to the static deployment prefix. */
export function getBasePath(): string {
  if (typeof window === 'undefined') return STATIC_BASE_PATH;
  const basePath = (window as any).__NEXT_DATA__?.basePath;
  if (typeof basePath !== 'string' || !basePath.startsWith('/')) return STATIC_BASE_PATH;
  return basePath.replace(/\/+$/u, '');
}

/** Prepend basePath to an API URL.  `path` must start with `/`. */
export function apiUrl(path: string): string {
  if (!path.startsWith('/')) return path;
  return getBasePath() + path;
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
