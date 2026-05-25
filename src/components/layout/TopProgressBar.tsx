import { useEffect, useState } from "react";

interface TopProgressBarProps {
  loading: boolean;
}

export function TopProgressBar({ loading }: TopProgressBarProps) {
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let trickleTimer: number | null = null;
    let hideTimer: number | null = null;
    let resetTimer: number | null = null;

    if (loading) {
      setVisible(true);
      setProgress((prev) => (prev > 10 ? prev : 10));

      trickleTimer = window.setInterval(() => {
        setProgress((prev) => {
          if (prev >= 90) return prev;
          const delta = Math.max(1, (92 - prev) * 0.05);
          return Math.min(90, prev + delta);
        });
      }, 160);
    } else if (visible) {
      setProgress(100);
      hideTimer = window.setTimeout(() => {
        setVisible(false);
        resetTimer = window.setTimeout(() => setProgress(0), 180);
      }, 300);
    }

    return () => {
      if (trickleTimer) window.clearInterval(trickleTimer);
      if (hideTimer) window.clearTimeout(hideTimer);
      if (resetTimer) window.clearTimeout(resetTimer);
    };
  }, [loading, visible]);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-80 h-1" aria-hidden>
      <div
        className="h-full bg-primary transition-[width,opacity] duration-260 ease-out"
        style={{
          width: `${progress}%`,
          opacity: visible ? 1 : 0,
          boxShadow: visible ? "0 0 10px rgba(13,221,176,0.5)" : "none",
        }}
      />
    </div>
  );
}
