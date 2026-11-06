import { timelineEventHashOf, zeroHash, type Hex32, type TimelineEvent } from "@bulkhead/shared";

export function verifyTimeline(events: TimelineEvent[], head: Hex32 | undefined) {
  const linked = events.map(
    (event, index) =>
      timelineEventHashOf(event) === event.hash && event.prevHash === (index === 0 ? zeroHash : events[index - 1]?.hash),
  );
  return {
    linked,
    brokenAt: linked.indexOf(false),
    headIndex: head ? events.findIndex((event) => event.hash === head) : -1,
  };
}
