import { cacheEnabled, fetchLite, lazyCallback, promiseLimit } from "./Utils";

import type { PackageAdvisory } from "./PackageManager";

const TIMER_MULTIPLIER = 3;

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

    await new Promise((resolve) => {
      setTimeout(resolve, 50 * TIMER_MULTIPLIER);
    });
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
      expect(Date.now() - now).toBeGreaterThanOrEqual(25 * TIMER_MULTIPLIER);
    });

    await new Promise((resolve) => {
      setTimeout(resolve, 50 * TIMER_MULTIPLIER);
    });
  });

  it("lazy callback: wait first call", async () => {
    expect.assertions(1);

    const lazy = lazyCallback((callNumber: () => void) => {
      callNumber();
    }, 25 * TIMER_MULTIPLIER);

    const now = Date.now();

    // Must run after 25ms:
    void lazy(() => {
      expect(Date.now() - now).toBeGreaterThanOrEqual(25 * TIMER_MULTIPLIER);
    });

    await new Promise((resolve) => {
      setTimeout(resolve, 50 * TIMER_MULTIPLIER);
    });
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

      expect(nowDiff).toBeGreaterThanOrEqual(25 * TIMER_MULTIPLIER);
      expect(nowDiff).toBeLessThan(50 * TIMER_MULTIPLIER);
    });

    await new Promise((resolve) => {
      setTimeout(resolve, 50 * TIMER_MULTIPLIER);
    });
  });

  it("promise limit: prevent multiple simultaneous processes", async () => {
    expect.assertions(1);

    const processesLimit = promiseLimit(2);

    async function delay(): Promise<unknown> {
      return new Promise((resolve) => {
        setTimeout(resolve, 25 * TIMER_MULTIPLIER);
      });
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
    expect(Date.now() - now).toBeGreaterThanOrEqual(50 * TIMER_MULTIPLIER);
  });

  it("promise limit: run all processes simultaneous (no limit)", async () => {
    expect.assertions(1);

    const processesLimit = promiseLimit(0);

    async function delay(): Promise<unknown> {
      return new Promise((resolve) => {
        setTimeout(resolve, 25 * TIMER_MULTIPLIER);
      });
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
    expect(cacheEnabled()).toBeTruthy();
  });

  it("fetchLite: access to NPM Registry (advisories): empty", async () => {
    expect.assertions(1);

    const fetchSuccess = await fetchLite({
      // eslint-disable-next-line @typescript-eslint/naming-convention
      body: { "npm-outdated": ["2.0.3"] },
      method: "post",
      url: "https://registry.npmjs.org/-/npm/v1/security/advisories/bulk",
    });

    expect(fetchSuccess).toStrictEqual({});
  });

  it("fetchLite: access to NPM Registry (advisories): found", async () => {
    expect.assertions(3);

    const fetchSuccess: { lodash: PackageAdvisory[] } = (await fetchLite({
      body: { lodash: ["4.17.20"] },
      method: "post",
      url: "https://registry.npmjs.org/-/npm/v1/security/advisories/bulk",
    }))!;

    expect(fetchSuccess).toHaveProperty("lodash");
    expect(fetchSuccess.lodash).toHaveLength(2);
    expect(fetchSuccess.lodash[0]!.url).toBe(
      "https://github.com/advisories/GHSA-35jh-r3h4-6jhm",
    );
  });

  it("fetchLite: access to NPM Registry (package)", async () => {
    expect.assertions(1);

    const fetchSuccess = await fetchLite({
      acceptSimplified: true,
      url: "https://registry.npmjs.org/node-fetch",
    });

    expect(fetchSuccess).toBeInstanceOf(Object);
  }, 5000);

  it("fetchLite: access to a private NPM Registry without auth token", async () => {
    expect.assertions(1);

    const fetchSuccess = await fetchLite<{ error: string }>({
      url: "https://registry.npmjs.org/@fortawesome/pro-light-svg-icons",
    });

    expect(fetchSuccess?.error).toBe("Not found");
  });

  it("fetchLite: invalid URL", async () => {
    expect.assertions(1);

    const fetchSuccess = await fetchLite({ url: "invalid" });

    expect(fetchSuccess).toBeUndefined();
  });
});
