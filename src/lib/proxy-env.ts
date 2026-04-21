const PROXY_ENV_KEYS = [
  'ALL_PROXY',
  'all_proxy',
  'HTTP_PROXY',
  'http_proxy',
  'HTTPS_PROXY',
  'https_proxy',
  'NO_PROXY',
  'no_proxy',
] as const

type EnvLike = Record<string, string | undefined>

export function withoutProxyEnv(
  env: EnvLike = process.env,
  overrides: EnvLike = {},
): EnvLike {
  const sanitized: EnvLike = { ...env }

  for (const key of PROXY_ENV_KEYS) {
    delete sanitized[key]
  }

  return {
    ...sanitized,
    ...overrides,
  }
}
