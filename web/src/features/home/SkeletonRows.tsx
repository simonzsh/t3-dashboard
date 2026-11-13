import { Skeleton, SkeletonGroup } from "../../ui/index.ts";

interface Props {
  label: string;
  rows: number;
  /** Notification rows start with an icon circle and have a detail line. */
  icon?: boolean;
}

/** Placeholder rows with the layout of the loaded rows, so nothing jumps. */
export function SkeletonRows({ label, rows, icon = false }: Props) {
  return (
    <SkeletonGroup label={label}>
      {Array.from({ length: rows }, (_, i) => (
        <div className="skeleton-row" key={i}>
          {icon && <Skeleton width={18} height={18} radius="50%" />}
          <div className="skeleton-row-body">
            <Skeleton height={13} width={i % 2 ? "55%" : "70%"} />
            {icon && <Skeleton height={12} width="90%" />}
            <Skeleton height={12} width="35%" />
          </div>
        </div>
      ))}
    </SkeletonGroup>
  );
}
