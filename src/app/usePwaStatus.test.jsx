import { renderHook, waitFor, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePwaStatus } from "./usePwaStatus";

vi.mock("../lib/utils", async () => {
  const actual = await vi.importActual("../lib/utils");
  return {
    ...actual,
    isStandaloneMode: () => false,
  };
});

function createFakeServiceWorkerEnvironment({ waiting = null, controller = {} } = {}) {
  const listeners = new Map();
  const registrationListeners = new Map();
  const registration = {
    waiting,
    installing: null,
    addEventListener: vi.fn((type, handler) => {
      registrationListeners.set(type, handler);
    }),
    removeEventListener: vi.fn((type, handler) => {
      if (registrationListeners.get(type) === handler) {
        registrationListeners.delete(type);
      }
    }),
  };
  const serviceWorker = {
    controller,
    register: vi.fn().mockResolvedValue(registration),
    getRegistrations: vi.fn().mockResolvedValue([]),
    addEventListener: vi.fn((type, handler) => {
      listeners.set(type, handler);
    }),
    removeEventListener: vi.fn((type, handler) => {
      if (listeners.get(type) === handler) {
        listeners.delete(type);
      }
    }),
  };

  return {
    registration,
    serviceWorker,
    dispatch(type) {
      listeners.get(type)?.();
    },
  };
}

describe("usePwaStatus", () => {
  beforeEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        ...window.location,
        hostname: "app.example.test",
        origin: "https://app.example.test",
        reload: vi.fn(),
      },
    });
    Object.defineProperty(window, "isSecureContext", {
      configurable: true,
      value: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("marks updates as available only when a waiting worker exists behind the active controller", async () => {
    const waitingWorker = { state: "installed", postMessage: vi.fn() };
    const { serviceWorker } = createFakeServiceWorkerEnvironment({ waiting: waitingWorker, controller: {} });
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: serviceWorker,
    });

    const { result } = renderHook(() => usePwaStatus());

    await waitFor(() => {
      expect(result.current.updateAvailable).toBe(true);
      expect(result.current.pwaRegistrationState).toBe("ready");
    });
  });

  it("reloads only after the explicit apply flow asks a waiting worker to activate", async () => {
    const waitingWorker = { state: "installed", postMessage: vi.fn() };
    const environment = createFakeServiceWorkerEnvironment({ waiting: waitingWorker, controller: {} });
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: environment.serviceWorker,
    });
    const { result } = renderHook(() => usePwaStatus());

    await waitFor(() => {
      expect(result.current.updateAvailable).toBe(true);
    });

    act(() => {
      environment.dispatch("controllerchange");
    });
    expect(window.location.reload).not.toHaveBeenCalled();

    act(() => {
      result.current.applyPwaUpdate();
    });
    expect(waitingWorker.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });

    act(() => {
      environment.dispatch("controllerchange");
    });
    expect(window.location.reload).toHaveBeenCalledTimes(1);
  });
});
