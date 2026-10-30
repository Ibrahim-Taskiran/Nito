import { describe, expect, it } from "vitest";
import {
  MAX_IMAGE_BYTES, checkImageBytes, decodeDataUrl, droppedImageSource, isImageContentType, parseImageUrl, sniffImage,
} from "../src/core/webImage";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);

describe("pictures from the web", () => {
  it("knows image types from their bytes", () => {
    expect(sniffImage(PNG)).toBe("png");
    expect(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("jpg");
    expect(sniffImage(new TextEncoder().encode("GIF89a"))).toBe("gif");
    expect(sniffImage(new TextEncoder().encode("RIFF1234WEBPVP8 "))).toBe("webp");
    expect(sniffImage(new TextEncoder().encode("<html>"))).toBeNull();
  });

  it("refuses non-images and huge files with a message", () => {
    expect(checkImageBytes(PNG)).toBe("png");
    expect(() => checkImageBytes(new TextEncoder().encode("<!doctype html>"))).toThrow(/resim değil/);
    const big = new Uint8Array(MAX_IMAGE_BYTES + 1);
    big.set(PNG);
    expect(() => checkImageBytes(big)).toThrow(/çok büyük/);
  });

  it("checks content types loosely", () => {
    expect(isImageContentType("image/png; charset=binary")).toBe(true);
    expect(isImageContentType(null)).toBe(true);
    expect(isImageContentType("text/html")).toBe(false);
  });

  it("accepts only http(s) links", () => {
    expect(parseImageUrl(" https://example.org/a.png ")).toBe("https://example.org/a.png");
    expect(parseImageUrl("file:///C:/x.png")).toBeNull();
    expect(parseImageUrl("javascript:alert(1)")).toBeNull();
    expect(parseImageUrl("https://u:p@example.org/a.png")).toBeNull();
    expect(parseImageUrl("not a url")).toBeNull();
  });

  it("decodes data URLs and finds the source of a dropped picture", () => {
    expect(sniffImage(decodeDataUrl("data:image/png;base64,iVBORw0KGgo=")!)).toBe("png");
    expect(decodeDataUrl("data:text/plain;base64,aGk=")).toBeNull();
    expect(droppedImageSource('<meta charset="utf-8"><img alt="x" src="https://e.org/p.jpg?a=1&amp;b=2">', ""))
      .toBe("https://e.org/p.jpg?a=1&b=2");
    expect(droppedImageSource("", "# comment\nhttps://e.org/q.png\n")).toBe("https://e.org/q.png");
    expect(droppedImageSource("<img src='/rel.png'>", "")).toBeNull();
    expect(droppedImageSource('<img src="data:image/png;base64,AAAA">', "")).toBe("data:image/png;base64,AAAA");
  });
});
