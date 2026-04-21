import { describe, expect, it, vi } from "vitest";
import {
  resolveStaleWhileRevalidate,
  resolveWaitingServiceWorker,
  shouldCacheRuntimeResponse,
  shouldReloadOnControllerChange,
} from "./pwaShared";

describe("pwaShared", () => {
  it("reloads only when the controller change belongs to an explicit update flow", () => {
    expect(shouldReloadOnControllerChange(false)).toBe(false);
    expect(shouldReloadOnControllerChange(true)).toBe(true);
  });

  it("exposes a waiting worker only when one is actually waiting behind an existing controller", () => {
    const waitingWorker = { state: "installed" };

    expect(resolveWaitingServiceWorker({ waiting: waitingWorker }, true)).toBe(waitingWorker);
    expect(resolveWaitingServiceWorker({ waiting: waitingWorker }, false)).toBeNull();
    expect(resolveWaitingServiceWorker({ waiting: null }, true)).toBeNull();
  });

  it("returns the cached response immediately and revalidates in the background", async () => {
    const cachedResponse = { source: "cache" };
    const freshResponse = { ok: true, source: "network" };
    const fetchFromNetwork = vi.fn().mockResolvedValue(freshResponse);
    const cacheResponse = vi.fn().mockResolvedValue(undefined);

    const result = await resolveStaleWhileRevalidate({
      cachedResponse,
      fetchFromNetwork,
      cacheResponse,
    });

    expect(result).toBe(cachedResponse);
    await Promise.resolve();
    await Promise.resolve();
    expect(fetchFromNetwork).toHaveBeenCalledTimes(1);
    expect(cacheResponse).toHaveBeenCalledWith(freshResponse);
  });

  it("does not cache unsuccessful runtime responses", async () => {
    const response = { ok: false, status: 500 };
    const cacheResponse = vi.fn().mockResolvedValue(undefined);

    const result = await resolveStaleWhileRevalidate({
      cachedResponse: null,
      fetchFromNetwork: vi.fn().mockResolvedValue(response),
      cacheResponse,
    });

    expect(result).toBe(response);
    expect(cacheResponse).not.toHaveBeenCalled();
    expect(shouldCacheRuntimeResponse(response)).toBe(false);
    expect(shouldCacheRuntimeResponse({ ok: true })).toBe(true);
  });

  it("rejects when both cache and network are unavailable", async () => {
    const error = new Error("offline");

    await expect(
      resolveStaleWhileRevalidate({
        cachedResponse: null,
        fetchFromNetwork: vi.fn().mockRejectedValue(error),
        cacheResponse: vi.fn(),
      }),
    ).rejects.toThrow("offline");
  });
});
