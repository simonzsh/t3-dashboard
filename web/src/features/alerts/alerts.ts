import { hashForSession } from "../../lib/tabs.ts";

/** The link the phone alert opens: this browser knows its public address, the server does not. */
export const alertClickUrl = ({ origin, pathname }: { origin: string; pathname: string }, id: string): string => `${origin}${pathname}${hashForSession(id)}`;
