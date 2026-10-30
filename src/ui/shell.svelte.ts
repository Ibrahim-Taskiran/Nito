// App frame state: sidebar collapsed to an icon rail (per device), phone drawer open, cards due today.
import { pref, savePref } from "./library.svelte";

class Shell {
  collapsed = $state(pref("nito.sidebar", ["full", "rail"], "full") === "rail");
  drawer = $state(false);
  due = $state(0);

  toggleCollapsed(): void {
    this.collapsed = !this.collapsed;
    savePref("nito.sidebar", this.collapsed ? "rail" : "full");
  }
}

export const shell = new Shell();
