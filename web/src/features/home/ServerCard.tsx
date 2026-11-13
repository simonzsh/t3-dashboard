import type { ReactNode } from "react";
import type { ServerStats } from "../../../../shared/api.ts";
import { relativeTime } from "../../lib/format.ts";
import { CardHead, Icon, IconButton, Skeleton, SkeletonGroup } from "../../ui/index.ts";
import { Meter } from "./Meter.tsx";
import type { ReadState } from "./pollRead.ts";
import { CacheCleanupDialog } from "./CacheCleanupDialog.tsx";
import { useCacheCleanup } from "./useCacheCleanup.ts";
import { cacheCleanupAvailable, formatBytesPair, hostLine, meterText, percentLabel } from "./serverView.ts";

interface TileProps {
  label: string;
  /** Null when the figure cannot be read: a dash and no meter. */
  percent: number | null;
  /** The plain text of the caption, for the meter's label. */
  detail: string;
  caption: ReactNode;
}

function Tile({ label, percent, detail, caption }: TileProps) {
  return (
    <div className="stat-tile">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{percentLabel(percent)}</span>
      {percent !== null && <Meter percent={percent} label={meterText(label, percent, detail)} />}
      <span className="stat-caption">{caption}</span>
    </div>
  );
}

function Tiles({ stats }: { stats: ServerStats }) {
  const { cpu, memory, disk } = stats;
  const cores = cpu.cores === 1 ? "1 core" : `${cpu.cores} cores`;
  const memoryText = formatBytesPair(memory.usedBytes, memory.totalBytes);
  const diskText = disk ? formatBytesPair(disk.usedBytes, disk.totalBytes) : "Not available";
  return (
    <div className="stat-tiles">
      <Tile label="CPU" percent={cpu.usedPercent} detail={cores} caption={cpu.cores > 0 ? cores : "Not available"} />
      <Tile label="Memory" percent={memory.usedPercent} detail={memoryText} caption={memoryText} />
      <Tile
        label="Disk"
        percent={disk?.usedPercent ?? null}
        detail={diskText}
        caption={disk ? <>{diskText}<span className="stat-more"> · {disk.path}</span></> : diskText}
      />
    </div>
  );
}

// Same footprint as the tiles, so the card keeps its height.
function ServerSkeleton() {
  return (
    <SkeletonGroup label="Loading machine stats">
      <div className="stat-tiles">
        {[0, 1, 2].map((i) => (
          <div className="stat-tile" key={i}>
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

export function ServerCard({ state, now }: { state: ReadState<ServerStats>; now: Date }) {
  const { value: stats, error, loading, refresh } = state;
  const cleanup = useCacheCleanup(refresh);
  return (
    <section className="card server-card" aria-labelledby="home-server-head">
      <CardHead
        id="home-server-head"
        icon="server"
        title="Machine"
        note={stats ? hostLine(stats) : undefined}
        actions={
          <>
            {stats && <span className="card-updated">Updated {relativeTime(stats.readAt, now)}</span>}
            {stats && cacheCleanupAvailable(stats) && (
              <IconButton size="sm" variant="ghost" label="Clear caches" tooltip="Clear caches" onClick={cleanup.start}>
                <Icon name="broom" />
              </IconButton>
            )}
            <IconButton size="sm" variant="ghost" label="Refresh machine stats" tooltip="Refresh machine stats" disabled={loading} aria-busy={loading} onClick={refresh}>
              <Icon name="refresh" className={loading ? "icon spinning" : "icon"} />
            </IconButton>
          </>
        }
      />
      {!stats ? (
        error ? <p className="card-message error" role="alert">{error}</p> : <ServerSkeleton />
      ) : (
        <>
          <Tiles stats={stats} />
          {error && <p className="card-message error" role="alert">Could not refresh machine stats. {error}</p>}
          {cleanup.summary && <p className="card-message cache-summary" role="status">{cleanup.summary}</p>}
        </>
      )}
      {cleanup.open && <CacheCleanupDialog preview={cleanup.preview} error={cleanup.error} running={cleanup.running} onConfirm={cleanup.confirm} onClose={cleanup.close} />}
    </section>
  );
}
