import { IntegrationError, type IntegrationSystem } from "./errors.ts";

// A tiny runtime schema lib: each integration declares the shapes it reads, and types come from them.
// An issue names a path and two types, never a value: responses can hold titles, tokens or keys.
export interface Issue {
  path: string;
  expected: string;
  actual: string;
}

export interface Schema<T> {
  readonly expected: string;
  check(value: unknown, path: string, out: Issue[]): void;
  /** Carries the type only: never set at runtime. */
  readonly type?: T;
}

interface Optional<T> extends Schema<T | undefined> {
  readonly optional: true;
}

export type Infer<S> = S extends Schema<infer T> ? T : never;

type Fields = Record<string, Schema<unknown>>;
type Flat<T> = { [K in keyof T]: T[K] };
type OptionalKeys<F> = { [K in keyof F]: F[K] extends Optional<unknown> ? K : never }[keyof F];
type Shape<F extends Fields> = Flat<{ [K in Exclude<keyof F, OptionalKeys<F>>]: Infer<F[K]> } & { [K in OptionalKeys<F>]?: Infer<F[K]> }>;
type Variants<K extends string, M extends Record<string, Schema<unknown>>> = { [V in keyof M]: Flat<{ [P in K]: V } & Infer<M[V]>> }[keyof M];

const ROOT = "(root)";
const kindOf = (value: unknown): string => (value === null ? "null" : Array.isArray(value) ? "array" : typeof value);
const child = (path: string, key: string): string => (path === "" ? key : `${path}.${key}`);
const miss = (out: Issue[], path: string, expected: string, value: unknown): void => void out.push({ path: path || ROOT, expected, actual: kindOf(value) });
const isRecord = (value: unknown): value is Record<string, unknown> => kindOf(value) === "object";

const primitive = <T>(name: "string" | "number" | "boolean"): Schema<T> => ({
  expected: name,
  check: (value, path, out) => (typeof value === name ? undefined : miss(out, path, name, value)),
});

export const s = {
  string: () => primitive<string>("string"),
  number: () => primitive<number>("number"),
  boolean: () => primitive<boolean>("boolean"),
  unknown: (): Schema<unknown> => ({ expected: "anything", check: () => {} }),

  literal: <V extends string>(literal: V): Schema<V> => ({
    expected: JSON.stringify(literal),
    check: (value, path, out) => (value === literal ? undefined : miss(out, path, JSON.stringify(literal), value)),
  }),

  optional: <T>(inner: Schema<T>): Optional<T> => ({
    optional: true,
    expected: inner.expected,
    check: (value, path, out) => (value === undefined ? undefined : inner.check(value, path, out)),
  }),

  nullable: <T>(inner: Schema<T>): Schema<T | null> => ({
    expected: `${inner.expected} or null`,
    check(value, path, out) {
      if (value === null) return;
      const found: Issue[] = [];
      inner.check(value, path, found);
      out.push(...found.map((issue) => (issue.path === (path || ROOT) ? { ...issue, expected: `${issue.expected} or null` } : issue)));
    },
  }),

  array: <T>(item: Schema<T>): Schema<T[]> => ({
    expected: "array",
    check(value, path, out) {
      if (!Array.isArray(value)) return miss(out, path, "array", value);
      value.forEach((entry, index) => item.check(entry, `${path}[${index}]`, out));
    },
  }),

  /** Keys that are not listed are ignored: T3 and Linear add fields all the time. */
  object: <F extends Fields>(fields: F): Schema<Shape<F>> => ({
    expected: "object",
    check(value, path, out) {
      if (!isRecord(value)) return miss(out, path, "object", value);
      for (const [key, schema] of Object.entries(fields)) schema.check(value[key], child(path, key), out);
    },
  }),

  // When every branch fails on the value itself, one issue lists them all; else the closest branch speaks.
  union: <A, B>(a: Schema<A>, b: Schema<B>): Schema<A | B> => {
    const expected = `${a.expected} or ${b.expected}`;
    return {
      expected,
      check(value, path, out) {
        const tries = [a, b].map((schema) => {
          const found: Issue[] = [];
          schema.check(value, path, found);
          return found;
        });
        if (tries.some((found) => found.length === 0)) return;
        if (tries.every((found) => found.some((issue) => issue.path === (path || ROOT)))) return miss(out, path, expected, value);
        out.push(...tries.reduce((best, found) => (found.length < best.length ? found : best)));
      },
    };
  },

  /** Checks the branch named by `key`; an unknown name passes, since T3 adds kinds that consumers skip. */
  variant: <K extends string, M extends Record<string, Schema<unknown>>>(key: K, branches: M): Schema<Variants<K, M>> => ({
    expected: "object",
    check(value, path, out) {
      if (!isRecord(value)) return miss(out, path, "object", value);
      const name = value[key];
      if (typeof name !== "string") return miss(out, child(path, key), "string", name);
      if (Object.hasOwn(branches, name)) branches[name]!.check(value, path, out);
    },
  }),
};

export function issues(schema: Schema<unknown>, value: unknown): Issue[] {
  const out: Issue[] = [];
  schema.check(value, "", out);
  return out;
}

export const matches = <T>(schema: Schema<T>, value: unknown): value is T => issues(schema, value).length === 0;

export const describe = ({ path, expected, actual }: Issue): string => `${path} should be ${expected}, got ${actual}`;

/** Returns the value typed by its schema, or throws a protocol error that names the first wrong field. */
export function parse<T>(schema: Schema<T>, value: unknown, { system, what }: { system: IntegrationSystem; what: string }): T {
  const [first] = issues(schema, value);
  if (first) throw new IntegrationError(`Unexpected ${what}: ${describe(first)}`, { system, kind: "protocol" });
  return value as T;
}
