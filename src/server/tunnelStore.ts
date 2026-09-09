/**
 * Stores the Cloudflare Quick Tunnel public URL so it can be served to the
 * browser via the /api/tunnel-url endpoint.  Only populated in dev mode.
 */
let _tunnelUrl: string | null = null;

export function setTunnelUrl(url: string) {
  _tunnelUrl = url;
}

export function getTunnelUrl(): string | null {
  return _tunnelUrl;
}
