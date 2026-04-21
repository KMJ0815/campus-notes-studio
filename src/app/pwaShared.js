export function shouldReloadOnControllerChange(updateRequested) {
  return Boolean(updateRequested);
}

export function resolveWaitingServiceWorker(registration, hasController) {
  if (!hasController) return null;
  return registration?.waiting || null;
}

export function shouldCacheRuntimeResponse(response) {
  return Boolean(response?.ok);
}

export async function resolveStaleWhileRevalidate({ cachedResponse, fetchFromNetwork, cacheResponse }) {
  if (cachedResponse) {
    void Promise.resolve(fetchFromNetwork())
      .then(async (response) => {
        if (!shouldCacheRuntimeResponse(response)) return;
        await cacheResponse(response);
      })
      .catch(() => undefined);
    return cachedResponse;
  }

  const response = await fetchFromNetwork();
  if (shouldCacheRuntimeResponse(response)) {
    await cacheResponse(response);
  }
  return response;
}
