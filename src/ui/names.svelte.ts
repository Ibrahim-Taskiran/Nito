// User names for highlight labels and page flags. Stored per device, like the theme.
import { useCustomNames, type NameStore } from "../core/names";

const KEY = "nito.names";

function load(): NameStore {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return v && typeof v === "object" ? (v as NameStore) : {};
  } catch {
    return {};
  }
}

const names = $state<NameStore>(load());
useCustomNames(names);

/** Saves new names; a blank name brings the default back. */
export function rename(changes: NameStore): void {
  for (const [id, name] of Object.entries(changes)) {
    if (name?.trim()) names[id] = name.trim().slice(0, 40);
    else delete names[id];
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(names));
  } catch {
    // storage blocked: the names last for this session only
  }
}
