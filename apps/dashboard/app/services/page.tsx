"use client";

import { AsciiArt, asciiVault } from "@/components/asciiArt";
import { useRef } from "react";
import dynamic from "next/dynamic";
import { motion } from "motion/react";
import { serviceStatusSchema } from "@cordon/shared";
import { ServiceCard, breakerState } from "@/components/serviceCard";
import { PageHeader, QueryState } from "@/components/ui";
import { usePolled } from "@/lib/api";
import { useWebgl } from "@/lib/useWebgl";

const BreakerScene = dynamic(() => import("@/components/breakerScene"), { ssr: false });

export default function ServicesPage() {
  const services = usePolled("watcher", "/services", serviceStatusSchema.array());
  const webgl = useWebgl();
  const slots = useRef(new Map<string, HTMLElement>());
  return (
    <>
      <PageHeader title="Services behind the breaker">
        Each sidecar stops its service while a Sealed version sits in its lockfile.
      </PageHeader>
      <QueryState
        query={services}
        loading="Loading service status from the watcher."
        empty="No sidecar has reported yet."
        emptyArt={<AsciiArt art={asciiVault} />}
        isEmpty={(items) => items.length === 0}
      >
        {(items) => (
          <div className="relative">
            <div className="grid items-start gap-x-12 gap-y-14 sm:grid-cols-3">
              {items.map((item, index) => (
                <motion.div
                  key={item.service}
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{ duration: 0.55, delay: index * 0.09, ease: [0.2, 0.8, 0.3, 1] }}
                >
                  <ServiceCard
                    status={item}
                    slot={
                      webgl
                        ? (node) => {
                            if (node) slots.current.set(item.service, node);
                            else slots.current.delete(item.service);
                          }
                        : undefined
                    }
                  />
                </motion.div>
              ))}
            </div>
            {webgl && <BreakerScene items={items.map((item) => ({ id: item.service, state: breakerState(item) }))} slots={slots} />}
          </div>
        )}
      </QueryState>
    </>
  );
}
