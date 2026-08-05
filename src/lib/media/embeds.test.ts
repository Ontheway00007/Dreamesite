import { describe, expect, it } from "vitest";

import { isSafeExternalUrl, resolveEmbed } from "@/lib/media/embeds";

/**
 * The guarantee under test: an `<iframe src>` is never a URL somebody typed.
 *
 * Every embed URL is constructed from an id extracted from a recognised host.
 * Anything unrecognised returns null and the page renders a link, which is a
 * good outcome rather than a failure.
 */

describe("resolveEmbed — YouTube", () => {
  const cases = [
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtube.com/watch?v=dQw4w9WgXcQ",
    "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtu.be/dQw4w9WgXcQ",
    "https://www.youtube.com/embed/dQw4w9WgXcQ",
    "https://www.youtube.com/shorts/dQw4w9WgXcQ",
    "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
  ];

  it("recognises every URL shape the provider uses", () => {
    for (const url of cases) {
      const embed = resolveEmbed(url);

      expect(embed?.id, url).toBe("dQw4w9WgXcQ");
      expect(embed?.provider, url).toBe("youtube");
    }
  });

  it("always embeds through the no-cookie host", () => {
    // Even when the administrator pasted the tracking host.
    const embed = resolveEmbed("https://www.youtube.com/watch?v=dQw4w9WgXcQ");

    expect(embed?.embedUrl).toContain("youtube-nocookie.com");
    expect(embed?.embedUrl).not.toContain("//www.youtube.com");
  });

  it("discards every query parameter the URL carried", () => {
    // A pasted URL can carry autoplay, a playlist, or a tracking campaign. The
    // embed is built from the id, so none of it survives.
    const embed = resolveEmbed(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ&autoplay=1&list=PLxxxx&utm_source=x",
    );

    expect(embed?.embedUrl).not.toContain("autoplay");
    expect(embed?.embedUrl).not.toContain("list=");
    expect(embed?.embedUrl).not.toContain("utm_source");
  });

  it("offers a watch URL and a poster", () => {
    const embed = resolveEmbed("https://youtu.be/dQw4w9WgXcQ");

    expect(embed?.watchUrl).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(embed?.posterUrl).toContain("dQw4w9WgXcQ");
  });
});

describe("resolveEmbed — Vimeo", () => {
  it("recognises the URL shapes the provider uses", () => {
    for (const url of [
      "https://vimeo.com/123456789",
      "https://www.vimeo.com/123456789",
      "https://player.vimeo.com/video/123456789",
    ]) {
      const embed = resolveEmbed(url);

      expect(embed?.id, url).toBe("123456789");
      expect(embed?.provider, url).toBe("vimeo");
    }
  });

  it("asks Vimeo not to track", () => {
    expect(resolveEmbed("https://vimeo.com/123456789")?.embedUrl).toContain(
      "dnt=1",
    );
  });

  it("does not carry an unlisted video's privacy hash into the page source", () => {
    // The hash is what keeps an unlisted video unlisted. Putting it in the
    // embed URL publishes it to anyone reading the HTML.
    const embed = resolveEmbed("https://vimeo.com/123456789/abcdef1234");

    expect(embed?.id).toBe("123456789");
    expect(embed?.embedUrl).not.toContain("abcdef1234");
  });

  it("requests no poster, because fetching one is a third-party request", () => {
    expect(resolveEmbed("https://vimeo.com/123456789")?.posterUrl).toBeNull();
  });
});

describe("resolveEmbed — what it refuses", () => {
  it("refuses a lookalike host", () => {
    // The string contains "youtube.com". The host is not YouTube.
    for (const url of [
      "https://youtube.com.attacker.example/watch?v=dQw4w9WgXcQ",
      "https://notyoutube.com/watch?v=dQw4w9WgXcQ",
      "https://vimeo.com.evil.example/123456789",
      "https://myyoutu.be/dQw4w9WgXcQ",
    ]) {
      expect(resolveEmbed(url), url).toBeNull();
    }
  });

  it("refuses a non-https scheme", () => {
    for (const url of [
      "http://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "file:///etc/passwd",
      "//www.youtube.com/watch?v=dQw4w9WgXcQ",
    ]) {
      expect(resolveEmbed(url), url).toBeNull();
    }
  });

  it("refuses a recognised host with no usable id", () => {
    for (const url of [
      "https://www.youtube.com/",
      "https://www.youtube.com/watch?v=",
      "https://www.youtube.com/watch?v=../../etc/passwd",
      "https://vimeo.com/",
      "https://vimeo.com/notanumber",
      "https://vimeo.com/12",
    ]) {
      expect(resolveEmbed(url), url).toBeNull();
    }
  });

  it("returns null for a provider it does not know", () => {
    // Not a failure: the page links to it instead.
    for (const url of [
      "https://my.matterport.com/show/?m=abcdefghijk",
      "https://kuula.co/share/collection/abcde",
      "https://builder.example.com/tour/12",
    ]) {
      expect(resolveEmbed(url), url).toBeNull();
    }
  });

  it("handles empty and malformed input", () => {
    for (const url of [null, undefined, "", "   ", "not a url", "https://"]) {
      expect(resolveEmbed(url as string | null)).toBeNull();
    }
  });

  it("never returns an embed URL outside the two provider origins", () => {
    const allowed = [
      "https://www.youtube-nocookie.com/",
      "https://player.vimeo.com/",
    ];

    for (const url of [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://youtu.be/dQw4w9WgXcQ",
      "https://vimeo.com/123456789",
    ]) {
      const embed = resolveEmbed(url);

      expect(
        allowed.some((origin) => embed?.embedUrl.startsWith(origin)),
        embed?.embedUrl,
      ).toBe(true);
    }
  });
});

describe("isSafeExternalUrl", () => {
  it("accepts any https URL, because a link reveals itself before it acts", () => {
    expect(isSafeExternalUrl("https://my.matterport.com/show/?m=abc")).toBe(true);
    expect(isSafeExternalUrl("https://example.com/brochure.pdf")).toBe(true);
  });

  it("refuses schemes that execute or read locally", () => {
    for (const url of [
      "javascript:alert(1)",
      "data:text/html,x",
      "file:///etc/passwd",
      "http://example.com",
      "",
      null,
    ]) {
      expect(isSafeExternalUrl(url as string | null), String(url)).toBe(false);
    }
  });
});
