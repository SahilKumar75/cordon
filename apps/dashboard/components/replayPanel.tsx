"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { useMutation } from "@tanstack/react-query";
import { replayTimelineSchema, type ReplayTimeline } from "@cordon/shared";
import { request } from "@/lib/api";
import { formatDateTime, formatGap } from "@/lib/format";
import { Icon } from "./icon";
import { BrokenLine, Notice } from "./ui";

const redTeamUrl = "https://github.com/SahilKumar75/cordon/blob/main/docs/red_team.md";

type ReplayEvent = ReplayTimeline["events"][number] & { npm: boolean; ms: number };

const accent = (npm: boolean) =>
  npm ? { dot: "bg-copper", text: "text-copper", ring: "border-copper", icon: "pkg" as const } : { dot: "bg-persimmon", text: "text-persimmon", ring: "border-persimmon", icon: "shield" as const };

export function ReplayPanel() {
  const [advisoryId, setAdvisoryId] = useState("MAL-2026-3465");
  const replay = useMutation({
    mutationFn: (id: string) => request("detectors", "/replay", replayTimelineSchema, { advisoryId: id }),
  });
  return (
    <section className="space-y-6" aria-label="Historical replay">
      <div className="flex flex-wrap items-center justify-between gap-5">
        <form
          className="joined w-full max-w-md"
          onSubmit={(event) => {
            event.preventDefault();
            if (advisoryId.trim()) replay.mutate(advisoryId.trim());
          }}
        >
          <input value={advisoryId} onChange={(event) => setAdvisoryId(event.target.value)} placeholder="OSV advisory id" aria-label="OSV advisory id" />
          <button className="button" data-cursor="replay" disabled={!advisoryId.trim() || replay.isPending}>
            <Icon name="replay" />
            {replay.isPending ? "Building" : "Build replay"}
          </button>
        </form>
        <ReplayStamp />
      </div>
      {replay.isError && (
        <Notice icon="warning" tone="accent" art={<BrokenLine label="detectors" />}>
          {replay.error.message}
        </Notice>
      )}
      {replay.isPending && <Notice icon="clock" tone="muted" art={<BrokenLine label="loading" loading />}>Reading public sources.</Notice>}
      {!replay.data && !replay.isPending && !replay.isError && (
        <div className="panel px-5 py-6 text-[13px] text-jade">Build a replay to draw the public timeline of a past incident. Nothing is run or sealed.</div>
      )}
      {replay.data && <ReplayTimelineView data={replay.data} />}
    </section>
  );
}

function ReplayStamp() {
  return (
    <span className="inline-flex rotate-[-4deg] items-center gap-2 rounded-md border-2 border-jade px-3 py-1 font-mono text-[13px] font-semibold tracking-[0.25em] text-jade">
      <Icon name="replay" />
      REPLAY
    </span>
  );
}

function ReplayTimelineView({ data }: { data: ReplayTimeline }) {
  const events: ReplayEvent[] = data.events
    .map((event) => ({ ...event, npm: new URL(event.sourceUrl).hostname.endsWith("npmjs.org"), ms: Date.parse(event.at) }))
    .sort((a, b) => a.ms - b.ms);
  const first = events[0]?.ms ?? 0;
  const firstPublish = events.find((event) => event.npm);
  const firstAdvisory = events.find((event) => !event.npm);
  const exposure = firstPublish && firstAdvisory ? firstAdvisory.ms - firstPublish.ms : null;
  return (
    <div className="space-y-6">
      <div className="headerBand panel flex flex-wrap items-end justify-between gap-6 px-5 py-6 sm:px-7">
        <div className="min-w-0">
          <a href={data.advisoryUrl} target="_blank" rel="noreferrer" data-cursor="open" className="inline-flex items-center gap-1.5 text-[15px] underline decoration-plum underline-offset-4 hover:text-copper">
            {data.advisoryId}
            <Icon name="external" />
          </a>
          <div className="mt-2 flex flex-wrap gap-2">
            {data.packages.map((item) => (
              <span key={`${item.name}${item.version}`} className="rounded-md border border-plum bg-ground/60 px-2 py-0.5 font-mono text-[12px]">
                {item.name}@{item.version}
              </span>
            ))}
          </div>
        </div>
        {exposure !== null && (
          <div className="relative text-right">
            <div aria-hidden="true" className="glowPersimmon pointer-events-none absolute -inset-10" />
            <div className="relative text-[12px] text-jade">first publish to first advisory</div>
            <div className="relative font-display text-[40px] leading-none text-persimmon">{formatGap(exposure)}</div>
          </div>
        )}
      </div>
      {events.length === 0 ? (
        <Notice icon="info" tone="muted">The public sources list no dated events for this advisory.</Notice>
      ) : (
        <>
          <Legend />
          <HorizontalTrack events={events} first={first} />
          <VerticalTrack events={events} first={first} />
        </>
      )}
      <div className="panel flex items-start gap-3 px-5 py-4 text-[13px]">
        <span className="mt-0.5 text-jade">
          <Icon name="info" />
        </span>
        <p className="text-jade">
          On a reconstruction, the red team test showed the non registry source rule blocking installs of these versions from the first publish,
          because the payload arrives through a github dependency.{" "}
          <a href={redTeamUrl} target="_blank" rel="noreferrer" data-cursor="open" className="text-bone underline decoration-plum underline-offset-4 hover:text-copper">
            docs/red_team.md
          </a>
        </p>
      </div>
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-5 text-[12px] text-jade">
      {[true, false].map((npm) => (
        <span key={String(npm)} className="inline-flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${accent(npm).dot}`} />
          {npm ? "npm publish" : "OSV advisory"}
        </span>
      ))}
    </div>
  );
}

function EventCard({ event, first, index }: { event: ReplayEvent; first: number; index: number }) {
  const view = accent(event.npm);
  return (
    <motion.article
      className="panel lift min-w-0 px-4 py-3"
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay: 0.3 + index * 0.12, ease: [0.2, 0.8, 0.3, 1] }}
    >
      <div className={`flex items-center gap-2 text-[12px] ${view.text}`}>
        <Icon name={view.icon} />
        <span className="tabular-nums">{index === 0 ? "start" : `+${formatGap(event.ms - first)}`}</span>
      </div>
      <h3 className="mt-1.5 break-words text-[13px] leading-5 text-bone">{event.label}</h3>
      <div className="mt-1 text-[12px] text-jade">{formatDateTime(event.at)}</div>
      <a href={event.sourceUrl} target="_blank" rel="noreferrer" data-cursor="open" className="mt-2 inline-flex items-center gap-1 text-[12px] text-jade underline decoration-plum underline-offset-4 hover:text-bone">
        Source
        <Icon name="external" />
      </a>
    </motion.article>
  );
}

function HorizontalTrack({ events, first }: { events: ReplayEvent[]; first: number }) {
  const step = 100 / events.length;
  const at = (index: number) => step * index + step / 2;
  return (
    <div className="hidden sm:block">
      <div className="relative h-24">
        <div className="absolute inset-x-0 top-12 h-1.5 rounded-full bg-plum" />
        <motion.div
          className="accentTrack absolute top-12 h-1.5 origin-left rounded-full"
          style={{ left: `${at(0)}%`, right: `${100 - at(events.length - 1)}%` }}
          initial={{ scaleX: 0 }}
          whileInView={{ scaleX: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 1.1, ease: [0.65, 0, 0.35, 1] }}
        />
        {events.slice(1).map((event, index) => (
          <motion.div
            key={`gap${event.at}`}
            className="absolute top-0 flex flex-col items-center"
            style={{ left: `${at(index)}%`, width: `${step}%` }}
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.6 + index * 0.12 }}
          >
            <span className="rounded-full border border-plum bg-ground px-2 py-0.5 text-[11px] tabular-nums text-bone shadow-[var(--shadowSoft)]">
              {formatGap(event.ms - (events[index]?.ms ?? event.ms))}
            </span>
            <span className="mt-1.5 h-2 w-[calc(100%-28px)] rounded-t-md border-x border-t border-jade/50" />
          </motion.div>
        ))}
        {events.map((event, index) => (
          <motion.span
            key={`dot${event.at}${index}`}
            className={`absolute top-[54px] h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-ground shadow-[var(--shadowSoft)] ${accent(event.npm).ring}`}
            style={{ left: `${at(index)}%` }}
            initial={{ scale: 0 }}
            whileInView={{ scale: 1 }}
            viewport={{ once: true }}
            transition={{ type: "spring", stiffness: 420, damping: 18, delay: 0.2 + index * 0.12 }}
          >
            <span className={`absolute inset-[3px] rounded-full ${accent(event.npm).dot}`} />
          </motion.span>
        ))}
      </div>
      <ol className="grid gap-4" style={{ gridTemplateColumns: `repeat(${events.length}, minmax(0, 1fr))` }}>
        {events.map((event, index) => (
          <li key={`${event.label}${event.at}`}>
            <EventCard event={event} first={first} index={index} />
          </li>
        ))}
      </ol>
    </div>
  );
}

function VerticalTrack({ events, first }: { events: ReplayEvent[]; first: number }) {
  return (
    <div className="relative sm:hidden">
      <div aria-hidden="true" className="absolute bottom-4 left-[7px] top-4 w-1 rounded-full bg-plum">
        <motion.div
          className="accentTrack h-full w-full origin-top rounded-full"
          initial={{ scaleY: 0 }}
          whileInView={{ scaleY: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 1.1, ease: [0.65, 0, 0.35, 1] }}
        />
      </div>
      <ol className="relative space-y-3">
        {events.map((event, index) => (
          <li key={`${event.label}${event.at}`} className="relative pl-8">
            {index > 0 && (
              <span className="mb-2 inline-block rounded-full border border-plum bg-ground px-2 py-0.5 text-[11px] tabular-nums text-bone">
                {formatGap(event.ms - (events[index - 1]?.ms ?? event.ms))} later
              </span>
            )}
            <div className="relative">
              <span className={`absolute -left-8 top-4 h-[18px] w-[18px] rounded-full border-2 bg-ground ${accent(event.npm).ring}`}>
                <span className={`absolute inset-[3px] rounded-full ${accent(event.npm).dot}`} />
              </span>
              <EventCard event={event} first={first} index={index} />
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
