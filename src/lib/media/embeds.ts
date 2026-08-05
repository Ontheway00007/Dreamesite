/**
 * Video and virtual-tour embed resolution.
 *
 * A property resource is a URL an administrator typed. Turning one into an
 * `<iframe src>` is handing a third party a frame inside our page, so the URL is
 * not embedded — it is *recognised*, and an embed URL is **constructed** from the
 * parts we recognised.
 *
 * That distinction is the whole design. The alternative, passing the stored URL
 * to an iframe after a `startsWith` check, fails to a `javascript:` URL, a
 * lookalike host, or a path that turns out to serve something other than a
 * player. Here, an unrecognised provider produces no iframe at all and the page
 * renders a plain link instead — which is a perfectly good outcome, and the one
 * the site had before embeds existed.
 *
 * ## Privacy
 *
 * Each provider's least-tracking embed host is used:
 *
 * - YouTube: `youtube-nocookie.com`, which does not set advertising cookies
 *   until the visitor plays the video.
 * - Vimeo: `dnt=1`, which disables its session tracking.
 *
 * Neither is a substitute for consent where consent is required. Both are
 * strictly better than the default embed, and both are chosen rather than
 * inherited from whatever the administrator pasted.
 *
 * Nothing loads until the visitor asks. The component that renders these shows a
 * poster and a play control, and creates the iframe on activation — so a
 * property page with three videos makes no third-party request until somebody
 * wants one.
 */

export type EmbedProvider = "youtube" | "vimeo";

export interface ResolvedEmbed {
  readonly provider: EmbedProvider;
  /** Opaque id, extracted from the recognised URL. */
  readonly id: string;
  /** Constructed by us, never the stored URL. */
  readonly embedUrl: string;
  /** Where to send a visitor whose browser refuses the frame. */
  readonly watchUrl: string;
  /** Provider-hosted still, when the provider offers a stable one. */
  readonly posterUrl: string | null;
  readonly providerLabel: string;
}

/** Ids are opaque, but both providers use a bounded alphabet. */
const YOUTUBE_ID = /^[A-Za-z0-9_-]{6,20}$/;
const VIMEO_ID = /^\d{6,12}$/;

/**
 * Hosts recognised for each provider, exactly.
 *
 * Compared against the parsed hostname, never matched as a substring:
 * `youtube.com.attacker.example` contains "youtube.com" and is not YouTube.
 */
const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be",
  "www.youtu.be",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);

const VIMEO_HOSTS = new Set(["vimeo.com", "www.vimeo.com", "player.vimeo.com"]);

function parse(url: string): URL | null {
  try {
    const parsed = new URL(url.trim());

    // Only ever https. A provider offering plaintext is not one we embed, and
    // this is also what excludes `javascript:` and `data:`.
    return parsed.protocol === "https:" ? parsed : null;
  } catch {
    return null;
  }
}

function youtubeIdFrom(parsed: URL): string | null {
  // youtu.be/<id>
  if (parsed.hostname === "youtu.be" || parsed.hostname === "www.youtu.be") {
    const id = parsed.pathname.slice(1).split("/")[0];
    return YOUTUBE_ID.test(id) ? id : null;
  }

  // /watch?v=<id>
  const query = parsed.searchParams.get("v");

  if (query && YOUTUBE_ID.test(query)) {
    return query;
  }

  // /embed/<id> and /shorts/<id>
  const match = /^\/(?:embed|shorts|v)\/([A-Za-z0-9_-]{6,20})/.exec(
    parsed.pathname,
  );

  return match ? match[1] : null;
}

function vimeoIdFrom(parsed: URL): string | null {
  // vimeo.com/<id>, player.vimeo.com/video/<id>, and /<id>/<hash> for unlisted
  // videos — the hash is a privacy token and is deliberately not carried into
  // the embed, because doing so would publish it in the page source.
  const match = /^\/(?:video\/)?(\d{6,12})(?:\/|$)/.exec(parsed.pathname);

  return match && VIMEO_ID.test(match[1]) ? match[1] : null;
}

/**
 * Recognises a URL and builds an embed for it, or returns null.
 *
 * Null means "render a link instead", not "something went wrong". Most virtual
 * tour providers — Matterport, Kuula, a builder's own viewer — are not in this
 * list, and a link to them is the honest presentation.
 */
export function resolveEmbed(url: string | null | undefined): ResolvedEmbed | null {
  if (!url) return null;

  const parsed = parse(url);

  if (!parsed) return null;

  const host = parsed.hostname.toLowerCase();

  if (YOUTUBE_HOSTS.has(host)) {
    const id = youtubeIdFrom(parsed);

    if (!id) return null;

    return {
      provider: "youtube",
      id,
      // Constructed from the id alone. Every query parameter the administrator
      // pasted — autoplay, a playlist, tracking — is discarded.
      embedUrl: `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1&playsinline=1`,
      watchUrl: `https://www.youtube.com/watch?v=${id}`,
      posterUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      providerLabel: "YouTube",
    };
  }

  if (VIMEO_HOSTS.has(host)) {
    const id = vimeoIdFrom(parsed);

    if (!id) return null;

    return {
      provider: "vimeo",
      id,
      embedUrl: `https://player.vimeo.com/video/${id}?dnt=1&title=0&byline=0&portrait=0`,
      watchUrl: `https://vimeo.com/${id}`,
      // Vimeo posters need an API call, which would be a third-party request
      // before the visitor asked for one. The component uses its own placeholder.
      posterUrl: null,
      providerLabel: "Vimeo",
    };
  }

  return null;
}

/**
 * Whether a URL is safe to offer as an external link.
 *
 * Weaker than `resolveEmbed` on purpose: any https URL may be linked, because a
 * link hands over nothing until the visitor clicks and the browser shows them
 * where they are going. Only the scheme matters, and it is the check that stops
 * `javascript:` reaching an `href`.
 */
export function isSafeExternalUrl(url: string | null | undefined): boolean {
  if (!url) return false;

  return parse(url) !== null;
}
