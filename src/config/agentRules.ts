import { claudeRulesFile, codexRulesFile } from "./paths.ts";

export const RULES_BEGIN = "<!-- t3-dashboard:begin -->";
export const RULES_END = "<!-- t3-dashboard:end -->";

export const AGENT_RULES = `${RULES_BEGIN}
## Automations (managed by t3-dashboard, do not edit inside this block)
- For reminders, routines and webhooks, use only the T3 Code \`schedule_task\` tool (load it with tool search if it is deferred). Never use CronCreate, /loop, /schedule, ScheduleWakeup, cron or systemd timers.
- A one-time request is a reminder: its title starts with "Reminder: ". Use \`fixed_time\` only if the next run is less than 7 days away and on the right weekday; otherwise use \`interval\` with \`everyMs\` = the delay.
- A routine has a short title with no prefix.
- The task prompt is self-contained, in English, and says what to do at each run.
- Set \`bindToCurrentThread: false\` (a new thread per run) unless the user asks to post in this thread.
- After creating a task, check it and report its schedule and \`nextRunAt\`.
- The dashboard pauses a reminder after its run and keeps tasks out of worktrees: do not add self-disable steps, and never delete a reminder.
${RULES_END}`;

type Env = Record<string, string | undefined>;

// Only one begin and one end, in order: anything else could swallow the user's text.
function findBlock(content: string): { start: number; end: number } | null {
  const start = content.indexOf(RULES_BEGIN);
  const end = content.indexOf(RULES_END);
  if (start === -1 && end === -1) return null;
  const single = start !== -1 && end > start && content.indexOf(RULES_BEGIN, start + 1) === -1 && content.indexOf(RULES_END, end + 1) === -1;
  if (!single) throw new Error("the t3-dashboard block is damaged: fix or remove its markers by hand");
  return { start, end: end + RULES_END.length };
}

const eolOf = (content: string) => (content.includes("\r\n") ? "\r\n" : "\n");

/** Puts the block in the file: replaces the old one, or adds it at the end. Throws on a damaged block. */
export function withRules(content: string | null): string {
  const eol = eolOf(content ?? "");
  const block = AGENT_RULES.replaceAll("\n", eol);
  if (content === null || content === "") return `${block}${eol}`;
  const found = findBlock(content);
  if (found) return content.slice(0, found.start) + block + content.slice(found.end);
  const trailing = /(?:\r?\n)*$/.exec(content)![0].split("\n").length - 1;
  return content + eol.repeat(Math.max(0, 2 - trailing)) + block + eol;
}

/** Takes the block out, with the blank line that separated it. Throws on a damaged block. */
export function withoutRules(content: string): string {
  const found = findBlock(content);
  if (!found) return content;
  const eol = eolOf(content);
  let before = content.slice(0, found.start);
  let after = content.slice(found.end);
  if (after.startsWith(eol)) after = after.slice(eol.length);
  if (before.endsWith(eol + eol)) before = before.slice(0, -eol.length);
  return before + after;
}

/** `T3_DASHBOARD_AGENT_RULES=off` keeps the dashboard away from the rules files. */
export const agentRulesOff = (env: Env): boolean => env.T3_DASHBOARD_AGENT_RULES?.toLowerCase() === "off";

export interface AgentRulesDeps {
  env: Env;
  home: string;
  exists(path: string): boolean;
  readFile(path: string): string;
  writeFile(path: string, content: string): void;
  log(message: string): void;
}

/** Writes or removes the block in the Claude and Codex rules files. A failure is logged, never thrown. */
export function syncAgentRules(action: "write" | "remove", deps: AgentRulesDeps): void {
  if (action === "write" && agentRulesOff(deps.env)) return;
  for (const path of [claudeRulesFile(deps.env, deps.home), codexRulesFile(deps.env, deps.home)]) {
    try {
      const present = deps.exists(path);
      if (action === "remove" && !present) continue;
      const current = present ? deps.readFile(path) : null;
      const next = action === "write" ? withRules(current) : withoutRules(current!);
      if (next !== current) deps.writeFile(path, next);
    } catch (error) {
      deps.log(`Could not update ${path}: ${(error as Error).message}`);
    }
  }
}
