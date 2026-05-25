import { useState, useRef, useEffect } from "react";
import { Bell, Wallet, ExternalLink, Check, Trash2, Menu, X, Moon, Sun } from "lucide-react";
import { useWallet, shortenAddress, getNetworkName } from "@/context/WalletContext";
import { useNotifications, type UserRole } from "@/context/NotificationContext";
import { useDarkMode } from "@/shared/hooks";
import tapatChainLogo from "@/assets/images/tapatchain.png";

interface NavbarProps {
  currentPage: string;
  setCurrentPage: (page: string) => void;
  currentRole?: UserRole | null;
}

export function Navbar({ currentPage, setCurrentPage, currentRole }: NavbarProps) {
  const [showNotifications, setShowNotifications] = useState(false);
  const [showWalletInfo, setShowWalletInfo] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [isDarkMode, toggleDarkMode] = useDarkMode();
  
  const notifRef = useRef<HTMLDivElement>(null);
  const walletRef = useRef<HTMLDivElement>(null);
  
  const { walletAddress, isConnected, chainId, balance, disconnectWallet } = useWallet();
  const { markAsRead, markAllAsRead, clearNotification, getNotificationsByRole, getUnreadCountByRole } = useNotifications();

  // Check if current page is a restricted page (not public ledger)
  const basePage = currentPage.split(':')[0];
  const isRestrictedPage = ['contractor', 'inspector', 'auditor', 'overseer', 'admin', 'rdc', 'rd', 'professional-registry'].includes(basePage);
  const isHomePage = basePage === "home";
  const homeNavActiveClass = isDarkMode
    ? "text-white"
    : "text-foreground bg-foreground/10";
  const homeNavInactiveClass = isDarkMode
    ? "text-white/80 hover:text-white hover:bg-white/10"
    : "text-foreground/80 hover:text-foreground hover:bg-foreground/10";
  const navContainerClass = isHomePage
    ? isScrolled
      ? "fixed top-0 left-0 right-0 z-50 bg-white/10 dark:bg-black/10 backdrop-blur-xl border-b border-transparent shadow-[0_10px_30px_-20px_rgba(0,0,0,0.45)] transition-all duration-300"
      : "fixed top-0 left-0 right-0 z-50 bg-transparent border-b border-transparent backdrop-blur-0 shadow-none transition-all duration-300"
    : "fixed top-0 left-0 right-0 z-50 bg-background border-b border-border/60 shadow-sm";
  
  // Close mobile menu on page change
  useEffect(() => {
    setShowMobileMenu(false);
  }, [currentPage]);

  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    if (showMobileMenu) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = originalOverflow;
    }
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [showMobileMenu]);

  useEffect(() => {
    if (!isHomePage) {
      setIsScrolled(false);
      return;
    }

    const handleScroll = () => {
      setIsScrolled(window.scrollY > 8);
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [isHomePage]);

  // Get notifications for current role
  const roleNotifications = currentRole 
    ? getNotificationsByRole(currentRole).slice(0, 10) // Limit to 10 most recent
    : [];
  const roleUnreadCount = currentRole ? getUnreadCountByRole(currentRole) : 0;

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
      if (walletRef.current && !walletRef.current.contains(event.target as Node)) {
        setShowWalletInfo(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "success":
      case "approval":
        return "✓";
      case "warning":
        return "⚠";
      case "error":
      case "rejection":
        return "✕";
      case "milestone":
        return "📋";
      default:
        return "ℹ";
    }
  };

  const getNotificationColor = (type: string) => {
    switch (type) {
      case "success":
      case "approval":
        return "text-primary bg-primary/10";
      case "warning":
        return "text-primary bg-primary/10";
      case "error":
      case "rejection":
        return "text-primary bg-primary/10";
      case "milestone":
        return "text-primary bg-primary/10";
      default:
        return "text-primary bg-primary/10";
    }
  };

  const formatTimeAgo = (timestamp: string) => {
    const now = new Date();
    const date = new Date(timestamp);
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (seconds < 60) return "Just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <nav className={navContainerClass}>
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center h-14 sm:h-16 gap-2">
          {/* Left: Logo */}
          <div className={`flex items-center min-w-0 ${!isRestrictedPage ? 'md:flex-1' : 'shrink-0'}`}>
            <div className="flex items-center gap-2 sm:gap-3 cursor-pointer min-w-0" onClick={() => setCurrentPage('home')}>
              <img
                src={tapatChainLogo}
                alt="TapatChain Philippines"
                className="h-8 sm:h-10 w-auto object-contain"
              />
              <div className="min-w-0">
                <span className="font-bold text-base sm:text-lg text-foreground truncate block">TapatChain</span>
                <span className="text-[9px] text-primary block -mt-0.5 font-medium tracking-wider uppercase">Philippines</span>
              </div>
            </div>
          </div>

          {/* Center: Nav Links (public pages only) */}
          {!isRestrictedPage && (
            <div className="hidden md:flex flex-1 items-center justify-center min-w-0">
              <div className="hidden md:flex items-center gap-1">
                {[
                  { label: "Home", page: "home" },
                  { label: "About", page: "about" },
                  { label: "Contact", page: "contact" },
                  { label: "Public Ledger", page: "ledger" },
                ].map(({ label, page }) => (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap text-center ${
                      currentPage === page
                        ? isHomePage
                          ? homeNavActiveClass
                          : "text-foreground bg-muted"
                        : isHomePage
                          ? homeNavInactiveClass
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Spacer when restricted (keeps right controls aligned) */}
          {isRestrictedPage && <div className="flex-1" />}

          {/* Right: Controls */}
          <div className={`ml-auto flex items-center justify-end gap-1 sm:gap-2 ${!isRestrictedPage ? 'md:flex-1' : 'shrink-0'}`}>
            <button
              onClick={toggleDarkMode}
              className={`inline-flex items-center justify-center p-2 rounded-lg border transition-colors duration-200 ${
                isDarkMode
                  ? "bg-primary/15 border-primary/35 text-foreground"
                  : "bg-muted/70 border-border text-muted-foreground hover:text-foreground"
              }`}
              aria-label={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
              title={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
            >
              {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            {!isRestrictedPage && (
              <button
                onClick={() => setCurrentPage('auth')}
                className="hidden md:inline-flex md:ml-2 items-center px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
              >
                Portal
              </button>
            )}

            {/* Wallet Info (when connected and on restricted page) */}
            {isRestrictedPage && isConnected && walletAddress && (
              <div className="relative" ref={walletRef}>
                {/* Mobile: compact icon button */}
                <button
                  onClick={() => setShowWalletInfo(!showWalletInfo)}
                  className="md:hidden p-2 bg-primary/10 border border-primary/20 rounded-lg hover:bg-primary/20 transition-colors relative"
                >
                  <Wallet className="w-4 h-4 text-primary" />
                  <div className="absolute top-1 right-1 w-1.5 h-1.5 bg-primary rounded-full" />
                </button>
                {/* Desktop: full button */}
                <button
                  onClick={() => setShowWalletInfo(!showWalletInfo)}
                  className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-primary/10 border border-primary/20 rounded-lg hover:bg-primary/20 transition-colors"
                >
                  <Wallet className="w-3.5 h-3.5 text-primary" />
                  <span className="text-xs font-medium text-foreground">{shortenAddress(walletAddress)}</span>
                  <div className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
                </button>
                
                {/* Wallet Dropdown */}
                {showWalletInfo && (
                  <div className="absolute right-0 top-full mt-2 w-[calc(100vw-2rem)] sm:w-72 max-w-sm bg-card border border-border rounded-xl shadow-lg overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="p-4 border-b border-border bg-muted/50">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-muted-foreground">Connected Wallet</span>
                        <span className="text-[10px] px-1.5 py-0.5 bg-primary/10 text-primary rounded">Active</span>
                      </div>
                      <div className="font-mono text-sm text-foreground break-all">{walletAddress}</div>
                    </div>
                    <div className="p-4 space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-muted-foreground">Network</span>
                        <span className="text-xs font-medium text-foreground">{getNetworkName(chainId)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-muted-foreground">Balance</span>
                        <span className="text-xs font-medium text-foreground">{balance || "0"} ETH</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-muted-foreground">Role</span>
                        <span className="text-xs font-medium text-primary capitalize">{currentRole}</span>
                      </div>
                    </div>
                    <div className="p-3 border-t border-border bg-muted/30 flex gap-2">
                      <a
                        href={`https://sepolia.etherscan.io/address/${walletAddress}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                      >
                        <ExternalLink className="w-3 h-3" />
                        View on Explorer
                      </a>
                      <button
                        onClick={() => {
                          disconnectWallet();
                          setShowWalletInfo(false);
                          setCurrentPage('home');
                        }}
                        className="flex-1 px-3 py-2 text-xs font-medium text-primary hover:bg-primary/10 rounded-lg transition-colors"
                      >
                        Disconnect
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Connection Status (fallback when wallet not connected) */}
            {isRestrictedPage && !isConnected && (
              <div className="flex items-center gap-1.5 px-2 py-1 bg-primary/10 border border-primary/20 rounded">
                <div className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
                <span className="text-[10px] text-primary font-medium hidden sm:inline">Demo Mode</span>
              </div>
            )}

            {/* Notifications Bell */}
            {isRestrictedPage && currentRole && (
              <div className="relative" ref={notifRef}>
                <button
                  onClick={() => setShowNotifications(!showNotifications)}
                  className="relative p-2.5 rounded-xl hover:bg-muted transition-colors"
                >
                  <Bell className="w-5 h-5 text-foreground" />
                  {roleUnreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-primary text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                      {roleUnreadCount > 9 ? "9+" : roleUnreadCount}
                    </span>
                  )}
                </button>

                {/* Notifications Dropdown */}
                {showNotifications && (
                  <div className="absolute right-0 top-full mt-2 w-[calc(100vw-2rem)] max-w-sm sm:w-96 bg-card border border-border rounded-xl shadow-lg overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="p-4 border-b border-border flex items-center justify-between bg-muted/50">
                      <div>
                        <h3 className="text-sm font-semibold text-foreground">Notifications</h3>
                        <p className="text-[10px] text-muted-foreground">{roleUnreadCount} unread</p>
                      </div>
                      {roleUnreadCount > 0 && (
                        <button
                          onClick={markAllAsRead}
                          className="text-xs text-primary hover:text-primary/80 font-medium flex items-center gap-1"
                        >
                          <Check className="w-3 h-3" />
                          Mark all read
                        </button>
                      )}
                    </div>
                    
                    <div className="max-h-80 overflow-y-auto">
                      {roleNotifications.length === 0 ? (
                        <div className="p-8 text-center">
                          <Bell className="w-8 h-8 mx-auto mb-2 text-muted-foreground/30" />
                          <p className="text-sm text-muted-foreground">No notifications</p>
                        </div>
                      ) : (
                        roleNotifications.map((notif) => (
                          <div
                            key={notif.id}
                            className={`p-4 border-b border-border hover:bg-muted/50 transition-colors cursor-pointer ${
                              !notif.read ? "bg-primary/5" : ""
                            }`}
                            onClick={() => {
                              markAsRead(notif.id);
                              if (notif.actionUrl) {
                                // Support deep-link format like "/admin:proposals"
                                setCurrentPage(notif.actionUrl.replace(/^\//, ""));
                              }
                              setShowNotifications(false);
                            }}
                          >
                            <div className="flex items-start gap-3">
                              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs shrink-0 ${getNotificationColor(notif.type)}`}>
                                {getNotificationIcon(notif.type)}
                              </span>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2">
                                  <h4 className={`text-xs font-medium truncate ${!notif.read ? "text-foreground" : "text-muted-foreground"}`}>
                                    {notif.title}
                                  </h4>
                                  <span className="text-[10px] text-muted-foreground shrink-0">
                                    {formatTimeAgo(notif.timestamp)}
                                  </span>
                                </div>
                                <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                                  {notif.message}
                                </p>
                                {notif.sourceRole && (
                                  <span className="text-[10px] text-primary/70 mt-1 inline-block capitalize">
                                    From: {notif.sourceRole}
                                  </span>
                                )}
                              </div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  clearNotification(notif.id);
                                }}
                                className="p-1 hover:bg-muted rounded opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <Trash2 className="w-3 h-3 text-muted-foreground" />
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Hamburger button (mobile only, public pages) */}
            {!isRestrictedPage && (
              <button
                className="md:hidden p-2 rounded-lg hover:bg-muted transition-colors shrink-0"
                onClick={() => setShowMobileMenu((v) => !v)}
                aria-label="Toggle menu"
              >
                {showMobileMenu
                  ? <X className="w-5 h-5 text-foreground" />
                  : <Menu className="w-5 h-5 text-foreground" />}
              </button>
            )}

          </div>
        </div>
      </div>

      {/* Mobile Menu Sidebar */}
      {!isRestrictedPage && showMobileMenu && (
        <div className="md:hidden fixed inset-0 z-60">
          <button
            className="absolute inset-0 bg-foreground/20 backdrop-blur-sm"
            aria-label="Close menu"
            onClick={() => setShowMobileMenu(false)}
          />
          <div
            className="absolute right-0 top-0 h-full w-[78%] max-w-xs bg-background border-l border-border shadow-xl p-4 flex flex-col gap-2 animate-in slide-in-from-right-6 duration-200"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-foreground">Menu</span>
              <button
                className="p-2 rounded-lg hover:bg-muted transition-colors"
                onClick={() => setShowMobileMenu(false)}
                aria-label="Close menu"
              >
                <X className="w-4 h-4 text-foreground" />
              </button>
            </div>

            <div className="mt-1 flex flex-col gap-1">
              {[
                { label: "Home", page: "home" },
                { label: "About", page: "about" },
                { label: "Contact", page: "contact" },
                { label: "Public Ledger", page: "ledger" },
              ].map(({ label, page }) => (
                <button
                  key={page}
                  onClick={() => { setCurrentPage(page); setShowMobileMenu(false); }}
                  className={`w-full text-left px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                    currentPage === page
                      ? "text-foreground bg-muted"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <button
              onClick={() => { setCurrentPage('auth'); setShowMobileMenu(false); }}
              className="mt-2 w-full px-4 py-3 rounded-lg text-sm font-semibold bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
            >
              Portal
            </button>
          </div>
        </div>
      )}
    </nav>
  );
}
