import {
  loadRuntimeConfig,
  runtimeWarnings,
  type RuntimeConfig,
} from "@memora/storage";

export interface AppConfig extends RuntimeConfig {
  port: number;
}

export function createConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const runtime = loadRuntimeConfig(env);
  const portRaw = Number(env.API_PORT ?? "3001");
  return {
    ...runtime,
    port: Number.isFinite(portRaw) && portRaw > 0 ? Math.trunc(portRaw) : 3001,
  };
}

export const config = createConfig();

export function logDeployWarnings(current: AppConfig = config): void {
  for (const warning of runtimeWarnings(current)) {
    console.warn(`[memora-api] ${warning}`);
  }
}
