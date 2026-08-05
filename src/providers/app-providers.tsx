"use client";

import type { ReactNode } from "react";

import { MotionConfig } from "framer-motion";

import { SmoothScrollProvider } from "@/providers/smooth-scroll-provider";

export interface AppProvidersProps {
  children: ReactNode;
}

/**
 * Client boundary for the app shell.
 *
 * `reducedMotion="user"` makes every Framer Motion animation respect the
 * operating system preference automatically, which pairs with the explicit
 * checks GSAP and Lenis make.
 */
export function AppProviders({ children }: AppProvidersProps) {
  return (
    <MotionConfig reducedMotion="user">
      <SmoothScrollProvider>{children}</SmoothScrollProvider>
    </MotionConfig>
  );
}
