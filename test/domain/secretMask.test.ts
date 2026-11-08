import assert from "node:assert/strict";
import { test } from "bun:test";
import { MASK, isSecretKey, looksSecret, maskArgs, maskData, maskMarkdown, maskString, maskText, maskUrl } from "../../src/domain/secretMask.ts";

import { FAKE_AWS, FAKE_CLI_VALUE, FAKE_GHP, FAKE_GHP_14, FAKE_GHP_LONG, FAKE_GOOGLE, FAKE_JWT, FAKE_SHORT_JWT, FAKE_SK, FAKE_SK_LIVE, FAKE_SK_LONG, fake } from "../helpers/fakeSecrets.ts";

// Token-shaped values come from the helper so no secret-looking literal sits in the source.
const JWT = FAKE_JWT;

test("isSecretKey reads camelCase, separators and suffixes", () => {
  for (const key of ["apiKey", "API_KEY", "x-api-key", "GITHUB_TOKEN", "authToken", "authtoken", "APIKEY", "client.secret", "Authorization", "dbPassword", "SENTRY_DSN", "mySecret"]) {
    assert.equal(isSecretKey(key), true, key);
  }
  for (const key of ["command", "url", "args", "PATH", "name", "type", "timeout", "monkeyPatch", "author"]) assert.equal(isSecretKey(key), false, key);
});

test("looksSecret flags known prefixes, JWTs and long mixed strings", () => {
  for (const word of [FAKE_SK, FAKE_GHP, fake("github", "_pat_11AAA"), fake("xoxb", "-1234-abcd"), FAKE_AWS, FAKE_GOOGLE, fake("Bearer sk", "-live1"), JWT, fake("lin", "_api_x1y2"), fake("a1B2c3D4e5F6", "g7H8i9J0k1L2m3")]) {
    assert.equal(looksSecret(word), true, word);
  }
});

test("looksSecret keeps paths, packages, words and short values", () => {
  for (const word of ["/usr/local/bin/node", "./scripts/start-server-with-long-name-1.sh", "@modelcontextprotocol/server-filesystem", "https://mcp.example.com/mcp", "ASIAN", "AKIA", "npx", "--yes", "averyveryverylongplainenglishwordwithoutdigits", "aaaaaaaaaaaaaaaaaaaaaaaa1"]) {
    assert.equal(looksSecret(word), false, word);
  }
});

test("maskString masks by key and keeps references and safe values", () => {
  assert.equal(maskString("abc", "API_KEY"), MASK);
  assert.equal(maskString("Bearer abc", "Authorization"), `Bearer ${MASK}`);
  assert.equal(maskString("Bearer ${TOKEN}", "Authorization"), "Bearer ${TOKEN}");
  assert.equal(maskString("${TOKEN}", "API_KEY"), "${TOKEN}");
  assert.equal(maskString("$TOKEN", "API_KEY"), "$TOKEN");
  assert.equal(maskString("oauth", "auth"), "oauth");
  assert.equal(maskString("${KEY:-hunter2}", "API_KEY"), MASK);
  assert.equal(maskString("MY_TOKEN_VAR", "bearer_token_env_var"), "MY_TOKEN_VAR");
  assert.equal(maskString("node", "command"), "node");
  assert.equal(maskString("/home/demo/bin/server", "command"), "/home/demo/bin/server");
});

test("maskText hides the secrets of a command line", () => {
  assert.equal(maskText(`node server.js --token ${FAKE_CLI_VALUE} --port 80`), `node server.js --token ${MASK} --port 80`);
  assert.equal(maskText("run --api-key=abc"), `run --api-key=${MASK}`);
  assert.equal(maskText("API_KEY=abc node x.js"), `API_KEY=${MASK} node x.js`);
  assert.equal(maskText(`curl -H "Authorization: Bearer abcdef" x`), `curl -H "Authorization: Bearer ${MASK}" x`);
  assert.equal(maskText("Authorization: Bearer ${TOK}"), "Authorization: Bearer ${TOK}");
  assert.equal(maskText(`call ${JWT} now`), `call ${MASK} now`);
  assert.equal(maskText("see 'sk-live-1234' ok"), `see '${MASK}' ok`);
  assert.equal(maskText("npx -y @scope/pkg --root /srv/data"), "npx -y @scope/pkg --root /srv/data");
  assert.equal(maskText("--url=https://h.example.com/p?token=zzz"), `--url=https://h.example.com/p?token=${MASK}`);
});

test("maskArgs carries a bare secret flag to the next argument", () => {
  assert.deepEqual(maskArgs(["-y", "pkg", "--token", "abc", "--verbose"]), ["-y", "pkg", "--token", MASK, "--verbose"]);
  assert.deepEqual(maskArgs(["--password", "${PW}", "x"]), ["--password", "${PW}", "x"]);
  assert.deepEqual(maskArgs(["Authorization: Bearer abc"]), [`Authorization: Bearer ${MASK}`]);
  assert.deepEqual(maskArgs(["--key", "--other"]), ["--key", "--other"]);
});

test("maskUrl hides the password, secret query values and secret path segments", () => {
  assert.equal(maskUrl("https://user:pw@h.example.com/mcp"), `https://user:${MASK}@h.example.com/mcp`);
  assert.equal(maskUrl(`https://${FAKE_SK}:x@h.example.com`), `https://${MASK}:${MASK}@h.example.com`);
  assert.equal(maskUrl("https://h.example.com/mcp?api_key=abc&mode=fast"), `https://h.example.com/mcp?api_key=${MASK}&mode=fast`);
  assert.equal(maskUrl(`https://h.example.com/mcp?x=${FAKE_GHP_14}`), `https://h.example.com/mcp?x=${MASK}`);
  assert.equal(maskUrl(`https://h.example.com/${FAKE_GHP_14}/mcp`), `https://h.example.com/${MASK}/mcp`);
  assert.equal(maskUrl("https://h.example.com/${TOKEN}/mcp?key=${KEY}"), "https://h.example.com/${TOKEN}/mcp?key=${KEY}");
  assert.equal(maskUrl("https://h.example.com:8080/a/b#frag"), "https://h.example.com:8080/a/b#frag");
  assert.equal(maskUrl("https://h.example.com/#--token abc"), `https://h.example.com/#--token ${MASK}`);
});

test("maskData masks nested values by their key and reports whether it did", () => {
  const input = {
    command: "npx",
    args: ["-y", "pkg", "--token", "abc"],
    env: { GITHUB_TOKEN: FAKE_GHP, MODE: "dev", REF: "${TOK}" },
    headers: { Authorization: "Bearer abc", "X-Trace": "1" },
    bearer_token_env_var: "MY_TOKEN",
    env_http_headers: { "X-Api-Key": "MY_KEY_VAR" },
    env_vars: ["A_TOKEN"],
    timeout: 30,
    enabled: true,
  };
  const { value, masked } = maskData(input);
  assert.deepEqual(value, {
    command: "npx",
    args: ["-y", "pkg", "--token", MASK],
    env: { GITHUB_TOKEN: MASK, MODE: "dev", REF: "${TOK}" },
    headers: { Authorization: `Bearer ${MASK}`, "X-Trace": "1" },
    bearer_token_env_var: "MY_TOKEN",
    env_http_headers: { "X-Api-Key": "MY_KEY_VAR" },
    env_vars: ["A_TOKEN"],
    timeout: 30,
    enabled: true,
  });
  assert.equal(masked, true);
  assert.equal(maskData({ command: "node", n: 1 }).masked, false);
});

test("maskData masks every leaf under a secret key, numbers included", () => {
  const { value } = maskData({ credentials: { user: "bob", pin: 1234, ref: "${P}", nested: ["x"] }, apiKey: 99 });
  assert.deepEqual(value, { credentials: { user: MASK, pin: MASK, ref: "${P}", nested: [MASK] }, apiKey: MASK });
});

test("maskData masks password-like env names and NAME=value args", () => {
  const { value } = maskData({ env: { PGPASSWORD: "hunter2hunter", DBPASS: "s3cretpass", DB_PWD: "x1", MY_AUTH: "y2", MODE: "dev" } });
  assert.deepEqual(value, { env: { PGPASSWORD: MASK, DBPASS: MASK, DB_PWD: MASK, MY_AUTH: MASK, MODE: "dev" } });
  assert.deepEqual(maskArgs(["-e", "PGPASSWORD=hunter2", "--env", "DBPASS=abc", "-e", "MODE=dev"]), ["-e", `PGPASSWORD=${MASK}`, "--env", `DBPASS=${MASK}`, "-e", "MODE=dev"]);
});

test("maskArgs masks the value of a header-like `Name: value` pair with a secret name", () => {
  assert.deepEqual(maskArgs(["-H", "Private-Token: abcdef"]), ["-H", `Private-Token: ${MASK}`]);
  assert.deepEqual(maskArgs(["--header", "X-Linear-Key: short"]), ["--header", `X-Linear-Key: ${MASK}`]);
  assert.deepEqual(maskArgs(["-H", "Accept: json"]), ["-H", "Accept: json"]);
});

test("maskData keeps limits and env names readable", () => {
  const input = { output_token_limit: 4000, model_auto_compact_token_limit: 9000, max_tokens: 5, env_key: "OPENAI_API_KEY" };
  assert.deepEqual(maskData(input).value, input);
});

test("maskMarkdown masks known prefixes and JWTs only, keeping the rest", () => {
  const text = `Use ${FAKE_GHP_LONG} and ${FAKE_SHORT_JWT} here.\nPlain abcdefghijklmnopqrstuvwxyz1234 stays.\n\`\`\`\n${FAKE_SK_LIVE}\n\`\`\``;
  const out = maskMarkdown(text);
  assert.equal(out, `Use ${MASK} and ${MASK} here.\nPlain abcdefghijklmnopqrstuvwxyz1234 stays.\n\`\`\`\n${MASK}\n\`\`\``);
});

test("maskMarkdown keeps prose that only looks like a prefix", () => {
  const text = "pip install sk-learn; set npm_config_registry, secret_key, hf_transfer and pk_id.";
  assert.equal(maskMarkdown(text), text);
  assert.equal(maskMarkdown(`key ${FAKE_SK_LONG} ok`), `key ${MASK} ok`);
  assert.equal(maskMarkdown(`id ${FAKE_AWS} ok`), `id ${MASK} ok`);
  assert.equal(maskMarkdown(`k ${FAKE_GOOGLE}.`), `k ${MASK}.`);
});

test("suffix rule works on words and oauth is a container", () => {
  assert.equal(isSecretKey("compass"), false);
  assert.equal(isSecretKey("bypass"), false);
  assert.deepEqual(maskData({ compass: "north" }).value, { compass: "north" });
  const oauth = { oauth: { clientId: "abc", callbackPort: 8080, clientSecret: "shh" } };
  assert.deepEqual(maskData(oauth).value, { oauth: { clientId: "abc", callbackPort: 8080, clientSecret: MASK } });
});

test("header rule keeps the quote and only hits header-looking names", () => {
  assert.equal(maskText("curl -H 'X-Key: abc'"), `curl -H 'X-Key: ${MASK}'`);
  assert.equal(maskText('echo "Session: started now"'), 'echo "Session: started now"');
});

test("limit words are found in camelCase and numeric strings", () => {
  const input = { tokenLimit: 4000, OUTPUT_TOKEN_LIMIT: "4000" };
  assert.deepEqual(maskData(input).value, input);
});
