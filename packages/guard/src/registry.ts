export type Packument = { versions?: Record<string, unknown>; time?: Record<string, string> };

export type PackumentReader = (name: string) => Promise<Packument | null>;

export function packumentReader(registryUrl: string | null, fetchFn: typeof fetch): PackumentReader {
  const cache = new Map<string, Promise<Packument | null>>();
  const load = async (name: string): Promise<Packument | null> => {
    if (!registryUrl) return null;
    const url = `${registryUrl.replace(/\/$/, "")}/${name.replace("/", "%2f")}`;
    const response = await fetchFn(url).catch(() => null);
    if (!response?.ok) return null;
    return (await response.json().catch(() => null)) as Packument | null;
  };
  return (name) => {
    const known = cache.get(name) ?? load(name);
    cache.set(name, known);
    return known;
  };
}

export function publishedAtOf(packument: Packument | null, version: string): Date | null {
  const raw = packument?.time?.[version];
  const time = raw ? Date.parse(raw) : Number.NaN;
  return Number.isNaN(time) ? null : new Date(time);
}

export function isOlderThan(publishedAt: Date | null, days: number, now: Date): boolean {
  return publishedAt !== null && now.getTime() - publishedAt.getTime() >= days * 86_400_000;
}

function coreOf(version: string): number[] {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
  return match ? match.slice(1).map(Number) : [];
}

export function compareCores(left: string, right: string): number {
  const a = coreOf(left);
  const b = coreOf(right);
  const index = [0, 1, 2].find((position) => a[position] !== b[position]);
  return index === undefined ? 0 : (a[index] ?? -1) - (b[index] ?? -1);
}

export function isRelease(version: string): boolean {
  return /^\d+\.\d+\.\d+(\+.*)?$/.test(version);
}
