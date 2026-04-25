export function parseRedisJson<T>(value: unknown): T | null {
  if (value == null) return null;
  if (typeof value === "string") {
    return JSON.parse(value) as T;
  }
  return value as T;
}

export function parseRedisArray<T>(value: unknown): T[] {
  const parsed = parseRedisJson<unknown>(value);
  return Array.isArray(parsed) ? (parsed as T[]) : [];
}
