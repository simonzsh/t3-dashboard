// Remote access: the address a phone on the same tailnet opens.
export type RemoteAccess =
  | {
      /** No tailscale program found. */
      state: "not-installed";
      /** The command that installs Tailscale on this machine's OS; null when there is no safe one-liner. */
      installCommand: string | null;
    }
  | {
      /** tailscaled runs, but this machine is not signed in. */
      state: "needs-login";
      /** The sign-in page Tailscale gave; null until Sign in is pressed or when none is known. */
      loginUrl: string | null;
      /** Why the last Sign in failed, one sentence; null before any try. */
      error: string | null;
      /** The command the user can run by hand. */
      command: string;
    }
  /** Installed, but tailscaled is down or not "Running". */
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
