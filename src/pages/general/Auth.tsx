import { useEffect, useRef } from "react";
import { ArrowLeft, Wallet, AlertCircle, ExternalLink } from "lucide-react";
import { useMetaMaskAuth } from "@/hooks/general/useMetaMaskAuth";
import MetaMaskLogo from "@metamask/logo";

interface MetaMaskAuthPageProps {
  setCurrentPage: (page: string) => void;
}

const MM_ORANGE = "#E8821C";

// Official MetaMask 3D fox — moves on its own via slowDrift
function MetaMaskFox3D({ size = 96 }: { size?: number }) {
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

  return <div ref={containerRef} style={{ width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center" }} />;
}


export function MetaMaskAuthPage({ setCurrentPage }: MetaMaskAuthPageProps) {
  const {
    turnstileContainerRef,
    captchaToken,
    captchaConfigured,
    walletAddress,
    isConnecting,
    isAuthenticated,
    userProfile,
    error,
    walletRejected,
    isMetaMaskAvailable,
    showVerifyingScreen,
    handleConnect,
  } = useMetaMaskAuth({ setCurrentPage });

  const isAuthenticating = isConnecting || showVerifyingScreen || (isAuthenticated && !userProfile);

  return (
    <div className="relative min-h-screen flex items-center justify-center px-4 pt-16 sm:pt-20 pb-10 sm:pb-12 bg-background overflow-hidden">
      <div className="w-full max-w-95 sm:max-w-105 relative z-10" style={{ transform: "scale(0.9)", transformOrigin: "center center" }}>
    
        {/* Top eyebrow removed */}

        {/* Fox icon — floating above card */}
        <div className="flex justify-center -mb-7 relative z-10">
          <MetaMaskFox3D size={113} />
        </div>

        {/* Card */}
        <div className="rounded-2xl overflow-hidden pt-10 pb-6 px-6 sm:px-8">

          {/* Titles */}
          <div className="text-center mb-6">
            <p className="text-[11px] font-semibold tracking-[0.15em] uppercase text-muted-foreground mb-1">
              via MetaMask
            </p>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground dark:text-zinc-200 tracking-tight">
              Wallet Authentication
            </h1>
            <p className="text-[13px] text-muted-foreground mt-2 leading-relaxed">
              Connect your MetaMask wallet to sign in.
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mx-auto mb-5 w-full max-w-76">
              <div className="p-3 rounded-lg bg-primary/5 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <p className="text-xs text-primary">{error}</p>
              </div>
            </div>
          )}

          {!captchaConfigured && (
            <div className="mb-5 p-3 rounded-lg bg-primary/5 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <p className="text-xs text-primary">
                Security challenge is not configured. Set VITE_TURNSTILE_SITE_KEY in frontend env before allowing wallet logins.
              </p>
            </div>
          )}

          {captchaConfigured && (
            <div className="mx-auto mb-5 flex w-full max-w-76 justify-center">
              <div ref={turnstileContainerRef} />
            </div>
          )}

          <div className="mx-auto w-full max-w-76">
            {isMetaMaskAvailable ? (
              <button
                onClick={handleConnect}
                disabled={isAuthenticating || !captchaConfigured || !captchaToken}
                className="w-full py-3 rounded-xl text-[13px] font-semibold text-white flex items-center justify-center gap-2.5 transition-all hover:opacity-90 hover:scale-[1.01] active:scale-[.99] disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
                style={{ background: MM_ORANGE }}
              >
                {isAuthenticating ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Authenticating...
                  </>
                ) : (
                  <>
                    <Wallet className="w-4 h-4" />
                    Connect with MetaMask
                  </>
                )}
              </button>
            ) : (
              <a
                href="https://metamask.io/download/"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-3 rounded-xl text-[13px] font-semibold text-white flex items-center justify-center gap-2.5 hover:opacity-90 shadow-md"
                style={{ background: MM_ORANGE }}
              >
                <ExternalLink className="w-4 h-4" />
                Install MetaMask
              </a>
            )}
          </div>

          <p className="text-[10px] text-muted-foreground/50 text-center mt-4 tracking-wide">
            Secured by Ethereum blockchain
          </p>
        </div>

        {/* Wordmark */}
        <p className="text-center text-[10px] text-muted-foreground/30 tracking-widest uppercase mt-5">
          TapatChain Network
        </p>
      </div>
    </div>
  );
}
