import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import type { IncomingMessage } from "node:http";
import { test } from "vitest";
import { MAX_BODY_BYTES, readRequestBody } from "./request-body";

function request(headers = {}): IncomingMessage & PassThrough {
  return Object.assign(new PassThrough(), { headers }) as IncomingMessage & PassThrough;
}

test("request bodies are bounded for declared and chunked uploads", async () => {
  const normal = request();
  const body = readRequestBody(normal);
  normal.end('{"items":[]}');
  assert.equal((await body).toString(), '{"items":[]}');

  const declared = request({ "content-length": String(MAX_BODY_BYTES + 1) });
  await assert.rejects(readRequestBody(declared), (error: unknown) =>
    (error as { status?: number }).status === 413
  );
  declared.end();

  const chunked = request();
  const rejected = assert.rejects(readRequestBody(chunked), (error: unknown) =>
    (error as { status?: number }).status === 413
  );
  chunked.write(Buffer.alloc(MAX_BODY_BYTES));
  chunked.end("x");
  await rejected;

  const interrupted = request();
  const aborted = assert.rejects(readRequestBody(interrupted), /interrupted/);
  interrupted.emit("aborted");
  interrupted.end();
  await aborted;
});
