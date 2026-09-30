import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  extractJsonObject,
  runIncidentAgent,
  validateAgentDiagnosis,
} from "@/lib/ai/incident-agent";
import { HISTORY_DISCLAIMER } from "@/lib/ai/prompts";
import type { DeepSeekMessage } from "@/lib/ai/deepseek";
import type { AgentDependencies } from "@/lib/ai/incident-agent";
import { AgentError, type InvestigationStep } from "@/lib/types/agent";
import type { IncidentHistoryRecord } from "@/lib/types/history";
import {
  REDIS_DIAGNOSIS,
  makeHistoryInput,
  makeIncident,
  makeRedisEvidence,
} from "@tests/helpers";

const incident = makeIncident({
  status: "detected",
  rootCause: undefined,
  recommendedAction: undefined,
  recovery: undefined,
  approval: undefined,
});

function historyRecord(
  overrides: Partial<IncidentHistoryRecord> = {},
): IncidentHistoryRecord {
  return {
    ...makeHistoryInput(),
    id: "HIST-001",
    createdAt: "2026-09-29T10:00:00.000Z",
    ...overrides,
  };
}

function harness(options?: {
  history?: IncidentHistoryRecord[];
  modelContent?: string;
}) {
  const calls = { collect: 0, history: 0, model: 0 };
  let captured: DeepSeekMessage[] = [];

  const deps: Partial<AgentDependencies> = {
    collectEvidence: async () => {
      calls.collect += 1;
      const steps: InvestigationStep[] = [
        {
          tool: "getServices",
          status: "completed",
          startedAt: "2026-09-30T10:00:00.000Z",
        },
      ];
      return { evidence: makeRedisEvidence(), steps };
    },
    getHistory: async () => {
      calls.history += 1;
      return options?.history ?? [];
    },
    callModel: async (messages) => {
      calls.model += 1;
      captured = messages;
      return options?.modelContent ?? JSON.stringify(REDIS_DIAGNOSIS);
    },
    onProgress: () => {},
  };

  return { deps, calls, messages: () => captured };
}

describe("incident agent: exactly one DeepSeek call", () => {
  test("collects all evidence first, then makes ONE model call", async () => {
    const { deps, calls } = harness({ history: [historyRecord()] });

    const result = await runIncidentAgent(incident, deps);

    assert.equal(calls.collect, 1);
    assert.equal(calls.history, 1);
    assert.equal(calls.model, 1, "DeepSeek must be called exactly once");
    assert.equal(result.aiCallCount, 1);
    assert.equal(result.diagnosis.recommendedAction.type, "restart_redis");
  });

  test("the model call never offers tools (it cannot act or fetch)", async () => {
    const { deps, messages } = harness();

    await runIncidentAgent(incident, deps);

    const roles = messages().map((message) => message.role);
    assert.deepEqual(roles, ["system", "user"]);
  });

  test("invalid model output fails clearly without a second call", async () => {
    const { deps, calls } = harness({ modelContent: "not json at all" });

    await assert.rejects(
      () => runIncidentAgent(incident, deps),
      (error: unknown) =>
        error instanceof AgentError && error.code === "INVALID_JSON",
    );
    assert.equal(calls.model, 1, "no retry / re-ask");
  });
});

describe("incident agent: history context", () => {
  test("previous incidents are included in the DeepSeek context", async () => {
    const previous = historyRecord({
      rootCause: "Sentinel root cause from an earlier outage",
      service: "Orders Service",
    });
    const { deps, messages } = harness({ history: [previous] });

    const result = await runIncidentAgent(incident, deps);

    const user = messages()[1].content ?? "";
    assert.match(user, /PREVIOUS RESOLVED INCIDENTS/);
    assert.match(user, /Incident 1:/);
    assert.match(user, /Sentinel root cause from an earlier outage/);
    assert.match(user, /restart_redis Redis/);
    assert.deepEqual(
      result.historyUsed.map((record) => record.id),
      ["HIST-001"],
    );
  });

  test("current evidence stays primary and history is labeled as context only", async () => {
    const { deps, messages } = harness({ history: [historyRecord()] });

    await runIncidentAgent(incident, deps);

    const system = messages()[0].content ?? "";
    const user = messages()[1].content ?? "";

    const currentAt = user.indexOf("CURRENT EVIDENCE (primary source of truth)");
    const previousAt = user.indexOf("PREVIOUS RESOLVED INCIDENTS");
    assert.ok(currentAt >= 0 && previousAt > currentAt);

    // Current data lives in the current section, not the history section.
    const currentSection = user.slice(currentAt, previousAt);
    assert.match(currentSection, /Redis/);
    assert.match(currentSection, /Orders Service/);

    // The instruction not to copy history is in both messages.
    assert.ok(system.includes(HISTORY_DISCLAIMER));
    assert.ok(user.includes(HISTORY_DISCLAIMER));
    assert.match(system, /Never copy a previous incident/);
  });

  test("states clearly when there is no relevant history", async () => {
    const { deps, messages } = harness({ history: [] });

    await runIncidentAgent(incident, deps);

    assert.match(
      messages()[1].content ?? "",
      /No relevant previous resolved incidents are available/,
    );
  });
});

describe("AI action validation", () => {
  const context = {
    evidence: { deployments: makeRedisEvidence().deployments },
    incidentService: "Payment Service",
    detectedIncidentType: "deployment_regression" as const,
  };

  function diagnosis(action: Record<string, unknown>) {
    return { ...REDIS_DIAGNOSIS, recommendedAction: action };
  }

  test("rejects unsupported action types", () => {
    for (const type of ["delete_database", "scale_up", "shell", ""]) {
      assert.throws(
        () =>
          validateAgentDiagnosis(
            diagnosis({ type, target: "x", risk: "low", reason: "r" }),
            context,
          ),
        (error: unknown) =>
          error instanceof AgentError && error.code === "INVALID_ACTION",
        `should reject "${type}"`,
      );
    }
  });

  test("accepts the three supported actions", () => {
    const redis = validateAgentDiagnosis(
      diagnosis({ type: "restart_redis", target: "anything", risk: "low", reason: "r" }),
      context,
    );
    assert.equal(redis.recommendedAction.target, "Redis");

    const db = validateAgentDiagnosis(
      diagnosis({ type: "recover_database", target: "x", risk: "medium", reason: "r" }),
      context,
    );
    assert.equal(db.recommendedAction.target, "Database");

    const rollback = validateAgentDiagnosis(
      diagnosis({
        type: "rollback",
        target: "v1.8.4",
        service: "Payment Service",
        risk: "high",
        reason: "r",
      }),
      context,
    );
    assert.equal(rollback.recommendedAction.target, "v1.8.4");
    assert.equal(rollback.recommendedAction.service, "Payment Service");
  });

  test("rollback of a version that is not in the evidence is rejected", () => {
    assert.throws(
      () =>
        validateAgentDiagnosis(
          diagnosis({ type: "rollback", target: "v9.9.9", risk: "low", reason: "r" }),
          context,
        ),
      (error: unknown) =>
        error instanceof AgentError && error.code === "INVALID_ACTION",
    );
  });

  test("rollback naming the previous version maps to the ACTIVE version of that service", () => {
    const result = validateAgentDiagnosis(
      diagnosis({
        type: "rollback",
        target: "v2.2.1",
        service: "Users Service",
        risk: "medium",
        reason: "r",
      }),
      context,
    );

    assert.equal(result.recommendedAction.target, "v2.3.0");
    assert.equal(result.recommendedAction.service, "Users Service");
  });

  test("model-supplied incident type is used, otherwise the signal-based one", () => {
    const withType = validateAgentDiagnosis(REDIS_DIAGNOSIS, context);
    assert.equal(withType.incidentType, "cache_failure");

    const without = validateAgentDiagnosis(
      { ...REDIS_DIAGNOSIS, incidentType: "made-up" },
      context,
    );
    assert.equal(without.incidentType, "deployment_regression");
  });

  test("repairs recommendedAction mistakenly nested inside rootCause, and still validates it", () => {
    const nested = {
      ...REDIS_DIAGNOSIS,
      recommendedAction: undefined,
      rootCause: {
        ...REDIS_DIAGNOSIS.rootCause,
        recommendedAction: REDIS_DIAGNOSIS.recommendedAction,
      },
    };

    const result = validateAgentDiagnosis(nested, context);
    assert.equal(result.recommendedAction.type, "restart_redis");
    assert.equal(
      "recommendedAction" in result.rootCause,
      false,
      "rootCause stays clean",
    );

    // The lifted action is not trusted blindly.
    const unsafe = {
      ...nested,
      rootCause: {
        ...nested.rootCause,
        recommendedAction: {
          type: "delete_database",
          target: "x",
          risk: "low",
          reason: "r",
        },
      },
    };
    assert.throws(
      () => validateAgentDiagnosis(unsafe, context),
      (error: unknown) =>
        error instanceof AgentError && error.code === "INVALID_ACTION",
    );
  });

  test("extractJsonObject repairs a forgotten closing brace but nothing worse", () => {
    const missingBrace = '{"a":{"b":[1,2],"c":"x}"}';
    assert.deepEqual(extractJsonObject(missingBrace), {
      a: { b: [1, 2], c: "x}" },
    });
    assert.throws(() => extractJsonObject('{"a":"unterminated'), AgentError);
    assert.throws(() => extractJsonObject('{"a":[}'), AgentError);
    assert.throws(() => extractJsonObject("not json"), AgentError);
  });

  test("rejects malformed diagnoses", () => {
    assert.throws(() => validateAgentDiagnosis(null, context), AgentError);
    assert.throws(
      () =>
        validateAgentDiagnosis(
          { ...REDIS_DIAGNOSIS, rootCause: { summary: "x", confidence: 4, evidence: ["e"] } },
          context,
        ),
      AgentError,
    );
    assert.throws(
      () => validateAgentDiagnosis({ rootCause: REDIS_DIAGNOSIS.rootCause }, context),
      AgentError,
    );
  });
});
