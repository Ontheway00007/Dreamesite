"use client";

import type { ReactNode } from "react";

import { motion } from "framer-motion";

import {
  fadeIn,
  fadeUp,
  inViewOptions,
  staggerContainer,
} from "@/lib/animation/variants";
import { cn } from "@/lib/utils/cn";

const revealVariants = {
  up: fadeUp,
  in: fadeIn,
} as const;

export type RevealVariant = keyof typeof revealVariants;

export interface RevealProps {
  variant?: RevealVariant;
  /** Seconds to wait before the animation starts. */
  delay?: number;
  className?: string;
  children?: ReactNode;
}

/** Animates its children into view once, when scrolled to. */
export function Reveal({
  variant = "up",
  delay = 0,
  className,
  children,
}: RevealProps) {
  return (
    <motion.div
      className={cn(className)}
      variants={revealVariants[variant]}
      initial="hidden"
      whileInView="visible"
      viewport={inViewOptions}
      transition={{ delay }}
    >
      {children}
    </motion.div>
  );
}

export interface RevealGroupProps {
  /** Seconds between each child's entrance. */
  stagger?: number;
  delay?: number;
  className?: string;
  children?: ReactNode;
}

/** Parent that releases `RevealItem` children in sequence. */
export function RevealGroup({
  stagger = 0.08,
  delay = 0,
  className,
  children,
}: RevealGroupProps) {
  return (
    <motion.div
      className={cn(className)}
      variants={staggerContainer(stagger, delay)}
      initial="hidden"
      whileInView="visible"
      viewport={inViewOptions}
    >
      {children}
    </motion.div>
  );
}

export interface RevealItemProps {
  variant?: RevealVariant;
  className?: string;
  children?: ReactNode;
}

/** Child of `RevealGroup`. Inherits its timing from the parent. */
export function RevealItem({
  variant = "up",
  className,
  children,
}: RevealItemProps) {
  return (
    <motion.div className={cn(className)} variants={revealVariants[variant]}>
      {children}
    </motion.div>
  );
}
