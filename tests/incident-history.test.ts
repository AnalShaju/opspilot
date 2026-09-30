import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  InMemoryIncidentHistoryRepository,
  type IncidentHistoryRepository,
} from "@/lib/repositories/incident-history.repository";
import { createIncidentHistoryService } from "@/lib/services/incident-history.service";
import { makeHistoryInput, makeIncident } from "@tests/helpers";

function setup() {
  const repository = new InMemoryIncidentHistoryRepository();
  const service = createIncidentHistoryService(() => repository);
  return { repository, service };
}

describe("incident history: saving", () => {
  test("resolved incident gets added to history", async () => {
    const { repository, service } = setup();

    const saved = await service.recordOutcome(makeIncident());

    assert.ok(saved);
    assert.equal(saved.outcome, "resolved");
    assert.equal(saved.incidentId, "INC-100");
    assert.equal(saved.service, "Orders Service");
    assert.equal(saved.incidentType, "cache_failure");
    assert.equal(saved.actionType, "restart_redis");
    assert.equal(saved.actionTarget, "Redis");
    assert.equal(saved.confidence, 0.9);
    assert.equal(saved.recoveryDurationMs, 42_000);
    assert.match(saved.verificationResult, /verification passed/);

    const resolved = await repository.getResolvedIncidents();
    assert.equal(resolved.length, 1);
  });

  test("stores only summary facts, not raw evidence payloads", async () => {
    const { service } = setup();
    const incident = makeIncident({
      investigation: {
        startedAt: "2026-09-30T10:00:00.000Z",
        evidence: {
          collectedAt: "2026-09-30T10:00:00.000Z",
          bag: { getLogs: [{ message: "secret-token=abc123" }] },
        },
      },
    });

    const saved = await service.recordOutcome(incident);

    assert.ok(saved);
    assert.ok(!JSON.stringify(saved).includes("secret-token"));
  });

  test("failed remediation is not treated as a successful learned incident", async () => {
    const { repository, service } = setup();
    const incident = makeIncident({
      status: "failed",
      recovery: {
        action: "restart_redis",
        target: "Redis",
        executed: false,
        executedAt: "2026-09-30T10:00:31.000Z",
        result: "Simulator request failed (400)",
      },
    });

    const saved = await service.recordOutcome(incident);

    assert.ok(saved);
    assert.equal(saved.outcome, "failed");
    assert.equal((await repository.getResolvedIncidents()).length, 0);
    assert.equal((await repository.getFailedAttempts()).length, 1);
    assert.deepEqual(
      await repository.getRelevantPreviousIncidents({
        service: "Orders Service",
        incidentType: "cache_failure",
      }),
      [],
    );
  });

  test("failed verification is not stored as resolved", async () => {
    const { repository, service } = setup();
    const incident = makeIncident({
      status: "failed",
      recovery: {
        action: "restart_redis",
        target: "Redis",
        executed: true,
        executedAt: "2026-09-30T10:00:31.000Z",
        result: "Redis restarted",
        verified: false,
        verifiedAt: "2026-09-30T10:00:40.000Z",
      },
    });

    const saved = await service.recordOutcome(incident);

    assert.equal(saved?.outcome, "failed");
    assert.equal((await repository.getResolvedIncidents()).length, 0);
    assert.equal((await repository.getFailedAttempts()).length, 1);
  });

  test("unresolved incidents without a recovery are not stored", async () => {
    const { repository, service } = setup();

    const saved = await service.recordOutcome(
      makeIncident({ status: "awaiting_approval", recovery: undefined }),
    );

    assert.equal(saved, null);
    assert.equal((await repository.getResolvedIncidents()).length, 0);
    assert.equal((await repository.getFailedAttempts()).length, 0);
  });

  test("history storage failure does not throw", async () => {
    const broken = {
      saveResolvedIncident: async () => {
        throw new Error("db down");
      },
    } as unknown as IncidentHistoryRepository;
    const service = createIncidentHistoryService(() => broken);

    assert.equal(await service.recordOutcome(makeIncident()), null);
  });
});

describe("incident history: relevant previous incidents", () => {
  test("retrieves previous incidents for a matching service", async () => {
    const { repository, service } = setup();
    await repository.saveResolvedIncident(makeHistoryInput());
    await repository.saveResolvedIncident(
      makeHistoryInput({
        incidentId: "INC-051",
        service: "Payment Service",
        incidentType: "deployment_regression",
        actionType: "rollback",
        actionTarget: "v1.8.4",
      }),
    );

    const relevant = await service.getRelevantForIncident(
      { service: "Payment Service" },
      { incidentType: "deployment_regression" },
    );

    assert.equal(relevant.length, 1);
    assert.equal(relevant[0].service, "Payment Service");
    assert.equal(relevant[0].actionType, "rollback");
  });

  test("matches on incident type when the service differs", async () => {
    const { repository } = setup();
    await repository.saveResolvedIncident(
      makeHistoryInput({
        service: "Payment Service",
        incidentType: "deployment_regression",
        actionType: "rollback",
      }),
    );

    const relevant = await repository.getRelevantPreviousIncidents({
      service: "Users Service",
      incidentType: "deployment_regression",
    });

    assert.equal(relevant.length, 1);
  });

  test("does not return unrelated incidents", async () => {
    const { repository } = setup();
    await repository.saveResolvedIncident(makeHistoryInput());

    const relevant = await repository.getRelevantPreviousIncidents({
      service: "Database",
      incidentType: "database_failure",
    });

    assert.deepEqual(relevant, []);
  });

  test("ranks closer matches first, then the most recent", async () => {
    const { repository } = setup();
    // Same service + same type (score 4), but oldest.
    await repository.saveResolvedIncident(
      makeHistoryInput({
        incidentId: "A",
        resolvedAt: "2026-09-01T00:00:00.000Z",
      }),
    );
    // Same service only (score 2), newest.
    await repository.saveResolvedIncident(
      makeHistoryInput({
        incidentId: "B",
        incidentType: "unknown",
        resolvedAt: "2026-09-29T00:00:00.000Z",
      }),
    );
    // Same type only (score 2), older than B.
    await repository.saveResolvedIncident(
      makeHistoryInput({
        incidentId: "C",
        service: "Other Service",
        resolvedAt: "2026-09-20T00:00:00.000Z",
      }),
    );

    const relevant = await repository.getRelevantPreviousIncidents({
      service: "Orders Service",
      incidentType: "cache_failure",
    });

    assert.deepEqual(
      relevant.map((record) => record.incidentId),
      ["A", "B", "C"],
    );
  });

  test("never returns more than 5 even if asked for more", async () => {
    const { repository } = setup();
    for (let i = 0; i < 8; i += 1) {
      await repository.saveResolvedIncident(
        makeHistoryInput({ incidentId: `INC-${i}` }),
      );
    }

    const relevant = await repository.getRelevantPreviousIncidents({
      service: "Orders Service",
      incidentType: "cache_failure",
      limit: 50,
    });

    assert.equal(relevant.length, 5);
  });

  test("defaults to 3 previous incidents", async () => {
    const { repository } = setup();
    for (let i = 0; i < 6; i += 1) {
      await repository.saveResolvedIncident(
        makeHistoryInput({ incidentId: `INC-${i}` }),
      );
    }

    const relevant = await repository.getRelevantPreviousIncidents({
      service: "Orders Service",
      incidentType: "cache_failure",
    });

    assert.equal(relevant.length, 3);
  });

  test("looks up a record by history id or incident id", async () => {
    const { repository } = setup();
    const saved = await repository.saveResolvedIncident(makeHistoryInput());

    assert.equal((await repository.getIncidentById(saved.id))?.id, saved.id);
    assert.equal(
      (await repository.getIncidentById("INC-050"))?.id,
      saved.id,
    );
    assert.equal(await repository.getIncidentById("nope"), null);
  });
});
