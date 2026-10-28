import type { SharedDesk } from "../../shared/desk.ts";

/** The shared Desk, kept in memory and saved through `persist` on each change. */
export class DeskStore {
  private desk: SharedDesk | null;
  private readonly persist: (desk: SharedDesk) => void;

  constructor(desk: SharedDesk | null, persist: (desk: SharedDesk) => void) {
    this.desk = desk;
    this.persist = persist;
  }

  get(): SharedDesk | null {
    return this.desk;
  }

  set(desk: SharedDesk): void {
    this.persist(desk);
    this.desk = desk;
  }
}
