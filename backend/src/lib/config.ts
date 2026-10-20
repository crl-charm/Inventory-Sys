/**
 * Startup configuration check. Only enforced when NODE_ENV=production (Render),
 * so the shop PC's local setup (XAMPP, no NODE_ENV) keeps working unchanged.
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
  "FRONTEND_ORIGIN",
] as const;

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);

export function checkConfig(env: NodeJS.ProcessEnv = process.env): ConfigReport {
  const report: ConfigReport = { errors: [], warnings: [] };
  if (env.NODE_ENV !== "production") return report;

  for (const name of REQUIRED_IN_PRODUCTION) {
    if (!env[name] || env[name]?.trim() === "") {
      report.errors.push(
        `${name} is not set. Add it in Render → rgarage-api → Environment.`
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

  if (env.FRONTEND_ORIGIN && /localhost|127\.0\.0\.1/.test(env.FRONTEND_ORIGIN) && !/onrender\.com|https:\/\//.test(env.FRONTEND_ORIGIN)) {
    report.warnings.push(
      "FRONTEND_ORIGIN only lists localhost; browser POST/PATCH calls from the Render UI will be rejected (403)."
    );
  }

  if (env.HOST && env.HOST !== "0.0.0.0") {
    report.warnings.push("HOST should be 0.0.0.0 on Render so the service is reachable.");
  } else if (!env.HOST) {
    report.errors.push("HOST is not set; it defaults to 127.0.0.1, which Render cannot reach. Set HOST=0.0.0.0.");
  }

  return report;
}
