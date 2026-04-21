import { useCallback, useEffect, useRef, useState } from "react";
import { isStandaloneMode } from "../lib/utils";
import { resolveWaitingServiceWorker, shouldReloadOnControllerChange } from "./pwaShared";

export function usePwaStatus() {
  const baseUrl = import.meta.env.BASE_URL || "/";
  const [installPromptEvent, setInstallPromptEvent] = useState(null);
  const [isInstalledApp, setIsInstalledApp] = useState(false);
  const [isOnline, setIsOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const [pwaRegistrationState, setPwaRegistrationState] = useState("idle");
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const waitingWorkerRef = useRef(null);
  const updateRequestedRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const isLocalDevHost = ["127.0.0.1", "localhost"].includes(window.location.hostname);

    setIsInstalledApp(isStandaloneMode());
    setIsOnline(window.navigator.onLine);

    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setInstallPromptEvent(event);
    };

    const handleAppInstalled = () => {
      setInstallPromptEvent(null);
      setIsInstalledApp(true);
    };

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    let controllerChangeHandler = null;

    if ("serviceWorker" in navigator && window.isSecureContext && !isLocalDevHost) {
      const serviceWorkerUrl = new URL("sw.js", window.location.origin + baseUrl).toString();
      const syncWaitingState = (registration) => {
        const waitingWorker = resolveWaitingServiceWorker(registration, Boolean(navigator.serviceWorker.controller));
        waitingWorkerRef.current = waitingWorker;
        setUpdateAvailable(Boolean(waitingWorker));
        return waitingWorker;
      };

      const watchInstalling = (registration, worker) => {
        if (!worker) return;
        worker.addEventListener("statechange", () => {
          if (["installed", "activating", "activated", "redundant"].includes(worker.state)) {
            syncWaitingState(registration);
          }
        });
      };

      navigator.serviceWorker
        .register(serviceWorkerUrl, { scope: baseUrl })
        .then((registration) => {
          setPwaRegistrationState("ready");
          syncWaitingState(registration);
          registration.addEventListener("updatefound", () => {
            watchInstalling(registration, registration.installing);
          });
        })
        .catch(() => setPwaRegistrationState("missing"));

      controllerChangeHandler = () => {
        if (!shouldReloadOnControllerChange(updateRequestedRef.current)) return;
        updateRequestedRef.current = false;
        waitingWorkerRef.current = null;
        setUpdateAvailable(false);
        window.location.reload();
      };
      navigator.serviceWorker.addEventListener("controllerchange", controllerChangeHandler);
    } else if ("serviceWorker" in navigator && isLocalDevHost) {
      navigator.serviceWorker.getRegistrations()
        .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
        .then(() => {
          setUpdateAvailable(false);
          waitingWorkerRef.current = null;
          setPwaRegistrationState("unsupported");
        })
        .catch(() => setPwaRegistrationState("missing"));
    } else {
      setPwaRegistrationState("unsupported");
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      if (controllerChangeHandler && "serviceWorker" in navigator) {
        navigator.serviceWorker.removeEventListener("controllerchange", controllerChangeHandler);
      }
    };
  }, []);

  async function handleInstallApp() {
    if (!installPromptEvent) return;
    const promptEvent = installPromptEvent;
    setInstallPromptEvent(null);
    const result = await promptEvent.prompt();
    if (result?.outcome !== "accepted") {
      setInstallPromptEvent(promptEvent);
    }
  }

  const applyPwaUpdate = useCallback(() => {
    const worker = waitingWorkerRef.current;
    if (!worker) return;
    updateRequestedRef.current = true;
    worker.postMessage({ type: "SKIP_WAITING" });
  }, []);

  return {
    installPromptEvent,
    isInstalledApp,
    isOnline,
    pwaRegistrationState,
    updateAvailable,
    applyPwaUpdate,
    handleInstallApp,
  };
}
