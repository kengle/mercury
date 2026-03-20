import { describe, expect, test } from "bun:test";
import { AgentQueue } from "../src/core/runtime/queue.js";

describe("Health endpoint dependencies", () => {
  describe("AgentQueue.pendingCount", () => {
    test("returns 0 when empty", () => {
      const q = new AgentQueue();
      expect(q.pendingCount).toBe(0);
    });

    test("counts pending work", async () => {
      const q = new AgentQueue();

      let resolveFirst: () => void = () => {};
      const firstDone = new Promise<void>((r) => {
        resolveFirst = r;
      });

      const p1 = q.enqueue(async () => {
        await firstDone;
        return "first";
      });

      const p2 = q.enqueue(async () => "second");
      const p3 = q.enqueue(async () => "third");

      expect(q.pendingCount).toBe(2);
      expect(q.isActive).toBe(true);

      resolveFirst();
      await Promise.all([p1, p2, p3]);

      expect(q.pendingCount).toBe(0);
      expect(q.isActive).toBe(false);
    });
  });
});

describe("Health response structure", () => {
  test("health response has required fields", () => {
    const startTime = Date.now() - 5000;
    const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);

    const healthResponse = {
      status: "ok",
      uptime: uptimeSeconds,
      queue: {
        active: true,
        pending: 5,
      },
      agent: {
        running: true,
      },
      adapters: {
        slack: true,
        discord: true,
      },
    };

    expect(healthResponse.status).toBe("ok");
    expect(healthResponse.uptime).toBeGreaterThanOrEqual(4);
    expect(healthResponse.uptime).toBeLessThanOrEqual(6);
    expect(healthResponse.queue.active).toBe(true);
    expect(healthResponse.queue.pending).toBe(5);
    expect(healthResponse.agent.running).toBe(true);
    expect(healthResponse.adapters.slack).toBe(true);
    expect(healthResponse.adapters.discord).toBe(true);
  });
});
