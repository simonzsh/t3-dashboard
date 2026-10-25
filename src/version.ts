declare const BUILD_VERSION: string | undefined;

export const VERSION = typeof BUILD_VERSION === "string" ? BUILD_VERSION : "dev";
