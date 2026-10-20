import { checkConfig } from "./lib/config";
import { log } from "./lib/logger";

/**
 * Imported by server.ts right after ./load-env and BEFORE any module that
 * touches the database, so a bad production configuration produces one clear
 * log line (variable names only) instead of a stack trace from deep inside
 * the pool setup — and the deploy fails visibly instead of half-working.
 */
const report = checkConfig();
for (const warning of report.warnings) {
  log("warn", "config_warning", { message: warning });
}
if (report.errors.length > 0) {
  log("error", "config_invalid", { problems: report.errors });
  process.exit(1);
}
