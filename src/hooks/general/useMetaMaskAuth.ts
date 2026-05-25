import { useEffect, useRef, useState } from "react";
import { useWallet } from "@/context/WalletContext";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: string | HTMLElement,
        options: {
          sitekey: string;
          callback?: (token: string) => void;
          "expired-callback"?: () => void;
          "error-callback"?: () => void;
          theme?: "light" | "dark" | "auto";
        }
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

interface UseMetaMaskAuthParams {
  setCurrentPage: (page: string) => void;
}

export function useMetaMaskAuth({ setCurrentPage }: UseMetaMaskAuthParams) {
  const turnstileContainerRef = useRef<HTMLDivElement | null>(null);
  const turnstileWidgetIdRef = useRef<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const turnstileSiteKey =
    (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined) ??
    (import.meta.env.VITE_RECAPTCHA_SITE_KEY as string | undefined);
  const captchaConfigured = Boolean(turnstileSiteKey);

  const {
    walletAddress,
    isConnected,
    isConnecting,
    isAuthenticated,
    userProfile,
    error,
    connectWallet,
    walletRejected,
  } = useWallet();

  useEffect(() => {
    if (walletRejected) {
      setCurrentPage("unauthorized");
    }
  }, [walletRejected, setCurrentPage]);

  useEffect(() => {
    if (!isAuthenticated || !userProfile) return;

    const specificRoles = [
      "contractor",
      "inspector",
      "auditor",
      "overseer",
      "admin",
      "rd",
      "rdc",
      "coa_admin",
    ];

    let role = userProfile.assignedRole ?? "public";

    if (role === "public" && userProfile.roles?.length) {
      const promoted = userProfile.roles.find((r) => specificRoles.includes(r));
      if (promoted) role = promoted;
    }

    const whitelistExempt = ["admin", "coa_admin"];
    if (specificRoles.includes(role) && !whitelistExempt.includes(role) && !userProfile.isWhitelisted) {
      setCurrentPage("unauthorized");
      return;
    }

    if (role === "public" && !userProfile.isWhitelisted) {
      setCurrentPage("unauthorized");
      return;
    }

    const roleToPage: Record<string, string> = { coa_admin: "overseer" };
    const target = roleToPage[role] || role;

    const knownPages = new Set([
      "contractor",
      "inspector",
      "auditor",
      "overseer",
      "admin",
      "rdc",
      "rd",
      "public",
    ]);
    setCurrentPage(knownPages.has(target) ? target : "public");
  }, [isAuthenticated, userProfile, setCurrentPage]);

  useEffect(() => {
    if (!captchaConfigured) return;

    let canceled = false;

    const renderTurnstile = () => {
      if (canceled || !window.turnstile || !turnstileContainerRef.current || turnstileWidgetIdRef.current) {
        return;
      }

      const widgetId = window.turnstile.render(turnstileContainerRef.current, {
        sitekey: turnstileSiteKey!,
        callback: (token: string) => setCaptchaToken(token),
        "expired-callback": () => setCaptchaToken(null),
        "error-callback": () => setCaptchaToken(null),
        theme: document.documentElement.classList.contains("dark") ? "dark" : "light",
      });

      turnstileWidgetIdRef.current = widgetId;
    };

    if (window.turnstile) {
      renderTurnstile();
    } else {
      const existingScript = document.querySelector<HTMLScriptElement>(
        'script[src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"]'
      );

      if (existingScript) {
        existingScript.addEventListener("load", renderTurnstile, { once: true });
      } else {
        const script = document.createElement("script");
        script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        script.async = true;
        script.defer = true;
        script.addEventListener("load", renderTurnstile, { once: true });
        document.head.appendChild(script);
      }
    }

    return () => {
      canceled = true;
      if (turnstileWidgetIdRef.current && window.turnstile) {
        window.turnstile.remove(turnstileWidgetIdRef.current);
        turnstileWidgetIdRef.current = null;
      }
    };
  }, [captchaConfigured, turnstileSiteKey, isAuthenticated, userProfile]);

  const handleConnect = async () => {
    if (!captchaConfigured) return;
    if (!captchaToken) return;

    await connectWallet(captchaToken);
    if (turnstileWidgetIdRef.current && window.turnstile) {
      window.turnstile.reset(turnstileWidgetIdRef.current);
    }
    setCaptchaToken(null);
  };

  const isMetaMaskAvailable = typeof window !== "undefined" && typeof window.ethereum !== "undefined";

  const showVerifyingScreen =
    (isConnecting || (isAuthenticated && !userProfile)) &&
    isConnected &&
    Boolean(walletAddress) &&
    !walletRejected &&
    !error;

  return {
    turnstileContainerRef,
    captchaToken,
    captchaConfigured,
    walletAddress,
    isConnected,
    isConnecting,
    isAuthenticated,
    userProfile,
    error,
    walletRejected,
    isMetaMaskAvailable,
    showVerifyingScreen,
    handleConnect,
  };
}
