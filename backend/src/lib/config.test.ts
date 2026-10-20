import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkConfig } from "./config";

const good = {
  NODE_ENV: "production",
  HOST: "0.0.0.0",
  DB_HOST: "mysql-abc.aivencloud.com",
  DB_PORT: "12345",
  DB_USER: "avnadmin",
  DB_PASSWORD: "x",
  DB_NAME: "defaultdb",
  DB_SSL: "true",
  DB_SSL_CA: "-----BEGIN CERTIFICATE-----",
  AUTH_SECRET: "a".repeat(48),
  FRONTEND_ORIGIN: "https://rgarage-web.onrender.com",
} as NodeJS.ProcessEnv;

describe("checkConfig", () => {
  it("is silent outside production (shop PC keeps working)", () => {
    assert.deepEqual(checkConfig({ NODE_ENV: "development" } as NodeJS.ProcessEnv), {
      errors: [],
      warnings: [],
    });
    assert.deepEqual(checkConfig({} as NodeJS.ProcessEnv), { errors: [], warnings: [] });
  });

  it("accepts a complete production config", () => {
    assert.deepEqual(checkConfig(good), { errors: [], warnings: [] });
  });

  it("names each missing variable and never prints values", () => {
    const report = checkConfig({ NODE_ENV: "production" } as NodeJS.ProcessEnv);
    for (const name of ["DB_HOST", "DB_PASSWORD", "AUTH_SECRET", "FRONTEND_ORIGIN", "HOST"]) {
      assert.ok(report.errors.some((e) => e.includes(name)), name);
    }
  });

  it("rejects a localhost database and a short secret", () => {
    const report = checkConfig({ ...good, DB_HOST: "localhost", AUTH_SECRET: "short" });
    assert.ok(report.errors.some((e) => e.includes("DB_HOST")));
    assert.ok(report.errors.some((e) => e.includes("AUTH_SECRET")));
    assert.ok(!JSON.stringify(report).includes("short"));
  });

  it("warns (but starts) when TLS settings are weak", () => {
    const report = checkConfig({ ...good, DB_SSL_CA: "" });
    assert.equal(report.errors.length, 0);
    assert.ok(report.warnings.some((w) => w.includes("DB_SSL_CA")));
  });
});
