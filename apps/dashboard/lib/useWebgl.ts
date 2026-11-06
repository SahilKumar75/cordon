"use client";

import { useEffect, useState } from "react";

export function useWebgl() {
  const [webgl, setWebgl] = useState<boolean | null>(null);
  useEffect(() => {
    const probe = document.createElement("canvas");
    setWebgl(Boolean(probe.getContext("webgl2") ?? probe.getContext("webgl")));
  }, []);
  return webgl;
}
