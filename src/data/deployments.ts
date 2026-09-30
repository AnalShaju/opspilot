import type { Deployment } from "./types";

export const deployments: Deployment[] = [
  {
    id: "dep-1",
    version: "v1.8.4",
    service: "Payment Service",
    serviceId: "payment",
    deployedAt: "2026-09-30T14:30:00",
    deployedLabel: "14:30",
    status: "triggered_incident",
    author: "jordan.lee",
    commit: "a3f91c2",
    notes: "Refactor connection pool defaults",
  },
  {
    id: "dep-2",
    version: "v1.8.3",
    service: "Orders Service",
    serviceId: "orders",
    deployedAt: "2026-09-30T12:10:00",
    deployedLabel: "12:10",
    status: "successful",
    author: "maya.chen",
    commit: "91bc4e0",
    notes: "Batch order status updates",
  },
  {
    id: "dep-3",
    version: "v1.8.2",
    service: "Users Service",
    serviceId: "users",
    deployedAt: "2026-09-30T09:42:00",
    deployedLabel: "09:42",
    status: "successful",
    author: "sam.okonkwo",
    commit: "c12e7aa",
    notes: "Session token rotation",
  },
];

export function getRecentDeployments(limit = 3): Deployment[] {
  return deployments.slice(0, limit);
}
