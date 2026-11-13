// Remote access: the address a phone on the same tailnet opens.
export type RemoteAccess =
  /** No tailscale program found. */
  | { state: "not-installed" }
  /** Installed, but tailscaled is down, logged out or not "Running". */
  | { state: "stopped" }
  | {
      /** Tailscale runs, but nothing serves our port. */
      state: "needs-enable";
      /** The exact command the user can run by hand. */
      command: string;
      /** Why the last Enable failed, one sentence from a fixed list; null before any try. */
      error: string | null;
      /** A login.tailscale.com link that Tailscale printed to approve Serve on the tailnet; else null. */
      approveUrl: string | null;
    }
  | { state: "ready"; url: string }
  /** The status could not be read (bad JSON, MagicDNS off). */
  | { state: "error"; message: string };
