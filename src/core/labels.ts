import type { LabelKey, ReadStatus } from "./types";

export interface LabelInfo {
  key: LabelKey;
  name: string; // Turkish UI name
  /** Sober highlight colour; used with ~35% alpha over the page. */
  color: string;
}

// Fixed, muted palette. Order is the order shown in the picker.
export const LABELS: readonly LabelInfo[] = [
  { key: "important", name: "Önemli", color: "#d9b44a" },
  { key: "exam", name: "Sınav", color: "#c9776b" },
  { key: "definition", name: "Tanım", color: "#7fa074" },
  { key: "example", name: "Örnek", color: "#6f93b3" },
  { key: "question", name: "Soru", color: "#9a88b8" },
];

const BY_KEY = new Map(LABELS.map((l) => [l.key, l]));

export function labelInfo(key: LabelKey): LabelInfo {
  return BY_KEY.get(key) ?? LABELS[0];
}

export function isLabelKey(v: string): v is LabelKey {
  return BY_KEY.has(v as LabelKey);
}

// Colours of the old library's default palette mapped to our labels.
const LEGACY_COLORS: Record<string, LabelKey> = {
  "#ffd400": "important",
  "#ff6666": "exam",
  "#5fb236": "definition",
  "#2ea8e5": "example",
  "#a28ae5": "question",
};

export function labelFromLegacyColor(color: string | null | undefined): LabelKey {
  return LEGACY_COLORS[(color ?? "").toLowerCase()] ?? "important";
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
