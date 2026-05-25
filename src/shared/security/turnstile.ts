import { resolveApiBaseUrl } from "@/shared/config/apiBaseUrl";

const TURNSTILE_SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const TURNSTILE_HEADER = "X-Turnstile-Token";

const API_BASE_URL = resolveApiBaseUrl();

const envSiteKey =
  (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined) ??
  (import.meta.env.VITE_RECAPTCHA_SITE_KEY as string | undefined);

const enforceMutatingCaptcha =
  ((import.meta.env.VITE_TURNSTILE_ENFORCE_MUTATIONS as string | undefined) ?? "true").toLowerCase() !==
  "false";

export type TurnstileApi = {
  render: (
    container: string | HTMLElement,
    options: Record<string, unknown>
  ) => string;
  remove: (widgetId: string) => void;
  reset?: (widgetId?: string) => void;
  execute?: (widgetId?: string) => void;
};

let loadScriptPromise: Promise<void> | null = null;
let pendingTokenPromise: Promise<string> | null = null;
let runtimeSiteKeyPromise: Promise<string | null> | null = null;
let runtimeSiteKey: string | null | undefined = envSiteKey;
let queuedManualToken: { token: string; expiresAt: number } | null = null;

const MANUAL_TOKEN_TTL_MS = 2 * 60 * 1000;

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function getTurnstileTheme(): "light" | "dark" {
  if (!isBrowser()) return "light";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function getTurnstileApi(): TurnstileApi | null {
  if (!isBrowser()) return null;

  const win = window as Window & {
    turnstile?: TurnstileApi;
  };

  return win.turnstile ?? null;
}

export async function ensureTurnstileScriptLoaded(): Promise<void> {
  if (!isBrowser()) return;
  if (getTurnstileApi()) return;

  if (!loadScriptPromise) {
    loadScriptPromise = new Promise<void>((resolve, reject) => {
      const existingScript = document.querySelector<HTMLScriptElement>(
        `script[src="${TURNSTILE_SCRIPT_SRC}"]`
      );

      if (existingScript) {
        existingScript.addEventListener("load", () => resolve(), { once: true });
        existingScript.addEventListener(
          "error",
          () => reject(new Error("Failed to load Turnstile script.")),
          { once: true }
        );
        return;
      }

      const script = document.createElement("script");
      script.src = TURNSTILE_SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      script.addEventListener("load", () => resolve(), { once: true });
      script.addEventListener(
        "error",
        () => reject(new Error("Failed to load Turnstile script.")),
        { once: true }
      );
      document.head.appendChild(script);
    }).catch((error) => {
      loadScriptPromise = null;
      throw error;
    });
  }

  await loadScriptPromise;
}

function createHiddenContainer(): HTMLDivElement {
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.top = "-9999px";
  container.style.left = "-9999px";
  container.style.width = "1px";
  container.style.height = "1px";
  container.style.overflow = "hidden";
  container.style.pointerEvents = "none";
  container.style.opacity = "0";
  document.body.appendChild(container);
  return container;
}

async function requestTurnstileToken(): Promise<string> {
  const siteKey = await resolveTurnstileSiteKey();
  if (!siteKey) {
    throw new Error("Cloudflare Turnstile site key is not configured.");
  }

  await ensureTurnstileScriptLoaded();
  const turnstile = getTurnstileApi();
  if (!turnstile) {
    throw new Error("Turnstile API is not available.");
  }

  return new Promise<string>((resolve, reject) => {
    const container = createHiddenContainer();
    let widgetId: string | null = null;

    const cleanup = () => {
      try {
        if (widgetId && turnstile) {
          turnstile.remove(widgetId);
        }
      } catch {
        // Ignore cleanup issues so request flow can fail gracefully.
      }

      if (container.parentElement) {
        container.parentElement.removeChild(container);
      }
    };

    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for Turnstile token."));
    }, 12000);

    try {
      widgetId = turnstile.render(container, {
        sitekey: siteKey,
        callback: (token: string) => {
          window.clearTimeout(timeoutId);
          cleanup();
          resolve(token);
        },
        "expired-callback": () => {
          window.clearTimeout(timeoutId);
          cleanup();
          reject(new Error("Turnstile token expired before submission."));
        },
        "error-callback": () => {
          window.clearTimeout(timeoutId);
          cleanup();
          reject(new Error("Turnstile challenge failed."));
        },
        theme: getTurnstileTheme(),
        action: "api_submit",
        size: "flexible",
        appearance: "execute",
        execution: "execute",
      });

      if (turnstile.execute) {
        turnstile.execute(widgetId);
      }
    } catch (error) {
      window.clearTimeout(timeoutId);
      cleanup();
      reject(error instanceof Error ? error : new Error("Turnstile render failed."));
    }
  });
}

export function shouldEnforceTurnstileForMutations(): boolean {
  return enforceMutatingCaptcha;
}

export function getTurnstileHeaderName(): string {
  return TURNSTILE_HEADER;
}

export function queueManualTurnstileToken(token: string): void {
  const normalized = token.trim();
  if (!normalized) return;

  queuedManualToken = {
    token: normalized,
    expiresAt: Date.now() + MANUAL_TOKEN_TTL_MS,
  };
}

function consumeManualTurnstileToken(): string | null {
  if (!queuedManualToken) return null;

  if (Date.now() > queuedManualToken.expiresAt) {
    queuedManualToken = null;
    return null;
  }

  const token = queuedManualToken.token;
  queuedManualToken = null;
  return token;
}

export async function getTurnstileTokenForMutation(): Promise<string | null> {
  if (!shouldEnforceTurnstileForMutations()) {
    return null;
  }

  const manualToken = consumeManualTurnstileToken();
  if (manualToken) {
    return manualToken;
  }

  if (!pendingTokenPromise) {
    pendingTokenPromise = requestTurnstileToken().finally(() => {
      pendingTokenPromise = null;
    });
  }

  return pendingTokenPromise;
}

export async function resolveTurnstileSiteKey(): Promise<string | null> {
  if (typeof runtimeSiteKey === "string" && runtimeSiteKey.trim()) {
    return runtimeSiteKey;
  }

  if (runtimeSiteKey === null) {
    return null;
  }

  if (!isBrowser()) {
    runtimeSiteKey = null;
    return null;
  }

  if (!runtimeSiteKeyPromise) {
    runtimeSiteKeyPromise = fetch(`${API_BASE_URL}/api/Auth/turnstile-site-key`, {
      method: "GET",
      credentials: "include",
    })
      .then(async (response) => {
        if (!response.ok) return null;
        const payload = (await response.json()) as { siteKey?: string | null };
        const resolved = String(payload?.siteKey ?? "").trim();
        return resolved || null;
      })
      .catch(() => null)
      .finally(() => {
        runtimeSiteKeyPromise = null;
      });
  }

  runtimeSiteKey = await runtimeSiteKeyPromise;
  return runtimeSiteKey;
}
