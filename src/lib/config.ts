/**
 * Startup configuration check for cloud production (Render).
 * Local shop PC setups (XAMPP) keep working unchanged.
 * Returns variable NAMES only — never values.
 */

export interface ConfigReport {
  errors: string[];
  warnings: string[];
}

const REQUIRED_IN_PRODUCTION = [
  "DB_HOST",
  "DB_PORT",
  "DB_USER",
  "DB_PASSWORD",
  "DB_NAME",
  "AUTH_SECRET",
] as const;

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);

export function checkConfig(env: NodeJS.ProcessEnv = process.env): ConfigReport {
  const report: ConfigReport = { errors: [], warnings: [] };
  if (env.NODE_ENV !== "production") return report;

  for (const name of REQUIRED_IN_PRODUCTION) {
    if (!env[name] || env[name]?.trim() === "") {
      report.errors.push(
        `${name} is not set. Add it in Render → rgarage-web → Environment.`
      );
    }
  }

  if (env.AUTH_SECRET && env.AUTH_SECRET.length < 32) {
    report.errors.push("AUTH_SECRET must be at least 32 characters.");
  }

  if (env.DB_HOST && LOCAL_HOSTS.has(env.DB_HOST.trim().toLowerCase())) {
    report.errors.push(
      "DB_HOST points at localhost, which does not exist on Render. Use the Aiven host name."
    );
  }

  if (env.DB_SSL !== "true") {
    report.warnings.push("DB_SSL is not 'true'; Aiven requires TLS connections.");
  } else if (!env.DB_SSL_CA) {
    report.warnings.push(
      "DB_SSL_CA is not set; the database certificate will not be verified."
    );
  }

  return report;
}
