import { nanoid } from "nanoid";

export function createId(prefix?: string): string {
  return prefix ? `${prefix}_${nanoid(12)}` : nanoid(12);
}

export function nowIso(): string {
  return new Date().toISOString();
}
