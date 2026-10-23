/** Caches successful response text; failures remain retryable and in-flight requests stay independent. */
export async function fetchCachedText(cache: Map<string, string>, key: string, url: string): Promise<string> {
  const cached = cache.get(key);
  if (cached !== undefined) return cached;
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(
      `Response status code does not indicate success: ${response.status} (${response.statusText || "Error"}).`,
    );
  const text = await response.text();
  cache.set(key, text);
  return text;
}
