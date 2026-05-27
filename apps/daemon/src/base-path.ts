export function normalizeDaemonBasePath(value: string | null | undefined): string {
  if (!value || value === '/') return '';
  const prefixed = value.startsWith('/') ? value : `/${value}`;
  return prefixed.replace(/\/+$/u, '');
}

export function getDaemonBasePath(env: NodeJS.ProcessEnv = process.env): string {
  return normalizeDaemonBasePath(env.OD_BASE_PATH);
}

export function withDaemonBasePath(pathname: string, env: NodeJS.ProcessEnv = process.env): string {
  const basePath = getDaemonBasePath(env);
  if (!basePath) return pathname;
  return `${basePath}${pathname.startsWith('/') ? pathname : `/${pathname}`}`;
}
