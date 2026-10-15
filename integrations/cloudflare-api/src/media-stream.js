/**
 * Fetch a private signed media URL from the Worker, not from the browser.
 * Signed storage URLs can redirect to a CDN/object host; following those
 * redirects server-side avoids cross-origin CORS failures in the browser.
 */
export async function fetchPrivateMedia(url, fetcher = fetch) {
  const response = await fetcher(url, {
    method: "GET",
    redirect: "follow",
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok || !response.body) {
    throw new Error("Private media upstream did not return a readable object");
  }
  return response;
}
