// Downloads a picture from a web link with a size limit. Shared by the web and Tauri platforms.
import { MAX_IMAGE_BYTES, checkImageBytes, isImageContentType } from "../core/webImage";

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

const TOO_BIG = `Resim çok büyük (en çok ${MAX_IMAGE_BYTES / 1024 / 1024} MB).`;

/** Reads the body, stopping as soon as it passes the size limit. */
async function readLimited(res: Response): Promise<Uint8Array> {
  if (Number(res.headers.get("content-length") ?? 0) > MAX_IMAGE_BYTES) throw new Error(TOO_BIG);
  if (!res.body) return new Uint8Array(await res.arrayBuffer());
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_IMAGE_BYTES) {
      await reader.cancel();
      throw new Error(TOO_BIG);
    }
    parts.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** Fetches `url` and checks that it is a picture. Throws a message for the user (or a TypeError when blocked). */
export async function fetchImageWith(fetchFn: FetchLike, url: string): Promise<Uint8Array> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetchFn(url, { signal: ctrl.signal, credentials: "omit", redirect: "follow" });
    if (!res.ok) throw new Error(`Resim indirilemedi (HTTP ${res.status}).`);
    if (!isImageContentType(res.headers.get("content-type"))) throw new Error("Bu bağlantı bir resim değil, bir web sayfası.");
    const bytes = await readLimited(res);
    checkImageBytes(bytes);
    return bytes;
  } finally {
    clearTimeout(timer);
  }
}

/** Message when the site does not let the app read the picture (CORS, or no network). */
export const BLOCKED_IMAGE =
  'Bu site resmi uygulamaya vermiyor. Resmi tarayıcıda kopyalayın (sağ tık ya da basılı tutun), sonra burada Ctrl+V ya da "Panodan yapıştır".';

/** Our own messages pass through; anything else (CORS, network, plugin scope) becomes BLOCKED_IMAGE. */
export const userMessage = (e: unknown): Error =>
  e instanceof Error && !(e instanceof TypeError) && /^(Resim|Bu )/.test(e.message) ? e : new Error(BLOCKED_IMAGE);
