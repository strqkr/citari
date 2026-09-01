export function redactSensitiveUrl(url: string): string {
  return url.replace(/(\/public\/tracking\/)[^/?]+/g, "$1[REDACTED]");
}
