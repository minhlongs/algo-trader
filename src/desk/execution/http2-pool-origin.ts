/**
 * URL parsing and origin extraction utilities for HTTP/2 Connection Pool.
 *
 * @module desk/execution/http2-pool-origin
 */

/**
 * Extract origin (scheme://host:port) from URL
 */
export function extractOrigin(url: string): string {
  try {
    const urlObj = new URL(url);
    const port = urlObj.port || (urlObj.protocol === 'https:' ? '443' : '80');
    return `${urlObj.protocol}//${urlObj.hostname}:${port}`;
  } catch {
    throw new Error(`Invalid URL for HTTP/2 pool: ${url}`);
  }
}
