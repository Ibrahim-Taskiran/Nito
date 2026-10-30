// App frame state: sidebar collapsed to an icon rail (per device), phone drawer open, cards due today.
import { pref, savePref } from "./library.svelte";

class Shell {
  // Tablet portrait starts with the icon rail so the page keeps its width; the user's choice wins afterwards.
  collapsed = $state(pref("nito.sidebar", ["full", "rail", "auto"], "auto") === "rail" ||
    (pref("nito.sidebar", ["full", "rail", "auto"], "auto") === "auto" && innerWidth < 1100));
  drawer = $state(false);
  due = $state(0);

  toggleCollapsed(): void {
    this.collapsed = !this.collapsed;
    savePref("nito.sidebar", this.collapsed ? "rail" : "full");
  }
}

export const shell = new Shell();
