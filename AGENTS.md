# Rules for coding agents

These rules apply to every change in this repository. Read them before you write code.

## Read first

- `docs/development.md`: architecture, import rules, errors, checks.
- `web/src/ui/README.md`: the UI kit and its rules.
- `docs/contracts.md`: the T3 Code, Linear and GitHub contracts.

## Reuse before you write

- Before you write a component, a hook or a helper, search `web/src/ui/`, `web/src/lib/`, `shared/` and `src/domain/` for one that does the job.
- Use the kit (`web/src/ui/index.ts`) for every control: buttons, inputs, switches, segmented controls, menus, popovers, dialogs, sheets, tooltips, badges, loaders. Do not build a local copy, even a small one.
- Menus and lists: use `Dropdown`, `ActionMenu`, or `OptionList` with `useListNav`. They give hover, arrow keys, Home/End, Enter and focus the same way everywhere.
- Copy to the clipboard with `useCopy`. Read media queries with `useMediaQuery` or `ui/media.ts`.
- If a kit component is close but misses one feature, extend it in `web/src/ui/` (with a test and a README line). Do not copy it into a feature.

## No duplication

- When the same logic is needed in two places, move it to one shared place: `web/src/lib/` for the interface, `shared/` for the contract, `src/domain/` for server rules.
- Do not add a second CSS look for a thing that exists (menu rows, count badges, search fields, link buttons). Reuse its class.

## Follow the conventions

- Respect the layers in `docs/development.md` ("Import rules"). `test/architecture.test.ts` checks them.
- Calls to another system go only through `src/integrations/`. Each answer goes through a schema.
- Validate request bodies in `src/server/validate.ts`. Put shared types in `shared/` and re-export them from `shared/api.ts`.
- For a T3 Code feature, use the T3 Code API with the same parameters as T3 Code's own client. Do not rebuild a feature that T3 Code already gives.
- The dashboard must work for any user. Do not depend on the folders, projects or companies of one machine.
- Put new CSS rules next to the block they belong to in `web/src/styles.css`, and use the tokens at the top of the file.
- Write code, comments, docs and prompts in English (STE style). Keep comments short (2 or 3 lines) and say why, not what.

## Guard tests

- `web/test/uiRules.test.ts`, `test/architecture.test.ts` and `test/integrations/boundary.test.ts` block known mistakes. Do not weaken them to make a change pass.
- When you fix a class of problem, add a guard so that it does not come back.

## Tests and checks

- Tests mirror the source: `src/x/y.ts` → `test/x/y.test.ts`, `web/src/x/y.tsx` → `web/test/x/y.test.tsx`. Use `bun:test` and `node:assert/strict`.
- `bun test` has no DOM: test pure functions and static renders (`renderToStaticMarkup`).
- Run `bun run typecheck` and the tests for your change. The CI runs `bun run check` and `bun run smoke` on each PR.

## Docs and commits

- Update `docs/usage.md` for a change the user can see, and `docs/contracts.md` for a new T3 Code command.
- Commit messages: `type(scope): summary`, for example `fix(web): ...` or `feat(news): ...`.
