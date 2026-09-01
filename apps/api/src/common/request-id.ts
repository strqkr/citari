import { randomUUID } from "node:crypto";

const SAFE_REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/;
export function resolveRequestId(value: string | string[] | undefined): string {
  return typeof value === "string" && SAFE_REQUEST_ID.test(value) ? value : randomUUID();
}
