import type { Service } from "./types";

export const services: Service[] = [
  {
    id: "api-gateway",
    name: "API Gateway",
    status: "healthy",
    uptime: "99.99%",
    errorRate: 0.02,
    latencyMs: 42,
    owner: "platform",
    version: "v3.2.1",
  },
  {
    id: "users",
    name: "Users Service",
    status: "healthy",
    uptime: "99.98%",
    errorRate: 0.05,
    latencyMs: 68,
    owner: "identity",
    version: "v1.8.2",
  },
  {
    id: "orders",
    name: "Orders Service",
    status: "healthy",
    uptime: "99.95%",
    errorRate: 0.1,
    latencyMs: 95,
    owner: "commerce",
    version: "v1.8.3",
  },
  {
    id: "payment",
    name: "Payment Service",
    status: "critical",
    uptime: "97.10%",
    errorRate: 82,
    latencyMs: 4200,
    owner: "payments",
    version: "v1.8.4",
    incidentId: "1",
  },
  {
    id: "database",
    name: "Database",
    status: "healthy",
    uptime: "99.99%",
    errorRate: 0,
    latencyMs: 12,
    owner: "data",
    version: "pg-15.4",
  },
];

export function getServiceById(id: string): Service | undefined {
  return services.find((service) => service.id === id);
}

export function getHealthyCount(): { healthy: number; total: number } {
  const healthy = services.filter((s) => s.status === "healthy").length;
  return { healthy, total: services.length };
}
