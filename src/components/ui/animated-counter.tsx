"use client";

import { useEffect, useRef, useState } from "react";
import { useMotionValue, useSpring, useTransform, motion } from "framer-motion";

export function AnimatedCounter({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  const motionValue = useMotionValue(0);
  const spring = useSpring(motionValue, { stiffness: 55, damping: 20 });
  const display = useTransform(spring, (v) => Math.round(v).toLocaleString());
  const hasRun = useRef(false);

  useEffect(() => {
    if (!hasRun.current) {
      hasRun.current = true;
      motionValue.set(value);
    }
  }, [value, motionValue]);

  return <motion.span className={className}>{display}</motion.span>;
}
