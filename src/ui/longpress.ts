// Touch / pen long press (~500 ms) as a Svelte attachment: `{@attach longPress((x, y) => …)}`.
// Tablets (Android, iOS) have no right click; this opens the same menu. The click that follows is swallowed.
import type { Attachment } from "svelte/attachments";

export const LONG_PRESS_MS = 500;
const SLOP = 10; // px of finger drift still counted as a press

export function longPress(onpress: (x: number, y: number) => void): Attachment<HTMLElement> {
  return (el) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let start = { x: 0, y: 0 };
    let fired = false;
    const cancel = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };
    const down = (e: PointerEvent) => {
      if (e.pointerType === "mouse") return;
      fired = false;
      start = { x: e.clientX, y: e.clientY };
      cancel();
      timer = setTimeout(() => {
        timer = null;
        fired = true;
        onpress(start.x, start.y);
      }, LONG_PRESS_MS);
    };
    const move = (e: PointerEvent) => {
      if (timer && Math.hypot(e.clientX - start.x, e.clientY - start.y) > SLOP) cancel();
    };
    const click = (e: MouseEvent) => {
      if (!fired) return;
      fired = false;
      e.preventDefault();
      e.stopPropagation();
    };
    // Android also sends contextmenu on a long press; the menu is already open then.
    const ctx = (e: Event) => {
      if (fired) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", cancel);
    el.addEventListener("pointercancel", cancel);
    el.addEventListener("click", click, true);
    el.addEventListener("contextmenu", ctx, true);
    return () => {
      cancel();
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", cancel);
      el.removeEventListener("pointercancel", cancel);
      el.removeEventListener("click", click, true);
      el.removeEventListener("contextmenu", ctx, true);
    };
  };
}
