// Branches and checkout state of a project's folder, read from T3.

export interface ProjectRef {
  name: string;
  /** A remote branch. */
  remote: boolean;
  remoteName?: string;
  current: boolean;
  isDefault: boolean;
  /** Non-null: checked out in this worktree (may be the project folder itself). */
  worktreePath: string | null;
}

export interface ProjectRefs {
  isRepo: boolean;
  hasPrimaryRemote: boolean;
  refs: ProjectRef[];
  nextCursor: number | null;
  totalCount: number;
}

export interface ProjectVcsStatus {
  isRepo: boolean;
  hasPrimaryRemote: boolean;
  /** The checked-out branch; null when detached or not a repository. */
  branch: string | null;
  hasChanges: boolean;
}
