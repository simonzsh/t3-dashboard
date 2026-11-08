// Fake secrets for masking tests, joined at runtime: a token-shaped literal in the
// source trips secret scanners (GitGuardian) even when the value is fake.
export const fake = (...parts: string[]) => parts.join("");

export const FAKE_JWT = fake("eyJhbGciOiJIUzI1NiJ9", ".", "eyJzdWIiOiIxMjM0In0", ".", "c2lnbmF0dXJl");
export const FAKE_SHORT_JWT = fake("eyJhbGci", ".", "eyJzdWIi", ".", "sig_1");
export const FAKE_CLI_VALUE = fake("abc", "123");
export const FAKE_GHP = fake("ghp", "_abcdefghijklmnop");
export const FAKE_GHP_14 = fake("ghp", "_abcdefghijklmn");
export const FAKE_GHP_LONG = fake("ghp", "_abcdefghijklmnop1234");
export const FAKE_SK = fake("sk", "-abc123");
export const FAKE_SK_LONG = fake("sk", "-abcdefghij1234567890");
export const FAKE_SK_LIVE = fake("sk", "-live-abcdefghij1234567890");
export const FAKE_AWS = fake("AKIA", "IOSFODNN7EXAMPLE");
export const FAKE_GOOGLE = fake("AIza", "SyA-abcdefghijklmnopqrstuv");
