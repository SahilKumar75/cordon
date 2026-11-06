"use client";

import { serviceStatusSchema } from "@cordon/shared";
import { ServiceCard } from "@/components/serviceCard";
import { PageHeader, QueryState } from "@/components/ui";
import { usePolled } from "@/lib/api";

export default function ServicesPage() {
  const services = usePolled("watcher", "/services", serviceStatusSchema.array());
  return (
    <>
      <PageHeader title="Services">
        Guard sidecar status for each running service, as last reported to the watcher. A service whose sidecar is unhealthy stops
        serving until the lockfile is clean again.
      </PageHeader>
      <QueryState
        query={services}
        loading="Loading service status from the watcher."
        empty="No service has reported yet. A sidecar reports here when GUARD_REPORT_URL points at the watcher."
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
