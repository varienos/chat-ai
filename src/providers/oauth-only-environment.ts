const GATEWAY_BLOCKED_ENV_KEYS = [
  "API_AUTH_TOKEN",
  "DATABASE_URL",
  "DECK_ADMIN_PASSWORD",
  "DECK_JWT_SECRET",
  "REDIS_URL",
];

export function buildOauthOnlyEnvironment(variablesToUnset: string[]) {
  const environment = {
    ...process.env,
  };

  for (const variableName of new Set([
    ...GATEWAY_BLOCKED_ENV_KEYS,
    ...variablesToUnset,
  ])) {
    delete environment[variableName];
  }

  return environment;
}
