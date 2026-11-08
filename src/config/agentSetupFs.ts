import { lstat, open, readdir, readlink, stat } from "node:fs/promises";
import { posix } from "node:path";

export interface SetupFsEntry {
  kind: "file" | "dir" | "other" | "missing";
  size: number;
  symlink: boolean;
  linkTarget?: string;
}

/** The read-only file access of the setup inventory: injected, so tests and the demo never touch the disk. */
export interface SetupFs {
  /** lstat + stat: a symlink whose target is missing => { kind: "missing", symlink: true, linkTarget }. Missing path => null. */
  entry(path: string): Promise<SetupFsEntry | null>;
  /** Reads at most maxBytes (utf8). Throws on unreadable. */
  readText(path: string, maxBytes: number): Promise<{ text: string; truncated: boolean }>;
  /** Entry names, sorted; [] when missing or not a dir. */
  list(dir: string): Promise<string[]>;
}

const sorted = (names: string[]) => [...names].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

export function nodeSetupFs(): SetupFs {
  return {
    async entry(path) {
      const link = await lstat(path).catch(() => null);
      if (!link) return null;
      if (!link.isSymbolicLink()) return { kind: link.isFile() ? "file" : link.isDirectory() ? "dir" : "other", size: link.size, symlink: false };
      const linkTarget = await readlink(path).catch(() => null);
      const target = await stat(path).catch(() => null);
      const kind = !target ? "missing" : target.isFile() ? "file" : target.isDirectory() ? "dir" : "other";
      return { kind, size: target?.size ?? 0, symlink: true, ...(linkTarget === null ? {} : { linkTarget }) };
    },
    async readText(path, maxBytes) {
      const handle = await open(path, "r");
      try {
        const { size } = await handle.stat();
        const buffer = Buffer.alloc(Math.min(size, maxBytes));
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
        return { text: buffer.subarray(0, bytesRead).toString("utf8"), truncated: size > maxBytes };
      } finally {
        await handle.close();
      }
    },
    async list(dir) {
      return sorted(await readdir(dir).catch(() => []));
    },
  };
}

/** In-memory files for the demo and the tests; folders exist where a path implies them. */
export function memorySetupFs(files: Record<string, string>, links: Record<string, string> = {}): SetupFs {
  const resolve = (path: string): string => (path in links ? (links[path] as string) : path);
  const dirs = new Set<string>();
  for (const path of [...Object.keys(files), ...Object.keys(links)]) {
    for (let dir = posix.dirname(path); !dirs.has(dir); dir = posix.dirname(dir)) {
      dirs.add(dir);
      if (dir === "/" || dir === ".") break;
    }
  }
  return {
    async entry(path) {
      const target = resolve(path);
      const symlink = path in links;
      const link = symlink ? { linkTarget: target } : {};
      if (target in files) return { kind: "file", size: Buffer.byteLength(files[target]!), symlink, ...link };
      if (dirs.has(target)) return { kind: "dir", size: 0, symlink, ...link };
      return symlink ? { kind: "missing", size: 0, symlink, ...link } : null;
    },
    async readText(path, maxBytes) {
      const text = files[resolve(path)];
      if (text === undefined) throw new Error(`ENOENT: ${path}`);
      const bytes = Buffer.from(text);
      return { text: bytes.subarray(0, maxBytes).toString("utf8"), truncated: bytes.length > maxBytes };
    },
    async list(dir) {
      const prefix = dir === "/" ? "/" : `${dir}/`;
      const names = new Set<string>();
      for (const path of [...Object.keys(files), ...Object.keys(links)]) {
        if (path.startsWith(prefix)) names.add(path.slice(prefix.length).split("/")[0]!);
      }
      return sorted([...names]);
    },
  };
}
