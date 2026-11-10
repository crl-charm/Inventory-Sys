import type { IncomingMessage } from "node:http";
import { AppError, ValidationError } from "./errors";

// A 200-line sales batch is well below this bound. Check received bytes too,
// because chunked requests need not declare Content-Length.
export const MAX_BODY_BYTES = 1024 * 1024;

export function readRequestBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      chunks.length = 0;
      req.resume(); // Drain without retaining the remainder so a 413 can reach the client.
      reject(error);
    };
    const tooLarge = () => new AppError("VALIDATION_ERROR", 413, "Request body is too large (maximum 1 MiB).");
    req.on("data", (chunk: Buffer) => {
      if (settled) return;
      size += chunk.length;
      if (size > MAX_BODY_BYTES) return fail(tooLarge());
      chunks.push(chunk);
    });
    req.once("end", () => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks));
    });
    req.once("error", fail);
    req.once("aborted", () => fail(new ValidationError("Request body was interrupted.")));
    if (Number(req.headers["content-length"]) > MAX_BODY_BYTES) fail(tooLarge());
  });
}
