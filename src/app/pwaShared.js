export function shouldReloadOnControllerChange(updateRequested) {
  return Boolean(updateRequested);
}

export async function resolveStaleWhileRevalidate({ cachedResponse, fetchFromNetwork, cacheResponse }) {
  if (cachedResponse) {
    void Promise.resolve(fetchFromNetwork())
      .then(async (response) => {
        await cacheResponse(response);
      })
      .catch(() => undefined);
    return cachedResponse;
  }

  const response = await fetchFromNetwork();
  await cacheResponse(response);
  return response;
}
