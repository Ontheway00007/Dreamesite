"use client";

import { useState } from "react";
import { Play } from "lucide-react";

import type { ResolvedEmbed } from "@/lib/media/embeds";

export interface LazyEmbedProps {
  readonly embed: ResolvedEmbed;
  /** Shown as the heading and used in the iframe's accessible name. */
  readonly title: string;
  readonly caption?: string;
}

/**
 * A third-party player that loads nothing until it is asked to.
 *
 * ## Why click-to-load
 *
 * An `<iframe>` in the markup is a request the moment the page renders: scripts,
 * cookies and a device fingerprint handed to a third party for a video most
 * visitors will not watch. On a property page with a tour and drone footage that
 * is two, before anybody has scrolled.
 *
 * So the frame does not exist until activation. Until then this is a poster, a
 * heading and a button — no third-party bytes, no third-party cookies, and one
 * less thing competing with the images that matter.
 *
 * `loading="lazy"` alone would not do it: it defers by viewport position, and a
 * visitor who scrolls past still pays. Consent is a better trigger than
 * proximity.
 *
 * ## Why the sandbox
 *
 * The frame gets the minimum it needs to play a video:
 *
 * - `allow-scripts` — players are JavaScript.
 * - `allow-same-origin` — the player reads its own origin's storage.
 * - `allow-presentation` — casting to a TV.
 * - `allow-popups` plus `allow-popups-to-escape-sandbox` — the provider's
 *   "watch on…" link opens a normal tab rather than a sandboxed one, which would
 *   otherwise break.
 *
 * Deliberately absent: `allow-top-navigation`, so the frame cannot redirect the
 * page it sits in, and `allow-forms`, because a video player has nothing to
 * submit. `allow` carries `fullscreen`, `encrypted-media` and `picture-in-picture`
 * and nothing else — no camera, microphone or geolocation.
 *
 * `referrerPolicy` sends the origin rather than the full URL, so the provider
 * learns the site and not which property is being viewed.
 */
export function LazyEmbed({ embed, title, caption }: LazyEmbedProps) {
  const [active, setActive] = useState(false);

  return (
    <figure className="border-border bg-surface overflow-hidden rounded-xl border">
      <div className="relative aspect-video w-full">
        {active ? (
          <iframe
            // Constructed by `resolveEmbed` from a recognised id — never a
            // stored URL. See lib/media/embeds.ts.
            src={embed.embedUrl}
            title={`${title} — ${embed.providerLabel} player`}
            className="absolute inset-0 h-full w-full"
            allow="fullscreen; encrypted-media; picture-in-picture"
            sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox"
            referrerPolicy="strict-origin"
            loading="lazy"
          />
        ) : (
          <button
            type="button"
            onClick={() => setActive(true)}
            className="group absolute inset-0 flex h-full w-full items-center justify-center"
          >
            {/*
              The provider's own still. A plain <img>, not next/image: it is one
              third-party image behind a click, and routing it through the
              optimiser would add a server round trip for something most
              visitors never see. `aria-hidden` because the button already names
              itself.
            */}
            {embed.posterUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={embed.posterUrl}
                alt=""
                aria-hidden="true"
                loading="lazy"
                decoding="async"
                className="absolute inset-0 h-full w-full object-cover opacity-70 transition-opacity duration-(--duration-base) group-hover:opacity-90"
              />
            ) : (
              <span
                aria-hidden="true"
                className="bg-background-alt absolute inset-0"
              />
            )}

            <span className="relative flex flex-col items-center gap-3">
              <span className="border-accent bg-background/70 text-accent flex size-14 items-center justify-center rounded-full border backdrop-blur-sm transition-transform duration-(--duration-base) group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100">
                <Play size={20} aria-hidden />
              </span>
              {/* The accessible name says what will happen, including that a
                  third party becomes involved. */}
              <span className="text-foreground text-sm font-medium">
                Play {title}
                <span className="sr-only"> — loads the {embed.providerLabel} player</span>
              </span>
            </span>
          </button>
        )}
      </div>

      <figcaption className="border-border border-t px-5 py-4">
        <p className="text-foreground text-sm font-medium">{title}</p>
        <p className="text-foreground-subtle mt-1 text-xs leading-relaxed">
          {caption ? `${caption} ` : ""}
          Plays on {embed.providerLabel}.{" "}
          {/* The fallback: a browser or extension that blocks the frame still
              leaves a way to watch. */}
          <a
            href={embed.watchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground-muted underline decoration-dotted"
          >
            Open on {embed.providerLabel}
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </p>
      </figcaption>
    </figure>
  );
}
