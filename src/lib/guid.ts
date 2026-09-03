// lib/guid.ts — GUID shape check.
//
// Used for "is this an unresolvable object id?" display decisions and to
// validate hand-entered app IDs before they reach the engine or a Graph path.

export const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isGuid(value: string): boolean {
  return GUID_RE.test(value);
}
