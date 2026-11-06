"use client";

import { motion } from "motion/react";

export function WordReveal({ text, className }: { text: string; className?: string }) {
  return (
    <h1 key={text} className={className}>
      {text.split(" ").map((word, index) => (
        <motion.span
          key={`${word}${index}`}
          className="inline-block"
          initial={{ opacity: 0, y: "0.45em", rotateX: -40 }}
          animate={{ opacity: 1, y: 0, rotateX: 0 }}
          transition={{ duration: 0.6, delay: index * 0.07, ease: [0.2, 0.8, 0.3, 1] }}
        >
          {word}
          {index < text.split(" ").length - 1 && " "}
        </motion.span>
      ))}
    </h1>
  );
}
