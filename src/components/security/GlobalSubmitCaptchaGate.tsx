import { useEffect, useMemo, useState } from "react";
import {
  ensureTurnstileScriptLoaded,
  getTurnstileApi,
  queueManualTurnstileToken,
  resolveTurnstileSiteKey,
  shouldEnforceTurnstileForMutations,
} from "@/shared/security/turnstile";

const SUBMIT_SELECTOR = 'button[type="submit"], input[type="submit"]';
const LOCK_CLASS = "captcha-submit-locked";
const LOCK_MARKER_ATTR = "data-captcha-form-lock";
const MIN_CAPTCHA_WIDTH = 300;

interface FormBinding {
  form: HTMLFormElement;
  row: HTMLDivElement;
  wrapper: HTMLDivElement;
  widgetId: string;
  token: string | null;
  resizeObserver: ResizeObserver | null;
  onSubmitCapture: (event: Event) => void;
}

interface GlobalSubmitCaptchaGateProps {
  scopeKey: string;
}

function setFormSubmitControlsLocked(form: HTMLFormElement, locked: boolean): void {
  const controls = Array.from(form.querySelectorAll<HTMLElement>(SUBMIT_SELECTOR));
  controls.forEach((control) => {
    if (locked) {
      control.classList.add(LOCK_CLASS);
      control.setAttribute("aria-disabled", "true");
      control.setAttribute(LOCK_MARKER_ATTR, "1");
    } else if (control.getAttribute(LOCK_MARKER_ATTR) === "1") {
      control.classList.remove(LOCK_CLASS);
      control.removeAttribute("aria-disabled");
      control.removeAttribute(LOCK_MARKER_ATTR);
    }
  });
}

export function GlobalSubmitCaptchaGate({ scopeKey }: GlobalSubmitCaptchaGateProps) {
  const [siteKey, setSiteKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const shouldGate = useMemo(() => shouldEnforceTurnstileForMutations(), []);

  useEffect(() => {
    let canceled = false;

    const loadCaptcha = async () => {
      if (!shouldGate) {
        setIsLoading(false);
        return;
      }

      const resolvedSiteKey = await resolveTurnstileSiteKey();
      if (canceled) return;

      if (!resolvedSiteKey) {
        setSiteKey(null);
        setIsLoading(false);
        return;
      }

      try {
        await ensureTurnstileScriptLoaded();
      } catch {
        if (!canceled) {
          setSiteKey(null);
          setIsLoading(false);
        }
        return;
      }

      if (!canceled) {
        setSiteKey(resolvedSiteKey);
        setIsLoading(false);
      }
    };

    void loadCaptcha();

    return () => {
      canceled = true;
    };
  }, [shouldGate]);

  useEffect(() => {
    if (!shouldGate || !siteKey || isLoading) return;

    const turnstile = getTurnstileApi();
    if (!turnstile) return;

    const bindings = new Map<HTMLFormElement, FormBinding>();

    const lockForm = (binding: FormBinding, locked: boolean) => {
      setFormSubmitControlsLocked(binding.form, locked);
    };

    const attachForm = (form: HTMLFormElement) => {
      if (bindings.has(form)) return;

      const submitControls = Array.from(form.querySelectorAll<HTMLElement>(SUBMIT_SELECTOR));
      if (submitControls.length === 0) return;

      const firstSubmitControl = submitControls[0];
      const insertionParent = form;

      const row = document.createElement("div");
      row.className = "captcha-form-row";

      const wrapper = document.createElement("div");
      wrapper.className = "captcha-form-shell";

      const widgetHost = document.createElement("div");
      widgetHost.className = "captcha-form-host";

      wrapper.appendChild(widgetHost);
      row.appendChild(wrapper);
      insertionParent.appendChild(row);

      const syncShellLayout = () => {
        const buttonRect = firstSubmitControl.getBoundingClientRect();
        const parentRect = insertionParent.getBoundingClientRect();
        const availableWidth = Math.max(0, Math.floor(parentRect.width));
        row.style.justifyContent = "center";

        if (availableWidth <= 0) {
          wrapper.style.removeProperty("width");
          wrapper.style.removeProperty("max-width");
          return;
        }

        const preferredWidth = Math.max(Math.ceil(buttonRect.width), MIN_CAPTCHA_WIDTH);
        const targetWidth = Math.min(preferredWidth, availableWidth);

        if (targetWidth >= availableWidth - 2) {
          wrapper.style.width = `${availableWidth}px`;
          wrapper.style.maxWidth = `${availableWidth}px`;
          return;
        }

        wrapper.style.width = `${targetWidth}px`;
        wrapper.style.maxWidth = `${targetWidth}px`;
      };

      syncShellLayout();

      const resizeObserver =
        typeof ResizeObserver !== "undefined"
          ? new ResizeObserver(() => {
              syncShellLayout();
            })
          : null;

      if (resizeObserver) {
        resizeObserver.observe(firstSubmitControl);
        resizeObserver.observe(insertionParent);
      }

      let token: string | null = null;
      const widgetId = turnstile.render(widgetHost, {
        sitekey: siteKey,
        callback: (receivedToken: string) => {
          token = receivedToken;
          const binding = bindings.get(form);
          if (!binding) return;
          binding.token = receivedToken;
          lockForm(binding, false);
        },
        "expired-callback": () => {
          token = null;
          const binding = bindings.get(form);
          if (!binding) return;
          binding.token = null;
          lockForm(binding, true);
        },
        "error-callback": () => {
          token = null;
          const binding = bindings.get(form);
          if (!binding) return;
          binding.token = null;
          lockForm(binding, true);
        },
        theme: document.documentElement.classList.contains("dark") ? "dark" : "light",
        action: "api_submit",
        size: "flexible",
      });

      const onSubmitCapture = (event: Event) => {
        const binding = bindings.get(form);
        if (!binding) return;

        if (!binding.token) {
          event.preventDefault();
          event.stopPropagation();
          wrapper.scrollIntoView({ behavior: "smooth", block: "center" });
          return;
        }

        queueManualTurnstileToken(binding.token);
        binding.token = null;
        lockForm(binding, true);
        if (turnstile.reset) {
          turnstile.reset(binding.widgetId);
        }
      };

      const binding: FormBinding = {
        form,
        row,
        wrapper,
        widgetId,
        token,
        resizeObserver,
        onSubmitCapture,
      };

      form.addEventListener("submit", onSubmitCapture, true);
      bindings.set(form, binding);
      lockForm(binding, true);
    };

    const detachForm = (form: HTMLFormElement) => {
      const binding = bindings.get(form);
      if (!binding) return;

      binding.form.removeEventListener("submit", binding.onSubmitCapture, true);
      setFormSubmitControlsLocked(binding.form, false);
      binding.resizeObserver?.disconnect();

      try {
        turnstile.remove(binding.widgetId);
      } catch {
        // Ignore widget cleanup errors during route changes.
      }

      if (binding.row.parentElement) {
        binding.row.parentElement.removeChild(binding.row);
      }

      bindings.delete(form);
    };

    const syncForms = () => {
      const forms = Array.from(document.querySelectorAll<HTMLFormElement>("form"));
      forms.forEach((form) => attachForm(form));

      Array.from(bindings.keys()).forEach((form) => {
        if (!document.body.contains(form)) {
          detachForm(form);
        }
      });
    };

    syncForms();

    const observer = new MutationObserver(() => {
      syncForms();
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => {
      observer.disconnect();
      Array.from(bindings.keys()).forEach((form) => detachForm(form));
    };
  }, [scopeKey, shouldGate, siteKey, isLoading]);

  return null;
}
