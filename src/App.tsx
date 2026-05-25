import { useState, useEffect, useCallback } from "react";
import { Navbar, Footer, TopProgressBar } from "@/components/layout";
import {
  HomePage,
  MetaMaskAuthPage,
  ContractorDashboard,
  DPWHProjectEngineerDashboard,
  COARegionalAuditorDashboard,
  COANationalOversightDashboard,
  DPWHNationalAdminPortal,
  PublicLedgerPage,
  CommunityHubPage,
  CommunityFeedbackFormPage,
  PublicReportFormPage,
  UnauthorizedPage,
  DPWHRegionalDirectorDashboard,
  ProfessionalRegistryPage,
  RDCDashboard,
  AboutPage,
  ContactPage,
  DevelopersPage,
  PrivacyPolicyPage,
  TermsOfUsePage,
} from "@/pages";
import { ProjectProvider } from "@/context/ProjectContext";
import { MilestoneProvider } from "@/context/MilestoneContext";
import { WalletProvider, useWallet } from "@/context/WalletContext";
import { NotificationProvider } from "@/context/NotificationContext";
import { AuditTrailProvider } from "@/context/AuditTrailContext";
import { getStoredAccessToken } from "@/shared/auth/tokenStorage";
import type { UserRole } from "@/context/NotificationContext";

// Pages that require auth — on refresh without valid session, redirect to home
const PROTECTED_PAGES = new Set([
  "contractor", "inspector", "auditor", "overseer",
  "admin", "rdc", "rd",
]);

// Map a backend role to the frontend page name it should render
const ROLE_TO_PAGE: Record<string, string> = {
  contractor: "contractor",
  inspector: "inspector",
  auditor: "auditor",
  overseer: "overseer",
  coa_admin: "overseer",
  admin: "admin",
  rdc: "rdc",
  rd: "rd",
};

const DARK_BORDERLESS_SURFACE_PAGES = new Set([
  "home",
  "about",
  "contact",
  "developers",
  "privacy",
  "terms",
  "contractor",
  "auditor",
  "overseer",
  "rdc",
  "rd",
  "admin",
]);

const DEFAULT_SEO_KEYWORDS =
  "TapatChain, public infrastructure monitoring Philippines, DPWH transparency, COA oversight, blockchain audit trail";

function resolveSeoSiteUrl(): string {
  const configured = String(import.meta.env.VITE_SITE_URL ?? "").trim();
  if (configured) {
    return configured.replace(/\/+$/, "");
  }

  if (typeof window !== "undefined" && window.location.origin) {
    return window.location.origin.replace(/\/+$/, "");
  }

  return "https://tapatchain.vercel.app";
}

const INDEXABLE_PAGE_TO_PATH: Record<string, string> = {
  home: "/",
  about: "/about",
  contact: "/contact",
  developers: "/developers",
  privacy: "/privacy",
  terms: "/terms",
  ledger: "/public-ledger",
  "community-feedback": "/community",
  "community-feedback-form": "/community/feedback-form",
  "community-report-form": "/community/report-form",
};

const PAGE_SEO_CONFIG: Record<
  string,
  {
    title: string;
    description: string;
    keywords: string;
  }
> = {
  home: {
    title: "TapatChain | Transparent Public Infrastructure Monitoring",
    description:
      "Monitor public infrastructure projects with transparent funding trails, milestone tracking, and immutable audit logs.",
    keywords:
      "TapatChain, public infrastructure, transparency platform Philippines, blockchain government monitoring",
  },
  about: {
    title: "About TapatChain | Public Infrastructure Transparency",
    description:
      "Learn how TapatChain improves accountability in public works through blockchain-backed project transparency.",
    keywords:
      "about TapatChain, project transparency, public accountability, blockchain governance Philippines",
  },
  contact: {
    title: "Contact TapatChain",
    description: "Reach the TapatChain team for support, collaboration, or implementation inquiries.",
    keywords: "contact TapatChain, support, public infrastructure transparency platform",
  },
  developers: {
    title: "Developers | TapatChain",
    description:
      "Explore TapatChain technical architecture, blockchain-integrated workflows, and system development information.",
    keywords:
      "TapatChain developers, blockchain integration, govtech architecture, web3 transparency stack",
  },
  privacy: {
    title: "Privacy Policy | TapatChain",
    description: "Review the TapatChain privacy policy and how citizen and project data is handled.",
    keywords: "TapatChain privacy policy, data privacy, platform data handling",
  },
  terms: {
    title: "Terms of Use | TapatChain",
    description: "Read TapatChain platform terms for public monitoring, project participation, and acceptable use.",
    keywords: "TapatChain terms of use, platform terms, acceptable use",
  },
  ledger: {
    title: "Public Ledger | TapatChain",
    description:
      "View public project timelines, funding movements, integrity checks, and milestone progress on TapatChain.",
    keywords:
      "public ledger Philippines, project funding tracker, milestone transparency, blockchain audit trail",
  },
  "community-feedback": {
    title: "Community Hub | TapatChain",
    description:
      "Share and review community feedback on infrastructure projects with traceable, transparent project context.",
    keywords:
      "community feedback infrastructure, citizen monitoring, public project reporting Philippines",
  },
  "community-feedback-form": {
    title: "Submit Community Feedback | TapatChain",
    description:
      "Submit community observations and on-site feedback for infrastructure projects on the TapatChain platform.",
    keywords:
      "submit community feedback, citizen participation, project observation form",
  },
  "community-report-form": {
    title: "Submit Public Report | TapatChain",
    description:
      "File a public report with optional photo evidence for monitored infrastructure projects.",
    keywords:
      "public report form, infrastructure incident report, citizen evidence submission",
  },
};

function normalizePathname(pathname: string): string {
  if (!pathname) return "/";
  if (pathname === "/") return "/";
  return pathname.replace(/\/+$/, "") || "/";
}

function resolvePageFromPath(pathname: string): string | undefined {
  const normalized = normalizePathname(pathname);

  if (normalized.startsWith("/monitor/")) {
    const encodedSlug = normalized.slice("/monitor/".length).trim();
    if (!encodedSlug) return "ledger";

    try {
      return `ledger:monitor:${decodeURIComponent(encodedSlug)}`;
    } catch {
      return `ledger:monitor:${encodedSlug}`;
    }
  }

  const matchedEntry = Object.entries(INDEXABLE_PAGE_TO_PATH).find(([, path]) => path === normalized);
  if (matchedEntry) return matchedEntry[0];

  return undefined;
}

function resolvePathFromPage(page: string): string {
  const pageParts = page.split(":");
  const basePage = pageParts[0];

  if (basePage === "ledger" && pageParts[1] === "monitor") {
    const monitorSlug = pageParts.slice(2).join(":").trim();
    if (!monitorSlug) return INDEXABLE_PAGE_TO_PATH.ledger;
    return `/monitor/${encodeURIComponent(monitorSlug)}`;
  }

  if (basePage === "public") {
    return INDEXABLE_PAGE_TO_PATH.ledger;
  }

  return INDEXABLE_PAGE_TO_PATH[basePage] ?? "/";
}

function upsertMetaByName(name: string, content: string): void {
  if (typeof document === "undefined") return;

  let element = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute("name", name);
    document.head.appendChild(element);
  }

  element.setAttribute("content", content);
}

function upsertMetaByProperty(property: string, content: string): void {
  if (typeof document === "undefined") return;

  let element = document.querySelector<HTMLMetaElement>(`meta[property="${property}"]`);
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute("property", property);
    document.head.appendChild(element);
  }

  element.setAttribute("content", content);
}

function upsertCanonicalLink(href: string): void {
  if (typeof document === "undefined") return;

  let link = document.querySelector<HTMLLinkElement>('link[rel="canonical"]#canonical-link');
  if (!link) {
    link = document.createElement("link");
    link.id = "canonical-link";
    link.rel = "canonical";
    document.head.appendChild(link);
  }

  link.href = href;
}

function upsertStructuredData(data: unknown): void {
  if (typeof document === "undefined") return;

  let script = document.querySelector<HTMLScriptElement>('script[type="application/ld+json"]#seo-structured-data');
  if (!script) {
    script = document.createElement("script");
    script.id = "seo-structured-data";
    script.type = "application/ld+json";
    document.head.appendChild(script);
  }

  script.textContent = JSON.stringify(data);
}

function AppContent() {
  const hasToken = !!getStoredAccessToken();
  const savedPage = sessionStorage.getItem("currentPage");

  const pageFromPath = (() => {
    if (typeof window === "undefined") return "";
    const resolved = resolvePageFromPath(window.location.pathname);
    return resolved ?? "";
  })();

  const initialPage = (() => {
    if (pageFromPath) {
      return pageFromPath;
    }

    if (!hasToken || !savedPage) return "home";

    const basePage = savedPage.split(":")[0];
    const supportedPages = new Set([
      "home",
      "auth",
      "contractor",
      "inspector",
      "auditor",
      "overseer",
      "admin",
      "rdc",
      "rd",
      "professional-registry",
      "public",
      "ledger",
      "community-feedback",
      "community-feedback-form",
      "community-report-form",
      "unauthorized",
      "about",
      "contact",
      "developers",
      "privacy",
      "terms",
    ]);

    return supportedPages.has(basePage) ? savedPage : "home";
  })();

  const [currentPage, setCurrentPage] = useState(initialPage);
  const [isPageNavigating, setIsPageNavigating] = useState(false);
  const { userProfile, isInitializing, walletRejected } = useWallet();

  const navigateWithProgress = useCallback((page: string) => {
    if (page === currentPage) return;
    setIsPageNavigating(true);
    setCurrentPage(page);
  }, [currentPage]);

  useEffect(() => {
    if (!isPageNavigating) return;
    const timer = window.setTimeout(() => {
      setIsPageNavigating(false);
    }, 460);

    return () => window.clearTimeout(timer);
  }, [currentPage, isPageNavigating]);

  // Global walletRejected handler — catches account-switch rejections too,
  // not just rejections from MetaMaskAuthPage
  useEffect(() => {
    if (walletRejected) {
      setCurrentPage("unauthorized");
    }
  }, [walletRejected]);

  // Persist page to sessionStorage on every change
  useEffect(() => {
    sessionStorage.setItem("currentPage", currentPage);
  }, [currentPage]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const targetPath = normalizePathname(resolvePathFromPage(currentPage));
    const activePath = normalizePathname(window.location.pathname);
    if (targetPath !== activePath) {
      window.history.replaceState(null, "", targetPath);
    }
  }, [currentPage]);

  // After auth check completes, redirect to home if on protected page without auth
  useEffect(() => {
    const basePage = currentPage.split(':')[0]; // handle "admin:proposals" → "admin"
    if (!isInitializing && !userProfile && PROTECTED_PAGES.has(basePage)) {
      setCurrentPage("home");
    }
  }, [isInitializing, userProfile, currentPage]);

  // Once profile loads, redirect to the correct dashboard if user is on the
  // wrong page (e.g., stuck on "public" but their role is "contractor")
  useEffect(() => {
    if (isInitializing || !userProfile) return;

    const basePage = currentPage.split(':')[0];

    // Only auto-correct when user is on a generic / wrong landing page
    // Don't redirect if user is explicitly on their correct dashboard.
    const neutralPages = new Set(["public", "home", "auth", "unauthorized"]);
    if (!neutralPages.has(basePage)) return;

    // Resolve effective role (same logic as MetaMaskAuthPage)
    const specificRoles = ["contractor", "inspector", "auditor", "overseer", "admin", "rd", "rdc", "coa_admin"];
    let role = userProfile.assignedRole ?? "public";
    if (role === "public" && userProfile.roles?.length) {
      const promoted = userProfile.roles.find((r: string) => specificRoles.includes(r));
      if (promoted) role = promoted;
    }

    // If role maps to a dashboard page, redirect there
    const targetPage = ROLE_TO_PAGE[role];
    if (targetPage && targetPage !== basePage) {
      // Whitelist gate — don't redirect unwhitelisted users to a dashboard
      const whitelistExempt = ["admin", "coa_admin"];
      if (!whitelistExempt.includes(role) && !userProfile.isWhitelisted) {
        if (basePage !== "unauthorized") setCurrentPage("unauthorized");
        return;
      }
      setCurrentPage(targetPage);
    }

    // Unregistered / public wallet gate — no role assigned yet → unauthorized
    if (!targetPage && role === "public" && !userProfile.isWhitelisted) {
      if (basePage !== "unauthorized" && basePage !== "home" && basePage !== "auth") {
        setCurrentPage("unauthorized");
      }
    }
  }, [isInitializing, userProfile, currentPage]);

  // Get current role from wallet profile or from the current dashboard page
  const getCurrentRole = (): UserRole | null => {
    // If on a dashboard page, infer from page
    const dashboardRoles: Record<string, UserRole> = {
      contractor: 'contractor',
      inspector: 'inspector',
      auditor: 'auditor',
      overseer: 'overseer',
      admin: 'admin',
      rd: 'rd' as UserRole,
      rdc: 'rdc',
      coa_admin: 'coa_admin' as UserRole,
    };
    const basePage = currentPage.split(':')[0];
    if (dashboardRoles[basePage]) return dashboardRoles[basePage];
    // Fallback to profile
    if (userProfile?.assignedRole) return userProfile.assignedRole as UserRole;
    return null;
  };

  const currentPageParts = currentPage.split(":");
  const currentBasePage = currentPageParts[0];
  const isOverseerPage = currentPageParts[0] === "overseer";
  const isMonitorPage = currentPageParts[0] === "ledger" && currentPageParts[1] === "monitor";
  const isDarkBorderlessSurfacePage = DARK_BORDERLESS_SURFACE_PAGES.has(currentBasePage);
  const currentMonitorSlug = (() => {
    if (!isMonitorPage) return "";
    const encodedSlug = currentPageParts.slice(2).join(":");
    if (!encodedSlug) return "";

    try {
      return decodeURIComponent(encodedSlug);
    } catch {
      return encodedSlug;
    }
  })();
  const overseerInitialTab =
    currentPageParts[1] === "final-audit-seal" ? "final-audit-seal" : undefined;
  const overseerInitialProjectId = (() => {
    if (overseerInitialTab !== "final-audit-seal") return null;
    const encodedProjectId = currentPageParts.slice(2).join(":");
    if (!encodedProjectId) return null;

    try {
      return decodeURIComponent(encodedProjectId);
    } catch {
      return encodedProjectId;
    }
  })();

  useEffect(() => {
    if (typeof document === "undefined") return;

    const seoSiteUrl = resolveSeoSiteUrl();
    const pageKey = currentBasePage === "public" ? "ledger" : currentBasePage;
    const pageSeo = PAGE_SEO_CONFIG[pageKey] ?? PAGE_SEO_CONFIG.home;
    const isMonitorSeoPage = isMonitorPage && currentMonitorSlug.length > 0;
    const pagePath = resolvePathFromPage(currentPage);
    const canonicalUrl = `${seoSiteUrl}${pagePath}`;

    const title = isMonitorSeoPage
      ? `Project Monitor ${currentMonitorSlug} | TapatChain`
      : pageSeo.title;

    const description = isMonitorSeoPage
      ? `Live public monitor for project ${currentMonitorSlug} including funding updates, milestone status, and integrity checks on TapatChain.`
      : pageSeo.description;

    const keywords = isMonitorSeoPage
      ? `${DEFAULT_SEO_KEYWORDS}, project monitor, infrastructure tracking`
      : pageSeo.keywords || DEFAULT_SEO_KEYWORDS;

    const isIndexablePage =
      isMonitorSeoPage ||
      Object.prototype.hasOwnProperty.call(INDEXABLE_PAGE_TO_PATH, pageKey);

    const robots = isIndexablePage
      ? "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1"
      : "noindex,nofollow,noarchive";

    document.title = title;

    upsertMetaByName("description", description);
    upsertMetaByName("keywords", keywords);
    upsertMetaByName("robots", robots);
    upsertMetaByName("author", "TapatChain");
    upsertMetaByName("application-name", "TapatChain");
    upsertMetaByName("theme-color", "#071817");

    upsertMetaByProperty("og:type", isMonitorSeoPage ? "article" : "website");
    upsertMetaByProperty("og:site_name", "TapatChain");
    upsertMetaByProperty("og:title", title);
    upsertMetaByProperty("og:description", description);
    upsertMetaByProperty("og:url", canonicalUrl);
    upsertMetaByProperty("og:image", `${seoSiteUrl}/tapatchain.png`);
    upsertMetaByProperty(
      "og:image:alt",
      "TapatChain public infrastructure monitoring platform"
    );

    upsertMetaByName("twitter:card", "summary_large_image");
    upsertMetaByName("twitter:title", title);
    upsertMetaByName("twitter:description", description);
    upsertMetaByName("twitter:image", `${seoSiteUrl}/tapatchain.png`);

    upsertCanonicalLink(canonicalUrl);

    if (isMonitorSeoPage) {
      upsertStructuredData({
        "@context": "https://schema.org",
        "@type": "WebPage",
        name: title,
        description,
        url: canonicalUrl,
        inLanguage: "en-PH",
        isPartOf: {
          "@type": "WebSite",
          name: "TapatChain",
          url: seoSiteUrl,
        },
      });
      return;
    }

    upsertStructuredData({
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "WebSite",
          name: "TapatChain",
          url: seoSiteUrl,
          inLanguage: "en-PH",
        },
        {
          "@type": "Organization",
          name: "TapatChain",
          url: seoSiteUrl,
          logo: `${seoSiteUrl}/tapatchain.png`,
        },
        {
          "@type": "WebPage",
          name: title,
          description,
          url: canonicalUrl,
        },
      ],
    });
  }, [currentBasePage, currentMonitorSlug, currentPage, isMonitorPage]);

  return (
    <div className="min-h-screen bg-background">
      <TopProgressBar loading={isPageNavigating} />
      <Navbar 
        currentPage={currentPage} 
        setCurrentPage={navigateWithProgress}
        currentRole={getCurrentRole()}
      />
      <main className={isDarkBorderlessSurfacePage ? "dark-borderless-surfaces" : undefined}>
        {currentPage === 'home' && <HomePage setCurrentPage={navigateWithProgress} />}
        {currentPage === 'auth' && <MetaMaskAuthPage setCurrentPage={navigateWithProgress} />}
        {currentPage === 'contractor' && <ContractorDashboard setCurrentPage={navigateWithProgress} />}
        {currentPage === 'inspector' && <DPWHProjectEngineerDashboard setCurrentPage={navigateWithProgress} />}
        {currentPage === 'auditor' && <COARegionalAuditorDashboard setCurrentPage={navigateWithProgress} />}
        {isOverseerPage && (
          <COANationalOversightDashboard
            setCurrentPage={navigateWithProgress}
            initialTab={overseerInitialTab}
            initialFinalSealProjectId={overseerInitialProjectId}
          />
        )}
        {currentPage.startsWith('admin') && (
          <DPWHNationalAdminPortal
            setCurrentPage={navigateWithProgress}
            initialTab={currentPage.includes(':') ? currentPage.split(':')[1] : undefined}
          />
        )}
        {currentPage === 'rdc' && <RDCDashboard setCurrentPage={navigateWithProgress} />}
        {currentPage === 'rd' && <DPWHRegionalDirectorDashboard setCurrentPage={navigateWithProgress} />}
        {currentPage === 'professional-registry' && <ProfessionalRegistryPage setCurrentPage={navigateWithProgress} />}
        {(currentPage === 'public' || currentPage === 'ledger' || isMonitorPage) && (
          <PublicLedgerPage
            setCurrentPage={navigateWithProgress}
            trackingSlug={currentMonitorSlug || undefined}
          />
        )}
        {currentPage === 'community-feedback' && <CommunityHubPage setCurrentPage={navigateWithProgress} />}
        {currentPage === 'community-feedback-form' && <CommunityFeedbackFormPage setCurrentPage={navigateWithProgress} />}
        {currentPage === 'community-report-form' && <PublicReportFormPage setCurrentPage={navigateWithProgress} />}
        {currentPage === 'unauthorized' && <UnauthorizedPage setCurrentPage={navigateWithProgress} />}
        {currentPage === 'about' && <AboutPage setCurrentPage={navigateWithProgress} />}
        {currentPage === 'contact' && <ContactPage setCurrentPage={navigateWithProgress} />}
        {currentPage === 'developers' && <DevelopersPage setCurrentPage={navigateWithProgress} />}
        {currentPage === 'privacy' && <PrivacyPolicyPage setCurrentPage={navigateWithProgress} />}
        {currentPage === 'terms' && <TermsOfUsePage setCurrentPage={navigateWithProgress} />}
      </main>
      <Footer setCurrentPage={navigateWithProgress} />
    </div>
  );
}

function App() {
  return (
    <WalletProvider>
      <NotificationProvider>
        <ProjectProvider>
          <MilestoneProvider>
            <AuditTrailProvider>
              <AppContent />
            </AuditTrailProvider>
          </MilestoneProvider>
        </ProjectProvider>
      </NotificationProvider>
    </WalletProvider>
  );
}

export default App;
