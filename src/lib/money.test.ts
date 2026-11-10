import assert from "node:assert/strict";
import { test } from "vitest";
import * as money from "./money";
import { isValidDateString } from "./dates";

test("money and quantity helpers agree at rounding and storage boundaries", () => {
  for (const [quantity, price, expected] of [
    ["2.500", "3.25", "8.13"], ["0.001", "5.00", "0.01"], ["0.001", "4.99", "0.00"],
    ["999999999.999", "0.01", "10000000.00"],
  ]) {
    assert.equal(money.centavosToMoneyString(money.computeLineTotalCentavos(quantity!, price!)), expected);
  }
  for (const invalid of ["NaN", "Infinity", "-1", "1e3", "0.0001"]) {
    assert.throws(() => money.parseQuantityToThousandths(invalid));
  }
});

test("business dates reject impossible dates and years outside MySQL storage", () => {
  for (const invalid of ["0000-01-01", "0099-01-01", "0999-12-31", "2026-02-29", "2026-04-31"]) {
    assert.equal(isValidDateString(invalid), false);
  }
  assert.equal(isValidDateString("1000-01-01"), true);
  assert.equal(isValidDateString("2024-02-29"), true);
});
