const DEFAULT_API_BASE_URL = "https://tapatchain-api.onrender.com";

function normalizeApiBaseUrl(rawValue: string): string {
  const trimmed = String(rawValue ?? "").trim();
  if (!trimmed) return DEFAULT_API_BASE_URL;

  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : trimmed.startsWith("//")
      ? `https:${trimmed}`
      : `https://${trimmed}`;

  return withProtocol.replace(/\/+$/, "");
}

export function resolveApiBaseUrl(): string {
  const configuredValue = String(import.meta.env.VITE_API_URL ?? "").trim();
  const normalized = normalizeApiBaseUrl(configuredValue || DEFAULT_API_BASE_URL);

  // Prevent mixed-content failures when the frontend is served over HTTPS.
  if (typeof window !== "undefined" && window.location.protocol === "https:" && normalized.startsWith("http://")) {
    return normalized.replace(/^http:\/\//i, "https://");
  }

  return normalized;
}

export { DEFAULT_API_BASE_URL };
