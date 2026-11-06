import type { ReactNode } from "react";
import type { ServerStats } from "../../../../shared/api.ts";
import { CardHead, Skeleton, SkeletonGroup } from "../../ui/index.ts";
import { Meter } from "./Meter.tsx";
import type { ReadState } from "./pollRead.ts";
import { formatBytesPair, hostLine, meterText, percentLabel } from "./serverView.ts";

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
    <SkeletonGroup label="Loading server stats">
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

export function ServerCard({ state }: { state: ReadState<ServerStats> }) {
  const { value: stats, error } = state;
  const host = stats ? hostLine(stats) : null;
  return (
    <section className="dashboard-card server-card" aria-labelledby="dashboard-server-head">
      <CardHead id="dashboard-server-head" icon="server" title="Server" actions={host && <span className="card-updated server-host" data-tooltip={host}>{host}</span>} />
      {!stats ? (
        error ? <p className="dashboard-note error" role="alert">{error}</p> : <ServerSkeleton />
      ) : (
        <>
          <Tiles stats={stats} />
          {error && <p className="dashboard-note error" role="alert">Could not refresh server stats. {error}</p>}
        </>
      )}
    </section>
  );
}
