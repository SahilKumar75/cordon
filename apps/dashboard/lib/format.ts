import type { DetectorId } from "@bulkhead/shared";

export const detectorNames: Record<DetectorId, string> = {
  staticScripts: "Static scripts",
  sandboxCanary: "Sandbox canary",
  advisoryFeed: "Advisory feed",
};

export function formatGap(ms: number) {
  const seconds = Math.max(0, ms) / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ${Math.floor(seconds % 60)} s`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ${Math.floor((seconds % 3600) / 60)} min`;
  return `${Math.floor(seconds / 86400)} d ${Math.floor((seconds % 86400) / 3600)} h`;
}

export const formatClock = (at: number | string) =>
  new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

export const formatDateTime = (at: number | string) =>
  new Date(at).toLocaleString([], { dateStyle: "medium", timeStyle: "medium" });

export const shortHash = (value: string) => `${value.slice(0, 6)}…${value.slice(-4)}`;

export const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;
