"use client";

import { serviceStatusSchema } from "@cordon/shared";
import { ServiceCard } from "@/components/serviceCard";
import { PageHeader, QueryState } from "@/components/ui";
import { usePolled } from "@/lib/api";

export default function ServicesPage() {
  const services = usePolled("watcher", "/services", serviceStatusSchema.array());
  return (
    <>
      <PageHeader eyebrow="03 Services" title="Services behind the breaker">
        Each guard sidecar rechecks its service&apos;s lockfile. A Sealed version, or a check that cannot run, makes the sidecar
        unhealthy, and the service stops serving until the lockfile is clean.
      </PageHeader>
      <QueryState
        query={services}
        loading="Loading service status from the watcher."
        empty="No sidecar has reported yet. Each service appears here after its first lockfile check, once GUARD_REPORT_URL points at the watcher."
        isEmpty={(items) => items.length === 0}
      >
        {(items) => (
          <div className="grid gap-6">
            {items.map((item) => (
              <ServiceCard key={item.service} status={item} />
            ))}
          </div>
        )}
      </QueryState>
    </>
  );
}
