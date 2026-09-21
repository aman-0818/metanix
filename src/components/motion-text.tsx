"use client";
import { motion, useReducedMotion } from "framer-motion";

/** Loaded only after a visitor interacts with the approach sequence. */
export default function MotionText({ children }: { children: React.ReactNode }) {
  const reduced = useReducedMotion();
  return <motion.p initial={reduced ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .2 }}>{children}</motion.p>;
}
