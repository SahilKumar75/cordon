"use client";

import { serviceStatusSchema } from "@cordon/shared";
import { ServiceCard } from "@/components/serviceCard";
import { PageHeader, QueryState } from "@/components/ui";
import { usePolled } from "@/lib/api";

export default function ServicesPage() {
  const services = usePolled("watcher", "/services", serviceStatusSchema.array());
  return (
    <>
      <PageHeader title="Services behind the breaker">
        Each sidecar stops its service while a Sealed version sits in its lockfile.
      </PageHeader>
      <QueryState
        query={services}
        loading="Loading service status from the watcher."
        empty="No sidecar has reported yet."
        isEmpty={(items) => items.length === 0}
      >
        {(items) => (
          <div className="grid items-start gap-x-12 gap-y-14 sm:grid-cols-3">
            {items.map((item) => (
              <ServiceCard key={item.service} status={item} />
            ))}
          </div>
        )}
      </QueryState>
    </>
  );
}
