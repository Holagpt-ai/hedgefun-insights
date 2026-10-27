import type { MouseEvent } from "react";
import { deferHandoffSideEffect } from "@/lib/navigation/defer-handoff-side-effect";

const NAV_GUARD_MS = 1_500;
let navGuardUntil = 0;
let lastGuardedDestination: string | null = null;

function navGuardActive(): boolean {
  return Date.now() < navGuardUntil;
}

function armNavGuard(destination: string): void {
  navGuardUntil = Date.now() + NAV_GUARD_MS;
  lastGuardedDestination = destination;
}

function isModifiedNavigationClick(event: MouseEvent<HTMLAnchorElement>): boolean {
  if (event.defaultPrevented) return true;
  if (event.button !== 0) return true;
  return !!(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey);
}

function linkDestination(event: MouseEvent<HTMLAnchorElement>): string {
  const anchor = event.currentTarget;
  return anchor.getAttribute("href") ?? anchor.href;
}

/**
 * Prevent duplicate in-flight navigations to the same destination (rapid double-tap).
 * Unrelated destinations and modified clicks (new tab, etc.) are not blocked.
 */
export function guardedWorkflowLinkClick(
  event: MouseEvent<HTMLAnchorElement>,
  sideEffect?: () => void,
): void {
  if (isModifiedNavigationClick(event)) {
    if (sideEffect) deferHandoffSideEffect(sideEffect);
    return;
  }

  const destination = linkDestination(event);

  if (navGuardActive() && destination === lastGuardedDestination) {
    event.preventDefault();
    return;
  }

  armNavGuard(destination);
  if (sideEffect) deferHandoffSideEffect(sideEffect);
}

export function resetNavGuardForTests(): void {
  navGuardUntil = 0;
  lastGuardedDestination = null;
}
