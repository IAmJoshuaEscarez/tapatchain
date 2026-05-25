import { useEffect, useRef } from "react";
import MetaMaskLogo from "@metamask/logo";
import { clearStoredAccessToken } from "@/shared/auth/tokenStorage";


const MM_ORANGE = "#E8821C";
const MM_DARK   = "#763E1A";

function MetaMaskFox3D({ size = 100 }: { size?: number }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const viewer = MetaMaskLogo({
      pxNotRatio: true,
      width: size,
      height: size,
      followMouse: true,
      slowDrift: true,
    });

    const canvas = viewer.container.querySelector("canvas");
    if (canvas) {
      canvas.style.width = `${size}px`;
      canvas.style.height = `${size}px`;
    }

    el.appendChild(viewer.container);

    return () => {
      viewer.stopAnimation();
      if (el.contains(viewer.container)) el.removeChild(viewer.container);
    };
  }, [size]);

  return (
    <div
      ref={containerRef}
      style={{ width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center" }}
    />
  );
}

interface UnauthorizedPageProps {
  setCurrentPage: (page: string) => void;
}

export function UnauthorizedPage({ setCurrentPage }: UnauthorizedPageProps) {

  return (
    <div className="unauth-page min-h-screen flex items-center justify-center px-4 py-12 relative overflow-hidden select-none">
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="unauth-orb-1 absolute w-[600px] h-[600px] rounded-full top-[-15%] left-[-10%]" />
        <div className="unauth-orb-2 absolute w-[500px] h-[500px] rounded-full bottom-[-10%] right-[-8%]" />
        <div className="unauth-orb-3 absolute w-[300px] h-[300px] rounded-full top-[40%] left-[60%]" />
      </div>

      <div className="absolute inset-0 pointer-events-none unauth-grid" />

      <div className="relative z-10 flex flex-col items-center w-full max-w-sm">
        <div className="mb-3 unauth-float">
          <MetaMaskFox3D size={100} />
        </div>

        <h1
          className="text-[6rem] sm:text-[7rem] leading-none font-extrabold tracking-tighter mb-1"
          style={{
            background: `linear-gradient(180deg, ${MM_ORANGE} 0%, ${MM_DARK} 100%)`,
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
            userSelect: "none",
          }}
        >
          401
        </h1>

        <p className="text-base font-semibold text-foreground tracking-wide uppercase mb-1.5">
          Unauthorized Access
        </p>

        <p className="text-xs text-muted-foreground text-center max-w-xs leading-relaxed mb-6">
          This wallet is not registered in the{" "}
          <span className="font-semibold text-foreground">TapatChain</span>{" "}
          network. Only whitelisted government officials can access dashboards.
        </p>

        <button
          onClick={() => {
            clearStoredAccessToken();
            localStorage.removeItem("walletConnected");
            localStorage.removeItem("walletAddress");
            setCurrentPage("home");
          }}
          className="px-6 py-2.5 text-sm font-medium rounded-xl border border-border bg-card text-foreground hover:bg-muted transition-all hover:shadow-md"
        >
          Back to Home
        </button>

        <p className="mt-8 text-[10px] font-mono text-muted-foreground/40 tracking-widest uppercase">
          HTTP 401 &middot; Wallet not whitelisted &middot; TapatChain Gateway
        </p>
      </div>
    </div>
  );
}
