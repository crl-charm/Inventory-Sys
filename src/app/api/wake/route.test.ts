import { afterEach, expect, it, vi } from "vitest";
import * as db from "@/lib/db";
import { GET } from "./route";

afterEach(() => {
  vi.restoreAllMocks();
});

it("checks database readiness in-process without relying on authentication", async () => {
  const spy = vi.spyOn(db, "isDatabaseReady").mockResolvedValue(true);
  expect(await (await GET()).json()).toEqual({ ready: true });
  expect(spy).toHaveBeenCalledTimes(1);
});

it("returns ready: false when the database is unavailable or throws", async () => {
  vi.spyOn(db, "isDatabaseReady")
    .mockResolvedValueOnce(false)
    .mockRejectedValueOnce(new Error("offline"));
  expect(await (await GET()).json()).toEqual({ ready: false });
  expect(await (await GET()).json()).toEqual({ ready: false });
});
