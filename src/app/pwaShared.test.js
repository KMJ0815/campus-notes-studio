import { describe, expect, it, vi } from "vitest";
import { resolveStaleWhileRevalidate, shouldReloadOnControllerChange } from "./pwaShared";

describe("pwaShared", () => {
  it("reloads only when the controller change belongs to an explicit update flow", () => {
    expect(shouldReloadOnControllerChange(false)).toBe(false);
    expect(shouldReloadOnControllerChange(true)).toBe(true);
  });

  it("returns the cached response immediately and revalidates in the background", async () => {
    const cachedResponse = { source: "cache" };
    const freshResponse = { source: "network" };
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
