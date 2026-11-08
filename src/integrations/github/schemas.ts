import { s } from "../contract.ts";

export const LatestRelease = s.object({ tag_name: s.string() });
