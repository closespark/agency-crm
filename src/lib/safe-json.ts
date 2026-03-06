/**
 * Safe JSON.parse wrapper that returns a default value instead of throwing.
 * Use across all AI engine code where we parse LLM output or stored JSON.
 */
export function safeParseJSON<T>(
  input: string | null | undefined,
  fallback: T
): T {
  if (!input) return fallback;
  try {
    return JSON.parse(input) as T;
  } catch {
    console.warn("[safeParseJSON] Failed to parse:", input.slice(0, 200));
    return fallback;
  }
}
