"use client";

import { useEffect, useRef } from "react";

/**
 * Cloudflare Turnstile, loaded only when a challenge is actually required.
 *
 * The script is not in the page by default. It is a third-party request on the
 * login page, and most sign-ins never need it — the throttle asks for a challenge
 * only after several failures. Loading it eagerly would hand Cloudflare a request
 * for every administrator on every visit to buy nothing.
 *
 * Renders nothing when no site key is configured, so local development needs no
 * Cloudflare account. Whether a missing challenge is *allowed* is decided on the
 * server by `isTurnstileEnforced` — this component's silence cannot weaken it.
 */

declare global {
  interface Window {
    turnstile?: {
      render: (
        element: HTMLElement,
        options: { sitekey: string; theme?: string; action?: string },
      ) => string | undefined;
      remove: (widgetId: string) => void;
    };
  }
}

const SCRIPT_ID = "cf-turnstile-script";
const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js";

export function TurnstileWidget() {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!siteKey || !container.current) {
      return;
    }

    const element = container.current;

    function render() {
      if (!window.turnstile || !element || widgetId.current) return;

      widgetId.current = window.turnstile.render(element, {
        sitekey: siteKey as string,
        // Matches the admin surface rather than defaulting to light.
        theme: "dark",
        action: "admin-login",
      });
    }

    if (window.turnstile) {
      render();
      return () => {
        if (widgetId.current) window.turnstile?.remove(widgetId.current);
        widgetId.current = undefined;
      };
    }

    // One script element even if this mounts twice, which Strict Mode does.
    let script = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;

    if (!script) {
      script = document.createElement("script");
      script.id = SCRIPT_ID;
      script.src = SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }

    script.addEventListener("load", render);

    return () => {
      script?.removeEventListener("load", render);

      if (widgetId.current) {
        window.turnstile?.remove(widgetId.current);
        widgetId.current = undefined;
      }
    };
  }, [siteKey]);

  if (!siteKey) {
    return null;
  }

  return (
    <div className="space-y-2">
      <p className="text-foreground-subtle text-xs">
        Additional verification is required after several failed attempts.
      </p>
      {/* Turnstile writes a hidden `cf-turnstile-response` input inside this
          element, which the form submits with everything else. */}
      <div ref={container} />
    </div>
  );
}
