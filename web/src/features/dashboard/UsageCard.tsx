import type { LimitWindow, LimitsOverview, ProviderLimits } from "../../../../shared/api.ts";
import { ProviderIcon } from "../../lib/ProviderIcon.tsx";
import { providerKind } from "../../lib/threads.ts";
import { CardHead, Icon, IconButton, Skeleton, SkeletonGroup } from "../../ui/index.ts";
import { leftPercent, oldestCheck, pace, PACE, resetLabel, rowLabel, showHatch, sortProviders, sortWindows, timeLeftPercent } from "./limitsView.ts";
import type { ReadState } from "./pollRead.ts";

function LimitRow({ window, credits, now }: { window: LimitWindow; credits: number; now: Date }) {
  const left = leftPercent(window);
  const timeLeft = timeLeftPercent(window, now);
  const paceKind = pace(window, now);
  const reset = resetLabel(window.resetsAt, now);
  return (
    <div className="limits-row">
      <span className="limits-label">{window.label}</span>
      <span className="limits-left">
        <b>{left}%</b> left
        {paceKind && (
          <span className="limits-pace" data-tooltip={PACE[paceKind].label}>
            <Icon name={PACE[paceKind].icon} label={PACE[paceKind].label} />
          </span>
        )}
      </span>
      <div className="limits-bar" role="img" aria-label={rowLabel(window, credits, now)}>
        {left > 0 && <span className="limits-fill" style={{ width: `${left}%` }} aria-hidden="true" />}
        {showHatch(window) && <span className="limits-hatch" style={{ width: `${100 - left}%` }} aria-hidden="true" />}
        {timeLeft !== null && <span className="limits-marker" style={{ left: `${timeLeft}%` }} aria-hidden="true" />}
        {(reset !== null || credits > 0) && (
          <span className="limits-chip" aria-hidden="true">
            {reset !== null && (
              <>
                <Icon name="rotateCw" />
                {reset}
              </>
            )}
            {reset !== null && credits > 0 && "·"}
            {credits > 0 && (
              <>
                <Icon name="ticket" />
                {credits}
              </>
            )}
          </span>
        )}
      </div>
    </div>
  );
}

function Provider({ provider, now }: { provider: ProviderLimits; now: Date }) {
  return (
    <section className={`limits-provider ${providerKind(provider.driver)}`}>
      <h2 className="limits-provider-head">
        <ProviderIcon provider={provider.driver} />
        {provider.name}
      </h2>
      {sortWindows(provider.windows).map((window) => (
        <LimitRow key={window.id} window={window} credits={provider.resetCredits} now={now} />
      ))}
    </section>
  );
}

// Two rows, so the card keeps about its height once the limits arrive.
function UsageSkeleton() {
  return (
    <SkeletonGroup label="Loading usage limits">
      {[0, 1].map((i) => (
        <div className="limits-row" key={i}>
          <Skeleton height={14} width="60%" />
          <Skeleton height={24} radius={8} />
        </div>
      ))}
    </SkeletonGroup>
  );
}

export function UsageCard({ state, now }: { state: ReadState<LimitsOverview>; now: Date }) {
  const { value: limits, error, loading, refresh } = state;
  return (
    <section className="dashboard-card limits-card" aria-labelledby="dashboard-usage-head">
      <CardHead
        id="dashboard-usage-head"
        icon="gauge"
        title="Usage"
        actions={
          <>
            {limits && <span className="card-updated">{oldestCheck(limits, now)}</span>}
            <IconButton size="sm" variant="ghost" label="Refresh usage limits" tooltip="Refresh usage limits" disabled={loading} onClick={refresh}>
              <Icon name="refresh" className={loading ? "icon spinning" : "icon"} />
            </IconButton>
          </>
        }
      />
      {!limits ? (
        error ? <p className="dashboard-note error" role="alert">{error}</p> : <UsageSkeleton />
      ) : (
        <>
          {!limits.supported ? (
            <p className="dashboard-note">This T3 Code version does not report usage limits.</p>
          ) : limits.providers.length === 0 ? (
            <p className="dashboard-note">No provider reports usage limits. Sign in to Codex or Claude in T3 Code.</p>
          ) : (
            sortProviders(limits.providers).map((provider) => <Provider key={provider.instanceId} provider={provider} now={now} />)
          )}
          {error && <p className="dashboard-note error" role="alert">Could not refresh usage limits. {error}</p>}
        </>
      )}
    </section>
  );
}
