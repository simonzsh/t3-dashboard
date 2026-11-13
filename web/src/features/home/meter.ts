export type Severity = "ok" | "warn" | "danger";

const WARN_AT = 75;
const DANGER_AT = 90;

/** The fill colour step; the number and the caption carry the same state in text. */
export const severityOf = (percent: number): Severity => (percent >= DANGER_AT ? "danger" : percent >= WARN_AT ? "warn" : "ok");
