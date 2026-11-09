export type UpdateChannel = "stable" | "main";

export const isMainVersion = (version: string): boolean => /^main-[0-9a-f]{40}$/.test(version);

export const displayVersion = (version: string): string => isMainVersion(version) ? `main ${version.slice(5, 12)}` : version;
