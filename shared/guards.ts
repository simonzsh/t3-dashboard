// Type guards for untrusted values: request bodies, files and browser storage.

export const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** The strings of an array, once each in first-seen order, capped; [] when the value is not an array. */
export function uniqueStrings(value: unknown, max = Infinity): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((v): v is string => typeof v === "string"))].slice(0, max);
}
