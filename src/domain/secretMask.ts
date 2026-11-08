import type { JsonValue } from "../../shared/agentSetup.ts";

/** A fixed text: it shows no part of the value and no length. */
export const MASK = "••••••";

const SECRET_WORDS = new Set([
  "token", "secret", "password", "passwd", "pwd", "pass", "passphrase", "key", "apikey", "auth", "authorization", "bearer",
  "cookie", "credential", "credentials", "session", "sig", "signature", "private", "jwt", "dsn",
]);
// auth is a whole word only ("oauth" is not a secret by its ending); "compass" and "bypass" are words, not DBPASS.
const SECRET_SUFFIXES = ["key", "token", "secret", "password", "passwd", "credentials", "pwd", "pass"];
const PASS_WORDS = /(?:com|by|tres|encom|sur|over|under)pass$/;
const LIMIT_WORDS = new Set(["limit", "count", "max", "size", "timeout", "tokens"]);
// Header names without a hyphen that still open a header line.
const PLAIN_HEADERS = new Set(["authorization", "cookie", "bearer"]);
// Their values are the names of environment variables, not secrets.
const ENV_NAME_KEYS = new Set(["bearer_token_env_var", "env_vars", "env_var", "env_http_headers", "env_key"]);
// A number under these keys is a limit, not a secret.
const SAFE_VALUES = /^(oauth|chatgpt|none|null|true|false|bearer|basic|env)$/i;
const SCHEME_WORD = /^(bearer|basic|token)\s+/i;
const PREFIXES = "(?:sk[-_]|pk_|rk_|gh[pousr]_|github_pat_|glpat-|xox[abprs]-|ya29\\.|lin_api_|ntn_|secret_|shpat_|hf_|npm_)";
const KNOWN_PREFIX = new RegExp(`^${PREFIXES}.`);
const PREFIX_BODY = new RegExp(`^${PREFIXES}(.*)$`);
// Short prefixes also open ordinary words, so they need the shape of a real key.
const SHAPED_PREFIX = /^(?:(?:AKIA|ASIA)[A-Z0-9]{12,}|AIza[\w-]{20,})$/;
const JWT = /^eyJ[\w-]+\.[\w-]+\.[\w-]*$/;
const ENTROPY_CHARS = /^[A-Za-z0-9+/=_\-.~]+$/;
const HEADER = /\b(authorization|x-api-key|api-key|x-auth-token|cookie)(\s*[:=]\s*)(bearer\s+|basic\s+|token\s+)?([^\s"',]+)/gi;
const URL_START = /^[a-z][a-z0-9+.-]*:\/\//i;
const URL_PARTS = /^([a-z][a-z0-9+.-]*:\/\/)([^/?#]*)([^?#]*)(\?[^#]*)?(#.*)?$/i;

const words = (key: string): string[] => key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").split(/[-_. ]+/).map((word) => word.toLowerCase());

export function isSecretKey(key: string): boolean {
  const list = words(key);
  const last = list[list.length - 1] ?? "";
  return list.some((word) => SECRET_WORDS.has(word)) || (!PASS_WORDS.test(last) && SECRET_SUFFIXES.some((suffix) => last.endsWith(suffix))) || key.toLowerCase() === "oauth";
}

// A limit is a size, not a secret: judged by words, so tokenLimit and TOKEN_LIMIT both count.
const isLimitKey = (key: string | null): boolean => {
  if (key === null) return false;
  const list = words(key);
  return LIMIT_WORDS.has(list[list.length - 1] ?? "") || list[0] === "max";
};

const isEnvNameKey = (key: string | null): boolean => key !== null && ENV_NAME_KEYS.has(key.toLowerCase());

/** Nothing but ${NAME} / $NAME references (and a scheme word) is left: the value holds no secret. */
function isReferenceOnly(value: string): boolean {
  return value.replace(SCHEME_WORD, "").replace(/\$\{[A-Za-z_]\w*\}|\$[A-Za-z_]\w*/g, "").trim() === "";
}

function entropy(text: string): number {
  const counts = new Map<string, number>();
  for (const char of text) counts.set(char, (counts.get(char) ?? 0) + 1);
  let bits = 0;
  for (const count of counts.values()) bits -= (count / text.length) * Math.log2(count / text.length);
  return bits;
}

export function looksSecret(word: string): boolean {
  const bare = word.replace(SCHEME_WORD, "");
  if (KNOWN_PREFIX.test(bare) || SHAPED_PREFIX.test(bare) || JWT.test(bare)) return true;
  if (word.length < 24 || !ENTROPY_CHARS.test(word) || /^(\/|\.\/|\.\.\/|~\/|@)/.test(word) || word.includes("://")) return false;
  return /[A-Za-z]/.test(word) && /\d/.test(word) && entropy(word) >= 3.5;
}

const decoded = (text: string): string => {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
};

const queryPair = (pair: string): string => {
  const at = pair.indexOf("=");
  if (at < 0) return pair;
  const key = pair.slice(0, at);
  const value = pair.slice(at + 1);
  const hide = !isReferenceOnly(value) && (isSecretKey(decoded(key)) ? !SAFE_VALUES.test(value) : looksSecret(decoded(value)));
  return `${key}=${hide ? MASK : value}`;
};

/** Edits the text by hand: a URL parser would percent-encode the mask and the ${VAR} references. */
export function maskUrl(url: string): string {
  const parts = URL_PARTS.exec(url);
  if (!parts) return maskText(url);
  const [, scheme, authority = "", path = "", query, fragment] = parts;
  const at = authority.lastIndexOf("@");
  let userinfo = "";
  if (at >= 0) {
    const colon = authority.indexOf(":");
    const user = colon >= 0 && colon < at ? authority.slice(0, colon) : authority.slice(0, at);
    const password = colon >= 0 && colon < at ? authority.slice(colon + 1, at) : null;
    const shownUser = looksSecret(decoded(user)) && !isReferenceOnly(user) ? MASK : user;
    userinfo = `${shownUser}${password === null ? "" : `:${isReferenceOnly(password) ? password : MASK}`}@`;
  }
  const maskedPath = path.split("/").map((segment) => (!isReferenceOnly(segment) && looksSecret(decoded(segment)) ? MASK : segment)).join("/");
  const maskedQuery = query === undefined ? "" : `?${query.slice(1).split("&").map(queryPair).join("&")}`;
  return `${scheme}${userinfo}${authority.slice(at + 1)}${maskedPath}${maskedQuery}${fragment === undefined ? "" : `#${maskText(fragment.slice(1))}`}`;
}

interface WordState {
  afterSecretFlag: boolean;
}

const flagName = (word: string) => /^--?([A-Za-z][\w-]*)$/.exec(word)?.[1] ?? null;

function maskWord(word: string, state: WordState): string {
  const flagContext = state.afterSecretFlag;
  state.afterSecretFlag = false;
  if (flagContext && !flagName(word)) return isReferenceOnly(word) ? word : MASK;
  const bareFlag = flagName(word);
  if (bareFlag !== null) {
    state.afterSecretFlag = isSecretKey(bareFlag);
    return word;
  }
  const assignment = /^(--?[A-Za-z][\w-]*|[A-Za-z_]\w*)=(.*)$/s.exec(word);
  if (assignment) {
    const [, name = "", value = ""] = assignment;
    if (isReferenceOnly(value)) return word;
    if (isSecretKey(name.replace(/^-+/, ""))) return `${name}=${MASK}`;
    return `${name}=${maskWord(value, { afterSecretFlag: false })}`;
  }
  const [, open = "", inner = "", close = ""] = /^(["'`]*)(.*?)(["'`]*)$/s.exec(word) ?? [];
  if (URL_START.test(inner)) return `${open}${maskUrl(inner)}${close}`;
  return looksSecret(inner) ? `${open}${MASK}${close}` : word;
}

// Prose has sk-learn and hf_transfer: after a prefix, only a long mixed body counts.
function markdownSecret(word: string): boolean {
  if (SHAPED_PREFIX.test(word) || JWT.test(word)) return true;
  const body = PREFIX_BODY.exec(word)?.[1];
  return body !== undefined && body.length >= 16 && /[A-Za-z]/.test(body) && /\d/.test(body);
}

/** Masks only the high-confidence shapes (known prefixes, JWT) in prose; the rest of the text stays as it is. */
export function maskMarkdown(text: string): string {
  return text.replace(/\S+/g, (word) => {
    const [, open = "", inner = "", close = ""] = /^([("'`<\[]*)(.*?)([)"'`>\].,;:!?]*)$/s.exec(word) ?? [];
    return markdownSecret(inner) ? `${open}${MASK}${close}` : word;
  });
}

export function maskText(text: string): string {
  const withHeaders = text.replace(HEADER, (whole, name: string, separator: string, scheme: string | undefined, value: string) =>
    isReferenceOnly(value) ? whole : `${name}${separator}${scheme ?? ""}${MASK}`,
  );
  const state: WordState = { afterSecretFlag: false };
  const parts = withHeaders.split(/(\s+)/);
  let afterHeaderName = false;
  return parts
    .map((part, index) => {
      if (index % 2 === 1 || part === "") return part;
      // `Private-Token: value`: the word after a secret `Name:` is the value.
      if (afterHeaderName) {
        if (/^(bearer|basic|token)$/i.test(part)) return part;
        afterHeaderName = false;
        if (part.includes(MASK)) return part;
        const [, body = "", quotes = ""] = /^(.*?)(["'`]*)$/s.exec(part) ?? [];
        return isReferenceOnly(body) ? part : `${MASK}${quotes}`;
      }
      const name = /^["'`]*([A-Za-z][\w.-]*):$/.exec(part)?.[1];
      if (name !== undefined && isSecretKey(name) && (name.includes("-") || PLAIN_HEADERS.has(name.toLowerCase()))) {
        afterHeaderName = true;
        return part;
      }
      return maskWord(part, state);
    })
    .join("");
}

export function maskArgs(args: string[]): string[] {
  const state: WordState = { afterSecretFlag: false };
  // An argument with spaces is a whole command line or header, not one word.
  return args.map((arg) => (/\s/.test(arg) ? maskText(arg) : maskWord(arg, state)));
}

export function maskString(value: string, key: string | null = null): string {
  return maskLeaf(value, key, false);
}

function maskLeaf(value: string, key: string | null, inherited: boolean): string {
  if (isEnvNameKey(key) || isReferenceOnly(value)) return value;
  if (inherited || (key !== null && isSecretKey(key))) {
    if (SAFE_VALUES.test(value) || (isLimitKey(key) && /^\d+$/.test(value))) return value;
    const scheme = SCHEME_WORD.exec(value)?.[0] ?? "";
    return `${scheme}${MASK}`;
  }
  return URL_START.test(value) ? maskUrl(value) : maskText(value);
}

// An oauth block holds settings: its children are judged by their own keys.
const isContainerKey = (key: string | null): boolean => key !== null && key.toLowerCase() === "oauth";

function mask(value: JsonValue, key: string | null, inherited: boolean): JsonValue {
  if (isEnvNameKey(key)) return value;
  const secret = inherited || (key !== null && isSecretKey(key));
  if (typeof value === "string") return maskLeaf(value, key, inherited);
  if (typeof value === "number") return secret && !isLimitKey(key) ? MASK : value;
  if (Array.isArray(value)) {
    if (key === "args" && value.every((item) => typeof item === "string")) return maskArgs(value as string[]);
    return value.map((item) => mask(item, key, inherited));
  }
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, mask(item, secret && !isContainerKey(key) ? key : name, secret && !isContainerKey(key))]));
}

export function maskData(value: JsonValue, key: string | null = null): { value: JsonValue; masked: boolean } {
  const out = mask(value, key, false);
  return { value: out, masked: JSON.stringify(out) !== JSON.stringify(value) };
}
