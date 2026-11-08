import type { LimitWindow, LimitsOverview, ProviderLimits } from "../../../../shared/api.ts";
import { ProviderIcon } from "../../lib/ProviderIcon.tsx";
import { CardHead, Icon, IconButton, Skeleton, SkeletonGroup } from "../../ui/index.ts";
import { caption, elapsedPercent, meterLabel, oldestCheck, sortProviders, sortWindows, usedPercent } from "./limitsView.ts";
import { Meter } from "./Meter.tsx";
import type { ReadState } from "./pollRead.ts";

function LimitTile({ window, now }: { window: LimitWindow; now: Date }) {
  const elapsed = elapsedPercent(window, now);
  const note = caption(window, now);
  const label = meterLabel(window, now);
  return (
    <div className="stat-tile limits-tile">
      <span className="stat-label">{window.label}</span>
      <span className="stat-value">
        {usedPercent(window)}%<span className="limits-used"> used</span>
      </span>
      <Meter percent={window.usedPercent} label={label} tick={elapsed} />
      {note && <span className="stat-caption">{note}</span>}
    </div>
  );
}

function Provider({ provider, now }: { provider: ProviderLimits; now: Date }) {
  const credits = provider.resetCredits;
  return (
    <section className="limits-provider">
      <div className="limits-provider-head">
        <h2>
          <ProviderIcon provider={provider.driver} />
          {provider.name}
        </h2>
        {credits > 0 && (
          <span className="limits-credits">
            <Icon name="ticket" />
            {credits} reset {credits === 1 ? "credit" : "credits"}
          </span>
        )}
      </div>
      <div className="limits-tiles">
        {sortWindows(provider.windows).map((window) => (
          <LimitTile key={window.id} window={window} now={now} />
        ))}
      </div>
    </section>
  );
}

// Two tiles, so the card keeps about its height once the limits arrive.
function UsageSkeleton() {
  return (
    <SkeletonGroup label="Loading usage limits">
      <div className="limits-tiles">
        {[0, 1].map((i) => (
          <div className="stat-tile limits-tile" key={i}>
            <Skeleton height={14} width="50%" />
            <Skeleton height={28} width="40%" />
            <Skeleton height={8} radius={4} />
            <Skeleton height={12} width="70%" />
          </div>
        ))}
      </div>
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
            <p className="dashboard-note">No provider reports usage limits. Sign in to an agent in T3 Code.</p>
          ) : (
            sortProviders(limits.providers).map((provider) => <Provider key={provider.instanceId} provider={provider} now={now} />)
          )}
          {error && <p className="dashboard-note error" role="alert">Could not refresh usage limits. {error}</p>}
        </>
      )}
    </section>
  );
}
