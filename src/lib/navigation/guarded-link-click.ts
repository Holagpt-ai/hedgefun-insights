import type { MouseEvent } from "react";
import { deferHandoffSideEffect } from "@/lib/navigation/defer-handoff-side-effect";

const NAV_GUARD_MS = 1_500;
let navGuardUntil = 0;

function navGuardActive(): boolean {
  return Date.now() < navGuardUntil;
}

function armNavGuard(): void {
  navGuardUntil = Date.now() + NAV_GUARD_MS;
}

/** Prevent duplicate in-flight navigations from repeated taps on mobile. */
export function guardedWorkflowLinkClick(
  event: MouseEvent<HTMLAnchorElement>,
  sideEffect?: () => void,
): void {
  if (navGuardActive()) {
    event.preventDefault();
    return;
  }
  armNavGuard();
  if (sideEffect) deferHandoffSideEffect(sideEffect);
}

export function resetNavGuardForTests(): void {
  navGuardUntil = 0;
}
