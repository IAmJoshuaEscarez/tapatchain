import { useCallback, useEffect, useState } from "react";

const THEME_STORAGE_KEY = "tapatchain-theme";

function readInitialDarkMode(): boolean {
  if (typeof window === "undefined") return false;

  const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (storedTheme === "dark") return true;
  if (storedTheme === "light") return false;

  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

export function useDarkMode(): readonly [boolean, () => void] {
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => readInitialDarkMode());

  useEffect(() => {
    if (typeof document === "undefined") return;

    const root = document.documentElement;
    root.classList.toggle("dark", isDarkMode);
    root.style.colorScheme = isDarkMode ? "dark" : "light";
    window.localStorage.setItem(THEME_STORAGE_KEY, isDarkMode ? "dark" : "light");
  }, [isDarkMode]);

  const toggleDarkMode = useCallback(() => {
    setIsDarkMode((prev) => !prev);
  }, []);

  return [isDarkMode, toggleDarkMode] as const;
}
