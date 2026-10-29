/** Android, iPhone, or iPad (iPadOS reports itself as a Mac with touch). */
export const isMobileDevice = (): boolean =>
  /Android|iPhone|iPad/i.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
