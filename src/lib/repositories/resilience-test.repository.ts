/**
 * Resilience test persistence boundary.
 *
 * Same idea as the incident history repository: services depend only on this
 * interface, so a SupabaseResilienceTestRepository can replace the in-memory
 * one without touching services, routes, or UI.
 */

import type { ResilienceTest } from "@/lib/types/resilience";

export interface ResilienceTestRepository {
  /** Insert or replace a test record (keyed by testId). */
  saveTest(test: ResilienceTest): Promise<ResilienceTest>;
  getTestById(testId: string): Promise<ResilienceTest | null>;
  /** Newest first. */
  listTests(limit?: number): Promise<ResilienceTest[]>;
  /** The single running test, if any (only one may own the simulator). */
  findRunningTest(): Promise<ResilienceTest | null>;
  /** Generates the next test id. */
  nextTestId(): Promise<string>;
}

export class InMemoryResilienceTestRepository
  implements ResilienceTestRepository
{
  private tests = new Map<string, ResilienceTest>();
  private seq = 1;

  async saveTest(test: ResilienceTest): Promise<ResilienceTest> {
    const copy = structuredClone(test);
    this.tests.set(copy.testId, copy);
    return structuredClone(copy);
  }

  async getTestById(testId: string): Promise<ResilienceTest | null> {
    const found = this.tests.get(testId);
    return found ? structuredClone(found) : null;
  }

  async listTests(limit?: number): Promise<ResilienceTest[]> {
    const rows = Array.from(this.tests.values()).sort((a, b) =>
      b.startedAt.localeCompare(a.startedAt),
    );
    return rows.slice(0, limit ?? rows.length).map((t) => structuredClone(t));
  }

  async findRunningTest(): Promise<ResilienceTest | null> {
    const running = Array.from(this.tests.values()).find(
      (test) => test.overallStatus === "running",
    );
    return running ? structuredClone(running) : null;
  }

  async nextTestId(): Promise<string> {
    const id = `RT-${String(this.seq).padStart(3, "0")}`;
    this.seq += 1;
    return id;
  }

  /** Test helper. */
  clear(): void {
    this.tests.clear();
    this.seq = 1;
  }
}
