import { customName } from "./names";
import type { LabelKey, ReadStatus } from "./types";

export interface LabelInfo {
  key: LabelKey;
  /** Turkish UI name; the user's own name when renamed. */
  readonly name: string;
  defaultName: string;
  /** Sober highlight colour; used with ~35% alpha over the page. */
  color: string;
}

// Fixed, muted palette. Order is the order shown in the picker.
const label = (key: LabelKey, defaultName: string, color: string): LabelInfo => ({
  key, defaultName, color,
  get name() { return customName(`label.${key}`, defaultName); },
});

export const LABELS: readonly LabelInfo[] = [
  label("important", "Önemli", "#d9b44a"),
  label("exam", "Sınav", "#c9776b"),
  label("definition", "Tanım", "#7fa074"),
  label("example", "Örnek", "#6f93b3"),
  label("question", "Soru", "#9a88b8"),
];

const BY_KEY = new Map(LABELS.map((l) => [l.key, l]));

export function labelInfo(key: LabelKey): LabelInfo {
  return BY_KEY.get(key) ?? LABELS[0];
}

export function isLabelKey(v: string): v is LabelKey {
  return BY_KEY.has(v as LabelKey);
}

export const READ_STATUS_NAMES: Record<ReadStatus, string> = {
  unread: "Okunmadı",
  reading: "Okunuyor",
  read: "Okundu",
};

export const NEXT_READ_STATUS: Record<ReadStatus, ReadStatus> = {
  unread: "reading",
  reading: "read",
  read: "unread",
};
