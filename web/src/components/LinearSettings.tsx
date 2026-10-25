import { useCallback, useEffect, useState } from "react";
import type { DashboardProject, LinearTeam, SettingsResult, TeamTable } from "../../../shared/api.ts";
import { api } from "../api.ts";
import { KEY_URL, fromChoice, keyLabel, projectOptions, teamRows, toChoice, toTable, unlistedRule } from "../linearSettings.ts";
import { LinearKeyForm } from "./LinearKeyForm.tsx";
import { useAction } from "./useAction.ts";

interface Props {
  projects: DashboardProject[];
  onChange: () => void;
}

export function LinearSettings({ projects, onChange }: Props) {
  const [settings, setSettings] = useState<SettingsResult | null>(null);
  const [teams, setTeams] = useState<LinearTeam[]>([]);
  const [changing, setChanging] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const action = useAction();

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const next = await api.getSettings();
      setSettings(next);
      setTeams(next.linear.connected ? (await api.getLinearTeams()).teams : []);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function saved(next: SettingsResult) {
    setSettings(next);
    setChanging(false);
    onChange();
    void load();
  }

  if (!settings) return <p className="empty">{loadError ?? "Loading…"}</p>;
  const { linear } = settings;
  const rows = teamRows(teams, linear.teams);

  async function saveTable(nextTable: TeamTable, unlisted: "show" | "hide") {
    const ok = await action.run(async () => setSettings(await api.saveLinearTeams({ teams: nextTable, unlisted })));
    if (ok) onChange();
  }

  return (
    <>
      <div className="settings-row">
        <span>{keyLabel(linear.keyTail)}</span>
        {linear.connected && (
          <div className="buttons">
            <button type="button" onClick={() => setChanging(!changing)}>
              Change key
            </button>
            <button
              type="button"
              disabled={action.busy}
              onClick={() =>
                void action.run(async () => {
                  saved(await api.disconnectLinear());
                })
              }
            >
              Disconnect
            </button>
          </div>
        )}
      </div>
      {(!linear.connected || changing) && (
        <div className="key-box">
          <small>
            Create a key in Linear under Settings → Account → Security &amp; access.{" "}
            <a href={KEY_URL} target="_blank" rel="noreferrer">
              Open the page
            </a>
          </small>
          <LinearKeyForm button={linear.connected ? "Save key" : "Connect"} onSaved={saved} />
        </div>
      )}
      {linear.legacy && <p className="notice">Your Linear file uses the old workspaces list. The next save keeps only the first workspace that has a key.</p>}
      {linear.connected && (
        <>
          {loadError && <span className="error">{loadError}</span>}
          {rows.map((row) => (
            <div className="settings-row" key={row.key}>
              <span>
                {row.name} <small className="workspace">{row.key}</small>
              </span>
              <select
                aria-label={`T3 project for ${row.name}`}
                value={row.choice}
                disabled={action.busy}
                onChange={(e) => void saveTable(toTable(rows.map((r) => (r.key === row.key ? { ...r, choice: e.target.value } : r)), linear.teams), linear.unlisted)}
              >
                <option value={toChoice("")}>Ask when assigning</option>
                {projectOptions(projects, fromChoice(row.choice)).map((option) => (
                  <option key={option.choice} value={option.choice}>
                    {option.label}
                  </option>
                ))}
                <option value={toChoice(null)}>Hidden</option>
              </select>
            </div>
          ))}
          <div className="settings-row">
            <span>{unlistedRule(linear.unlisted)}</span>
            <div className="segmented" role="radiogroup" aria-label="Teams that are not listed">
              {(["show", "hide"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={linear.unlisted === value}
                  className={linear.unlisted === value ? "active" : ""}
                  disabled={action.busy}
                  onClick={() => void saveTable(linear.teams, value)}
                >
                  {value === "show" ? "Show" : "Hide"}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
      {action.error && <span className="error">{action.error}</span>}
    </>
  );
}
