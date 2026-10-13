export function getLoginRedirect(callbackUrl: string | null, fallback: string) {
  if (!callbackUrl || !callbackUrl.startsWith("/") || callbackUrl.startsWith("//")) return fallback;
  try {
    const origin = "https://local.invalid";
    const url = new URL(callbackUrl, origin);
    const path = decodeURIComponent(url.pathname);
    if (url.origin !== origin || path === "/setup" || path.startsWith("/setup/") ||
      path === "/api/setup" || path.startsWith("/api/setup/")) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
