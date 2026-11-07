import { ACTIVITY_PERIODS, DEFAULT_ACTIVITY_PERIOD, type ActivityPeriod } from "../../../../shared/usage.ts";
import type { DropdownOption } from "../../lib/dropdown.ts";
import { readKey, usePersisted, writeKey, type Store } from "../../lib/storage.ts";

export const ACTIVITY_PERIOD_KEY = "t3-dashboard-activity-period";

export const periodLabel = (period: ActivityPeriod): string => `last ${period} days`;

export const PERIOD_OPTIONS: DropdownOption[] = ACTIVITY_PERIODS.map((period) => ({ id: String(period), label: periodLabel(period) }));

export const loadActivityPeriod = (storage: Store | null): ActivityPeriod => ACTIVITY_PERIODS.find((period) => String(period) === readKey(storage, ACTIVITY_PERIOD_KEY)) ?? DEFAULT_ACTIVITY_PERIOD;

export const saveActivityPeriod = (storage: Store | null, period: ActivityPeriod): void => writeKey(storage, ACTIVITY_PERIOD_KEY, String(period));

/** The Activity period, saved per browser. */
export const useActivityPeriod = () => usePersisted(loadActivityPeriod, saveActivityPeriod);
