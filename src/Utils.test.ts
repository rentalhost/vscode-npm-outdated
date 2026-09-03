import { firstOf, sleep } from "@rheactor/rheactor-core";

import type { PackageAdvisory } from "#/PackageManager";
import { cacheEnabled, lazyCallback, promiseLimit, requestSafe } from "#/Utils";

const TIMER_MULTIPLIER = 3;
const TIMER_JITTER_MS = 5;

describe("utils", () => {
  it("lazy callback: immediate call", async () => {
    expect.assertions(1);

    const lazy = lazyCallback((callNumber: () => void) => {
      callNumber();
    });

    const now = Date.now();

    // Must run immediately:
    void lazy(() => {
      expect(Date.now() - now).toBeLessThan(25 * TIMER_MULTIPLIER);
    });

    await sleep(50 * TIMER_MULTIPLIER);
  });

  it("lazy callback: avoid first call", async () => {
    expect.assertions(1);

    const lazy = lazyCallback((callNumber: () => void) => {
      callNumber();
    }, 25 * TIMER_MULTIPLIER);

    const now = Date.now();

    // Must run be ignored:
    void lazy(() => {
      expect.assertions(0);
    });

    // Must run after 25ms:
    void lazy(() => {
      expect(Date.now() - now).toBeGreaterThanOrEqual(25 * TIMER_MULTIPLIER - TIMER_JITTER_MS);
    });

    await sleep(50 * TIMER_MULTIPLIER);
  });

  it("lazy callback: wait first call", async () => {
    expect.assertions(1);

    const lazy = lazyCallback((callNumber: () => void) => {
      callNumber();
    }, 25 * TIMER_MULTIPLIER);

    const now = Date.now();

    // Must run after 25ms:
    void lazy(() => {
      expect(Date.now() - now).toBeGreaterThanOrEqual(25 * TIMER_MULTIPLIER - TIMER_JITTER_MS);
    });

    await sleep(50 * TIMER_MULTIPLIER);
  });

  it("lazy callback: avoid second call", async () => {
    expect.assertions(3);

    const lazy = lazyCallback(
      (callNumber: () => void) => {
        callNumber();
      },
      0,
      25 * TIMER_MULTIPLIER,
    );

    const now = Date.now();

    // Must run immediately:
    void lazy(() => {
      expect(Date.now() - now).toBeLessThan(25 * TIMER_MULTIPLIER);
    });

    // Must be skipped: too fast call.
    void lazy(() => {
      expect.assertions(0);
    });

    // Must run after 25ms:
    void lazy(() => {
      const nowDiff = Date.now() - now;

      expect(nowDiff).toBeGreaterThanOrEqual(25 * TIMER_MULTIPLIER - TIMER_JITTER_MS);
      expect(nowDiff).toBeLessThan(50 * TIMER_MULTIPLIER);
    });

    await sleep(50 * TIMER_MULTIPLIER);
  });

  it("promise limit: prevent multiple simultaneous processes", async () => {
    expect.assertions(1);

    const processesLimit = promiseLimit(2);

    async function delay(): Promise<void> {
      await sleep(25 * TIMER_MULTIPLIER);
    }

    const now = Date.now();

    // The first two promises will execute immediately and wait 25ms to complete.
    // The third promise will wait another 25ms.
    await Promise.all([
      processesLimit(async () => delay()),
      processesLimit(async () => delay()),
      processesLimit(async () => delay()),
    ]);

    // The total time should be 50ms.
    expect(Date.now() - now).toBeGreaterThanOrEqual(50 * TIMER_MULTIPLIER - TIMER_JITTER_MS);
  });

  it("promise limit: run all processes simultaneous (no limit)", async () => {
    expect.assertions(1);

    const processesLimit = promiseLimit(0);

    async function delay(): Promise<void> {
      await sleep(25 * TIMER_MULTIPLIER);
    }

    const now = Date.now();

    // All promises must run immediately.
    await Promise.all([
      processesLimit(async () => delay()),
      processesLimit(async () => delay()),
      processesLimit(async () => delay()),
    ]);

    // The total time should be lower than 50ms.
    expect(Date.now() - now).toBeLessThan(50 * TIMER_MULTIPLIER);
  });

  it("cache enabled (mock function-only)", () => {
    expect(cacheEnabled()).toBe(true);
  });

  it("requestSafe: access to NPM Registry (advisories): empty", async () => {
    expect.assertions(1);

    const fetchSuccess = await requestSafe<Record<string, unknown>>({
      body: { "npm-outdated": ["2.0.3"] },
      headers: { "Content-Type": "application/json" },
      method: "post",
      url: "https://registry.npmjs.org/-/npm/v1/security/advisories/bulk",
    });

    expect(fetchSuccess).toStrictEqual({});
  });

  it("requestSafe: access to NPM Registry (advisories): found", async () => {
    expect.assertions(3);

    const fetchSuccess = await requestSafe<{ lodash: PackageAdvisory[] }>({
      body: { lodash: ["4.17.20"] },
      headers: { "Content-Type": "application/json" },
      method: "post",
      url: "https://registry.npmjs.org/-/npm/v1/security/advisories/bulk",
    });

    expect(fetchSuccess).toHaveProperty("lodash");
    expect(fetchSuccess?.lodash).toHaveLength(5);
    expect(firstOf(fetchSuccess!.lodash)?.url).toBe(
      "https://github.com/advisories/GHSA-35jh-r3h4-6jhm",
    );
  });

  it("requestSafe: access to NPM Registry (package)", async () => {
    expect.assertions(1);

    const fetchSuccess = await requestSafe<object>({
      headers: { Accept: "application/vnd.npm.install-v1+json" },
      url: "https://registry.npmjs.org/node-fetch",
    });

    expect(fetchSuccess).toBeInstanceOf(Object);
  }, 5000);

  it("requestSafe: access to a private NPM Registry without auth token", async () => {
    expect.assertions(1);

    const fetchSuccess = await requestSafe<{ error: string }>({
      url: "https://registry.npmjs.org/@fortawesome/pro-light-svg-icons",
    });

    expect(fetchSuccess?.error).toBe("Not found");
  });

  it("requestSafe: unreachable host resolves to undefined", async () => {
    expect.assertions(1);

    const fetchSuccess = await requestSafe({ url: "https://invalid" });

    expect(fetchSuccess).toBeUndefined();
  }, 5000);
});
