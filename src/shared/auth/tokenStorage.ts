const ACCESS_TOKEN_KEY = "accessToken";

function canUseStorage(): boolean {
  return typeof window !== "undefined";
}

export function getStoredAccessToken(): string | null {
  if (!canUseStorage()) return null;

  const sessionToken = sessionStorage.getItem(ACCESS_TOKEN_KEY);
  if (sessionToken) return sessionToken;

  // Backward compatibility: migrate existing localStorage token to sessionStorage.
  const legacyToken = localStorage.getItem(ACCESS_TOKEN_KEY);
  if (!legacyToken) return null;

  sessionStorage.setItem(ACCESS_TOKEN_KEY, legacyToken);
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  return legacyToken;
}

export function setStoredAccessToken(token: string): void {
  if (!canUseStorage()) return;
  sessionStorage.setItem(ACCESS_TOKEN_KEY, token);
  localStorage.removeItem(ACCESS_TOKEN_KEY);
}

export function clearStoredAccessToken(): void {
  if (!canUseStorage()) return;
  sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(ACCESS_TOKEN_KEY);
}
