const SIMPLE_PATTERNS: RegExp[] = [
  /sk-[a-zA-Z0-9\-_]{20,}/g,
  /Bearer\s+[a-zA-Z0-9\-_.~+/]+=*/g,
];

export function redactSecrets(text: string): string {
  let result = SIMPLE_PATTERNS.reduce(
    (acc, pattern) => acc.replace(pattern, '[REDACTED]'),
    text,
  );
  // Replace URL passwords: :password@ → :[REDACTED]@
  result = result.replace(/:([^:@\s]{16,})@/g, ':[REDACTED]@');
  return result;
}
