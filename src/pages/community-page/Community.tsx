import { type ReactElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as signalR from "@microsoft/signalr";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { PaginationControls } from "@/components/ui";
import { useCommunityHubPage } from "@/hooks/community/useCommunityHubPage";
import { useWallet } from "@/context/WalletContext";
import { resolveApiBaseUrl } from "@/shared/config/apiBaseUrl";
import {
  communityFeedbackApi,
  publicReportApi,
  type CommunityFeedbackCommentResponse,
  type CommunityFeedbackEngagementResponse,
  type CommunityReactionType,
} from "@/features/community/api/communityApi";
import {
  Search,
  ShieldCheck,
  UserCircle,
  FolderOpen,
  MessageCircle,
  Loader2,
  AlertCircle,
  Camera,
  SlidersHorizontal,
  Heart,
  Send,
  ThumbsUp,
  Angry,
  type LucideIcon,
} from "lucide-react";

interface CommunityHubPageProps {
  setCurrentPage: (page: string) => void;
}

const FEEDBACK_PAGE_SIZE = 6;
const REPORTS_PAGE_SIZE = 6;
const COMMUNITY_GUEST_ACTOR_KEY = "communityGuestActorKey.v1";
const REACTION_REVEAL_DELAY_MS = 650;
const REACTION_CLOSE_DELAY_MS = 180;
const COMMUNITY_SIGNALR_EVENT = "CommunityFeedbackEngagementChanged";
const COMMUNITY_SIGNALR_HUB_PATH = "/hubs/community-engagement";

function getCommunityHubUrl(): string {
  const rawBaseUrl = resolveApiBaseUrl();
  const normalizedBaseUrl = rawBaseUrl.replace(/\/+$/, "");
  return `${normalizedBaseUrl}${COMMUNITY_SIGNALR_HUB_PATH}`;
}

function getReportEngagementKey(reportId: string): string {
  return `report:${reportId}`;
}

function getReportIdFromEngagementKey(reportKey: string): string {
  return reportKey.startsWith("report:") ? reportKey.slice("report:".length) : reportKey;
}

type ReactionType = CommunityReactionType;

const REACTION_OPTIONS: Array<{
  type: ReactionType;
  label: string;
  icon: LucideIcon;
  activeClass: string;
}> = [
  { type: "like", label: "Like", icon: ThumbsUp, activeClass: "text-foreground" },
  { type: "love", label: "Love", icon: Heart, activeClass: "text-rose-500" },
  { type: "angry", label: "Angry", icon: Angry, activeClass: "text-orange-500" },
];

const DEFAULT_REACTION_COUNTS: Record<ReactionType, number> = {
  like: 0,
  love: 0,
  angry: 0,
};

interface FeedbackComment {
  id: string;
  feedbackId: string;
  parentCommentId: string | null;
  author: string;
  text: string;
  actorWallet: string | null;
  createdAt: string;
  replies: FeedbackComment[];
}

interface FeedbackEngagement {
  selectedReaction: ReactionType | null;
  reactionCounts: Record<ReactionType, number>;
  totalReactions: number;
  commentsCount: number;
  comments: FeedbackComment[];
}

type ReactionApplyMode = "toggle" | "set";

function toSafeReactionType(raw?: string | null): ReactionType | null {
  const normalized = String(raw ?? "").trim().toLowerCase();
  return REACTION_OPTIONS.some((reaction) => reaction.type === normalized)
    ? (normalized as ReactionType)
    : null;
}

function countThreadComments(comments: FeedbackComment[]): number {
  return comments.reduce((total, comment) => total + 1 + countThreadComments(comment.replies), 0);
}

function mapComment(comment: CommunityFeedbackCommentResponse): FeedbackComment {
  return {
    id: String(comment.id ?? ""),
    feedbackId: String(comment.feedbackId ?? ""),
    parentCommentId: comment.parentCommentId ? String(comment.parentCommentId) : null,
    author: String(comment.actorName ?? "Citizen") || "Citizen",
    text: String(comment.content ?? ""),
    actorWallet: comment.actorWallet ? String(comment.actorWallet) : null,
    createdAt: String(comment.createdAt ?? ""),
    replies: Array.isArray(comment.replies) ? comment.replies.map(mapComment) : [],
  };
}

function appendReplyToThread(
  comments: FeedbackComment[],
  parentCommentId: string,
  reply: FeedbackComment
): { nextComments: FeedbackComment[]; appended: boolean } {
  let appended = false;

  const nextComments = comments.map((comment) => {
    if (comment.id === parentCommentId) {
      appended = true;
      return {
        ...comment,
        replies: [...comment.replies, reply],
      };
    }

    const nested = appendReplyToThread(comment.replies, parentCommentId, reply);
    if (nested.appended) {
      appended = true;
      return {
        ...comment,
        replies: nested.nextComments,
      };
    }

    return comment;
  });

  return { nextComments, appended };
}

function replaceCommentInThread(
  comments: FeedbackComment[],
  targetCommentId: string,
  replacement: FeedbackComment
): { nextComments: FeedbackComment[]; replaced: boolean } {
  let replaced = false;

  const nextComments = comments.map((comment) => {
    if (comment.id === targetCommentId) {
      replaced = true;
      return replacement;
    }

    const nested = replaceCommentInThread(comment.replies, targetCommentId, replacement);
    if (!nested.replaced) {
      return comment;
    }

    replaced = true;
    return {
      ...comment,
      replies: nested.nextComments,
    };
  });

  return { nextComments, replaced };
}

function removeCommentFromThread(
  comments: FeedbackComment[],
  targetCommentId: string
): { nextComments: FeedbackComment[]; removed: boolean } {
  let removed = false;

  const filtered = comments
    .map((comment) => {
      const nested = removeCommentFromThread(comment.replies, targetCommentId);
      if (nested.removed) {
        removed = true;
        return {
          ...comment,
          replies: nested.nextComments,
        };
      }

      return comment;
    })
    .filter((comment) => {
      const shouldKeep = comment.id !== targetCommentId;
      if (!shouldKeep) {
        removed = true;
      }
      return shouldKeep;
    });

  return { nextComments: filtered, removed };
}

function mapEngagement(payload: CommunityFeedbackEngagementResponse, baseLikes = 0): FeedbackEngagement {
  const reactionCounts = { ...DEFAULT_REACTION_COUNTS };

  (payload.reactionSummary ?? []).forEach((summary) => {
    const reactionType = toSafeReactionType(summary.reactionType);
    if (!reactionType) return;
    reactionCounts[reactionType] = Math.max(0, Number(summary.count) || 0);
  });

  const computedTotal = Object.values(reactionCounts).reduce((sum, count) => sum + count, 0);
  const totalReactions = Math.max(
    Math.max(0, Number(payload.totalReactions) || 0),
    computedTotal,
    Math.max(0, Number(baseLikes) || 0)
  );

  const comments = Array.isArray(payload.comments) ? payload.comments.map(mapComment) : [];
  const commentsCount = Math.max(0, Number(payload.commentsCount) || 0, countThreadComments(comments));

  return {
    selectedReaction: toSafeReactionType(payload.currentUserReaction),
    reactionCounts,
    totalReactions,
    commentsCount,
    comments,
  };
}

function createDefaultEngagement(baseLikes = 0): FeedbackEngagement {
  return {
    selectedReaction: null,
    reactionCounts: {
      like: Math.max(0, Number(baseLikes) || 0),
      love: 0,
      angry: 0,
    },
    totalReactions: Math.max(0, Number(baseLikes) || 0),
    commentsCount: 0,
    comments: [],
  };
}

function applyReactionOptimistically(
  engagement: FeedbackEngagement,
  reaction: ReactionType,
  mode: ReactionApplyMode
): FeedbackEngagement {
  const nextCounts = { ...engagement.reactionCounts };
  const previousReaction = engagement.selectedReaction;

  if (previousReaction && nextCounts[previousReaction] > 0) {
    nextCounts[previousReaction] -= 1;
  }

  const shouldClearReaction = mode === "toggle" && previousReaction === reaction;
  const nextReaction = shouldClearReaction ? null : reaction;

  if (nextReaction) {
    nextCounts[nextReaction] += 1;
  }

  return {
    ...engagement,
    selectedReaction: nextReaction,
    reactionCounts: nextCounts,
    totalReactions: Object.values(nextCounts).reduce((sum, value) => sum + Math.max(0, value), 0),
  };
}

export function CommunityHubPage({ setCurrentPage }: CommunityHubPageProps) {
  const { userProfile, walletAddress } = useWallet();

  const {
    contentType,
    setContentType,
    communityFeedback,
    publicReports,
    showComposer,
    isSubmittingComposer,
    composerAlert,
    feedbackDraft,
    setFeedbackDraft,
    reportDraft,
    setReportDraft,
    allProjects,
    regionLookup,
    reportTypeOptions,
    searchQuery,
    setSearchQuery,
    filterMunicipality,
    setFilterMunicipality,
    filterRegion,
    setFilterRegion,
    closeComposer,
    getProjectCoreMeta,
    handleFeedbackProjectChange,
    handleReportProjectChange,
    handleSubmitFeedback,
    handleSubmitReport,
    filteredFeedback,
    filteredReports,
    handleNavigateToProject,
  } = useCommunityHubPage({ setCurrentPage });

  const [feedbackPage, setFeedbackPage] = useState(1);
  const [reportsPage, setReportsPage] = useState(1);
  const [engagementByPostId, setEngagementByPostId] = useState<Record<string, FeedbackEngagement>>({});
  const [busyPostById, setBusyPostById] = useState<Record<string, boolean>>({});
  const [commentDraftByPostId, setCommentDraftByPostId] = useState<Record<string, string>>({});
  const [replyDraftByCommentId, setReplyDraftByCommentId] = useState<Record<string, string>>({});
  const [openReplyBoxByCommentId, setOpenReplyBoxByCommentId] = useState<Record<string, boolean>>({});
  const [expandedRepliesByCommentId, setExpandedRepliesByCommentId] = useState<Record<string, boolean>>({});
  const [expandedCommentsByPostId, setExpandedCommentsByPostId] = useState<Record<string, boolean>>({});
  const [openReactionPickerForPostId, setOpenReactionPickerForPostId] = useState<string | null>(null);
  const engagementByPostIdRef = useRef<Record<string, FeedbackEngagement>>({});
  const reactionRevealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reactionCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressLikeClickPostIdRef = useRef<string | null>(null);
  const suppressOnRevealRef = useRef(false);
  const reactionRequestVersionRef = useRef<Record<string, number>>({});
  const signalRConnectionRef = useRef<signalR.HubConnection | null>(null);
  const signalRSubscribedPostIdsRef = useRef<Set<string>>(new Set());
  const feedbackBaseLikesByPostIdRef = useRef<Record<string, number>>({});
  const actorKeyRef = useRef<string>("");
  const actorWalletRef = useRef<string | undefined>(undefined);
  const [isSignalRConnected, setIsSignalRConnected] = useState(false);

  const actorContext = useMemo(() => {
    const actorWallet = String(walletAddress ?? userProfile?.walletAddress ?? "").trim() || undefined;
    const profileIdKey = String(userProfile?.id ?? "").trim().toLowerCase();
    const actorName =
      String(userProfile?.displayName ?? "").trim() ||
      String(userProfile?.email ?? "").trim() ||
      "Citizen";

    const emailKey = String(userProfile?.email ?? "").trim().toLowerCase();
    let actorKey = profileIdKey || actorWallet || emailKey;

    if (!actorKey) {
      const existing = localStorage.getItem(COMMUNITY_GUEST_ACTOR_KEY);
      if (existing) {
        actorKey = existing;
      } else {
        const generated = `guest-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        localStorage.setItem(COMMUNITY_GUEST_ACTOR_KEY, generated);
        actorKey = generated;
      }
    }

    return {
      actorKey,
      actorName,
      actorWallet,
    };
  }, [walletAddress, userProfile?.displayName, userProfile?.email, userProfile?.id, userProfile?.walletAddress]);

  useEffect(() => {
    actorKeyRef.current = actorContext.actorKey;
  }, [actorContext.actorKey]);

  useEffect(() => {
    actorWalletRef.current = actorContext.actorWallet;
  }, [actorContext.actorWallet]);

  useEffect(() => {
    engagementByPostIdRef.current = engagementByPostId;
  }, [engagementByPostId]);

  useEffect(() => {
    if (communityFeedback.length === 0) {
      setEngagementByPostId({});
      engagementByPostIdRef.current = {};
      feedbackBaseLikesByPostIdRef.current = {};
      return;
    }

    feedbackBaseLikesByPostIdRef.current = communityFeedback.reduce<Record<string, number>>((acc, feedback) => {
      const postId = String(feedback.id ?? "").trim();
      if (!postId) {
        return acc;
      }

      acc[postId] = Math.max(0, Number(feedback.likes) || 0);
      return acc;
    }, {});

    setEngagementByPostId((prev) => {
      const next = { ...prev };

      communityFeedback.forEach((feedback) => {
        const postId = String(feedback.id ?? "").trim();
        if (!postId) return;
        if (!next[postId]) {
          next[postId] = createDefaultEngagement(feedback.likes);
        }
      });

      return next;
    });
  }, [communityFeedback]);

  useEffect(() => {
    if (communityFeedback.length === 0) return;

    let canceled = false;

    const syncEngagement = async () => {
      const entries = await Promise.all(
        communityFeedback.map(async (feedback) => {
          const postId = String(feedback.id ?? "").trim();
          if (!postId) return null;

          try {
            const response = await communityFeedbackApi.getEngagement(
              postId,
              actorContext.actorKey,
              actorContext.actorWallet
            );
            return {
              postId,
              engagement: mapEngagement(response.data, feedback.likes),
            };
          } catch {
            return {
              postId,
              engagement: createDefaultEngagement(feedback.likes),
            };
          }
        })
      );

      if (canceled) return;

      setEngagementByPostId((prev) => {
        const next = { ...prev };
        entries.forEach((entry) => {
          if (!entry) return;
          next[entry.postId] = entry.engagement;
        });
        return next;
      });
    };

    void syncEngagement();

    return () => {
      canceled = true;
    };
  }, [actorContext.actorKey, communityFeedback]);

  useEffect(() => {
    if (publicReports.length === 0) return;

    setEngagementByPostId((prev) => {
      const next = { ...prev };

      publicReports.forEach((report) => {
        const reportId = String(report.id ?? "").trim();
        if (!reportId) return;

        const reportKey = getReportEngagementKey(reportId);
        if (!next[reportKey]) {
          next[reportKey] = createDefaultEngagement(0);
        }
      });

      return next;
    });
  }, [publicReports]);

  useEffect(() => {
    if (publicReports.length === 0) return;

    let canceled = false;

    const syncReportEngagement = async () => {
      const entries = await Promise.all(
        publicReports.map(async (report) => {
          const reportId = String(report.id ?? "").trim();
          if (!reportId) return null;

          try {
            const response = await publicReportApi.getEngagement(
              reportId,
              actorContext.actorKey,
              actorContext.actorWallet
            );
            return {
              reportKey: getReportEngagementKey(reportId),
              engagement: mapEngagement(response.data, 0),
            };
          } catch {
            return {
              reportKey: getReportEngagementKey(reportId),
              engagement: createDefaultEngagement(0),
            };
          }
        })
      );

      if (canceled) return;

      setEngagementByPostId((prev) => {
        const next = { ...prev };
        entries.forEach((entry) => {
          if (!entry) return;
          next[entry.reportKey] = entry.engagement;
        });
        return next;
      });
    };

    void syncReportEngagement();

    return () => {
      canceled = true;
    };
  }, [actorContext.actorKey, actorContext.actorWallet, publicReports]);

  useEffect(() => {
    return () => {
      if (reactionRevealTimerRef.current) {
        clearTimeout(reactionRevealTimerRef.current);
        reactionRevealTimerRef.current = null;
      }
      if (reactionCloseTimerRef.current) {
        clearTimeout(reactionCloseTimerRef.current);
        reactionCloseTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const handleGlobalPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest("[data-reaction-root='true']")) return;
      setOpenReactionPickerForPostId(null);
      suppressLikeClickPostIdRef.current = null;
    };

    document.addEventListener("mousedown", handleGlobalPointerDown);
    document.addEventListener("touchstart", handleGlobalPointerDown);

    return () => {
      document.removeEventListener("mousedown", handleGlobalPointerDown);
      document.removeEventListener("touchstart", handleGlobalPointerDown);
    };
  }, []);

  const feedbackTotalPages = Math.max(1, Math.ceil(filteredFeedback.length / FEEDBACK_PAGE_SIZE));
  const reportsTotalPages = Math.max(1, Math.ceil(filteredReports.length / REPORTS_PAGE_SIZE));

  useEffect(() => {
    setFeedbackPage(1);
  }, [
    contentType,
    searchQuery,
    filterMunicipality,
    filterRegion,
    filteredFeedback.length,
  ]);

  useEffect(() => {
    setReportsPage(1);
  }, [contentType, searchQuery, filterMunicipality, filterRegion, filteredReports.length]);

  const pagedFeedback = useMemo(() => {
    const safePage = Math.min(feedbackPage, feedbackTotalPages);
    const start = (safePage - 1) * FEEDBACK_PAGE_SIZE;
    return filteredFeedback.slice(start, start + FEEDBACK_PAGE_SIZE);
  }, [filteredFeedback, feedbackPage, feedbackTotalPages]);

  const pagedReports = useMemo(() => {
    const safePage = Math.min(reportsPage, reportsTotalPages);
    const start = (safePage - 1) * REPORTS_PAGE_SIZE;
    return filteredReports.slice(start, start + REPORTS_PAGE_SIZE);
  }, [filteredReports, reportsPage, reportsTotalPages]);

  const getPostEngagement = (postId: string, baseLikes = 0): FeedbackEngagement => {
    return engagementByPostId[postId] ?? createDefaultEngagement(baseLikes);
  };

  const clearReactionRevealTimer = () => {
    if (!reactionRevealTimerRef.current) return;
    clearTimeout(reactionRevealTimerRef.current);
    reactionRevealTimerRef.current = null;
    suppressOnRevealRef.current = false;
  };

  const clearReactionCloseTimer = () => {
    if (!reactionCloseTimerRef.current) return;
    clearTimeout(reactionCloseTimerRef.current);
    reactionCloseTimerRef.current = null;
  };

  const scheduleReactionPickerClose = (postId: string) => {
    clearReactionCloseTimer();
    reactionCloseTimerRef.current = setTimeout(() => {
      setOpenReactionPickerForPostId((prev) => (prev === postId ? null : prev));
      reactionCloseTimerRef.current = null;
    }, REACTION_CLOSE_DELAY_MS);
  };

  const startReactionRevealTimer = (postId: string, suppressLikeClick: boolean) => {
    clearReactionRevealTimer();
    clearReactionCloseTimer();
    suppressOnRevealRef.current = suppressLikeClick;
    reactionRevealTimerRef.current = setTimeout(() => {
      if (suppressOnRevealRef.current) {
        suppressLikeClickPostIdRef.current = postId;
      }
      suppressOnRevealRef.current = false;
      setOpenReactionPickerForPostId(postId);
      reactionRevealTimerRef.current = null;
    }, REACTION_REVEAL_DELAY_MS);
  };

  const setPostBusy = (postId: string, value: boolean) => {
    setBusyPostById((prev) => ({
      ...prev,
      [postId]: value,
    }));
  };

  const refreshEngagement = async (postId: string, baseLikes: number) => {
    const response = await communityFeedbackApi.getEngagement(
      postId,
      actorContext.actorKey,
      actorContext.actorWallet
    );
    setEngagementByPostId((prev) => ({
      ...prev,
      [postId]: mapEngagement(response.data, baseLikes),
    }));
  };

  const refreshEngagementFromRealtime = useCallback(async (postId: string) => {
    const baseLikes = feedbackBaseLikesByPostIdRef.current[postId] ?? 0;

    try {
      const response = await communityFeedbackApi.getEngagement(postId, actorKeyRef.current, actorWalletRef.current);
      const mapped = mapEngagement(response.data, baseLikes);

      engagementByPostIdRef.current = {
        ...engagementByPostIdRef.current,
        [postId]: mapped,
      };

      setEngagementByPostId((prev) => ({
        ...prev,
        [postId]: mapped,
      }));
    } catch {
      // Keep UI stable when transient realtime refresh fails.
    }
  }, []);

  const syncSignalRSubscriptions = useCallback(async () => {
    const connection = signalRConnectionRef.current;
    if (!connection || connection.state !== signalR.HubConnectionState.Connected) {
      return;
    }

    const targetIds = new Set(Object.keys(feedbackBaseLikesByPostIdRef.current));

    const currentlySubscribed = signalRSubscribedPostIdsRef.current;

    const idsToSubscribe = [...targetIds].filter((id) => !currentlySubscribed.has(id));
    const idsToUnsubscribe = [...currentlySubscribed].filter((id) => !targetIds.has(id));

    for (const feedbackId of idsToSubscribe) {
      try {
        await connection.invoke("SubscribeFeedback", feedbackId);
        currentlySubscribed.add(feedbackId);
      } catch {
        // Connection retries will reattempt subscription.
      }
    }

    for (const feedbackId of idsToUnsubscribe) {
      try {
        await connection.invoke("UnsubscribeFeedback", feedbackId);
      } catch {
        // Ignore unsubscribe failures during reconnect churn.
      }
      currentlySubscribed.delete(feedbackId);
    }
  }, []);

  useEffect(() => {
    const connection = new signalR.HubConnectionBuilder()
      .withUrl(getCommunityHubUrl(), { withCredentials: true })
      .withAutomaticReconnect([0, 1000, 3000, 5000])
      .build();

    signalRConnectionRef.current = connection;

    const startConnection = async () => {
      try {
        await connection.start();
        setIsSignalRConnected(true);
      } catch {
        setIsSignalRConnected(false);
      }
    };

    connection.on(COMMUNITY_SIGNALR_EVENT, (payload: { feedbackId?: string }) => {
      const feedbackId = String(payload?.feedbackId ?? "").trim();
      if (!feedbackId) {
        return;
      }

      void refreshEngagementFromRealtime(feedbackId);
    });

    connection.onreconnecting(() => {
      setIsSignalRConnected(false);
    });

    connection.onreconnected(() => {
      setIsSignalRConnected(true);
    });

    connection.onclose(() => {
      setIsSignalRConnected(false);
    });

    void startConnection();

    return () => {
      signalRSubscribedPostIdsRef.current.clear();
      signalRConnectionRef.current = null;
      setIsSignalRConnected(false);
      connection.off(COMMUNITY_SIGNALR_EVENT);
      void connection.stop();
    };
  }, [refreshEngagementFromRealtime]);

  useEffect(() => {
    if (!isSignalRConnected) {
      return;
    }

    void syncSignalRSubscriptions();
  }, [communityFeedback, isSignalRConnected, syncSignalRSubscriptions]);

  const handleReaction = async (
    postId: string,
    reaction: ReactionType,
    baseLikes: number,
    mode: ReactionApplyMode = "toggle"
  ) => {
    const previousEngagement = engagementByPostIdRef.current[postId] ?? createDefaultEngagement(baseLikes);
    const optimisticEngagement = applyReactionOptimistically(previousEngagement, reaction, mode);
    const requestVersion = (reactionRequestVersionRef.current[postId] ?? 0) + 1;
    reactionRequestVersionRef.current[postId] = requestVersion;

    engagementByPostIdRef.current = {
      ...engagementByPostIdRef.current,
      [postId]: optimisticEngagement,
    };

    setEngagementByPostId((prev) => ({
      ...prev,
      [postId]: optimisticEngagement,
    }));
    setOpenReactionPickerForPostId(null);
    suppressLikeClickPostIdRef.current = null;

    try {
      const response = await communityFeedbackApi.react(postId, {
        reactionType: reaction,
        actorKey: actorContext.actorKey,
        actorName: actorContext.actorName,
        actorWallet: actorContext.actorWallet,
      });

      if (reactionRequestVersionRef.current[postId] !== requestVersion) {
        return;
      }

      const serverEngagement = mapEngagement(response.data, baseLikes);
      engagementByPostIdRef.current = {
        ...engagementByPostIdRef.current,
        [postId]: serverEngagement,
      };

      setEngagementByPostId((prev) => ({
        ...prev,
        [postId]: serverEngagement,
      }));
    } catch {
      if (reactionRequestVersionRef.current[postId] !== requestVersion) {
        return;
      }

      engagementByPostIdRef.current = {
        ...engagementByPostIdRef.current,
        [postId]: previousEngagement,
      };

      setEngagementByPostId((prev) => ({
        ...prev,
        [postId]: previousEngagement,
      }));
    }
  };

  const handleAddComment = async (postId: string, baseLikes: number) => {
    const draft = String(commentDraftByPostId[postId] ?? "").trim();
    if (!draft) return;

    if (busyPostById[postId]) return;

    const optimisticCommentId = `tmp-comment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const nowIso = new Date().toISOString();
    const optimisticComment: FeedbackComment = {
      id: optimisticCommentId,
      feedbackId: postId,
      parentCommentId: null,
      author: actorContext.actorName,
      text: draft,
      actorWallet: actorContext.actorWallet ?? null,
      createdAt: nowIso,
      replies: [],
    };

    setPostBusy(postId, true);
    setEngagementByPostId((prev) => {
      const current = prev[postId] ?? createDefaultEngagement(baseLikes);
      return {
        ...prev,
        [postId]: {
          ...current,
          comments: [...current.comments, optimisticComment],
          commentsCount: current.commentsCount + 1,
        },
      };
    });
    setCommentDraftByPostId((prev) => ({
      ...prev,
      [postId]: "",
    }));
    setExpandedCommentsByPostId((prev) => ({
      ...prev,
      [postId]: true,
    }));

    try {
      const response = await communityFeedbackApi.addComment(postId, {
        content: draft,
        actorName: actorContext.actorName,
        actorWallet: actorContext.actorWallet,
        actorKey: actorContext.actorKey,
      });

      const createdComment = mapComment(response.data);

      setEngagementByPostId((prev) => {
        const current = prev[postId] ?? createDefaultEngagement(baseLikes);
        const replaced = replaceCommentInThread(current.comments, optimisticCommentId, createdComment);

        if (!replaced.replaced) {
          return {
            ...prev,
            [postId]: {
              ...current,
              comments: [...current.comments, createdComment],
              commentsCount: current.commentsCount + 1,
            },
          };
        }

        return {
          ...prev,
          [postId]: {
            ...current,
            comments: replaced.nextComments,
          },
        };
      });

      if (!isSignalRConnected) {
        void refreshEngagementFromRealtime(postId);
      }
    } catch (error) {
      console.error("Failed to add community comment", error);

      setEngagementByPostId((prev) => {
        const current = prev[postId] ?? createDefaultEngagement(baseLikes);
        const removed = removeCommentFromThread(current.comments, optimisticCommentId);

        if (!removed.removed) {
          return prev;
        }

        return {
          ...prev,
          [postId]: {
            ...current,
            comments: removed.nextComments,
            commentsCount: Math.max(0, current.commentsCount - 1),
          },
        };
      });

      setCommentDraftByPostId((prev) => ({
        ...prev,
        [postId]: draft,
      }));
    } finally {
      setPostBusy(postId, false);
    }
  };

  const handleAddReply = async (postId: string, commentId: string, baseLikes: number) => {
    const draft = String(replyDraftByCommentId[commentId] ?? "").trim();
    if (!draft) return;

    if (busyPostById[postId]) return;

    const optimisticReplyId = `tmp-reply-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const nowIso = new Date().toISOString();
    const optimisticReply: FeedbackComment = {
      id: optimisticReplyId,
      feedbackId: postId,
      parentCommentId: commentId,
      author: actorContext.actorName,
      text: draft,
      actorWallet: actorContext.actorWallet ?? null,
      createdAt: nowIso,
      replies: [],
    };

    setPostBusy(postId, true);
    setEngagementByPostId((prev) => {
      const current = prev[postId] ?? createDefaultEngagement(baseLikes);
      const nested = appendReplyToThread(current.comments, commentId, optimisticReply);

      if (!nested.appended) {
        return prev;
      }

      return {
        ...prev,
        [postId]: {
          ...current,
          comments: nested.nextComments,
          commentsCount: current.commentsCount + 1,
        },
      };
    });
    setReplyDraftByCommentId((prev) => ({
      ...prev,
      [commentId]: "",
    }));
    setOpenReplyBoxByCommentId((prev) => ({
      ...prev,
      [commentId]: false,
    }));
    setExpandedCommentsByPostId((prev) => ({
      ...prev,
      [postId]: true,
    }));
    setExpandedRepliesByCommentId((prev) => ({
      ...prev,
      [commentId]: true,
    }));

    try {
      const response = await communityFeedbackApi.addReply(postId, commentId, {
        content: draft,
        actorName: actorContext.actorName,
        actorWallet: actorContext.actorWallet,
        actorKey: actorContext.actorKey,
      });

      const createdReply = mapComment(response.data);

      setEngagementByPostId((prev) => {
        const current = prev[postId] ?? createDefaultEngagement(baseLikes);
        const replaced = replaceCommentInThread(current.comments, optimisticReplyId, createdReply);

        if (!replaced.replaced) {
          return prev;
        }

        return {
          ...prev,
          [postId]: {
            ...current,
            comments: replaced.nextComments,
          },
        };
      });

      if (!isSignalRConnected) {
        void refreshEngagementFromRealtime(postId);
      }
    } catch (error) {
      console.error("Failed to add community reply", error);

      setEngagementByPostId((prev) => {
        const current = prev[postId] ?? createDefaultEngagement(baseLikes);
        const removed = removeCommentFromThread(current.comments, optimisticReplyId);

        if (!removed.removed) {
          return prev;
        }

        return {
          ...prev,
          [postId]: {
            ...current,
            comments: removed.nextComments,
            commentsCount: Math.max(0, current.commentsCount - 1),
          },
        };
      });

      setReplyDraftByCommentId((prev) => ({
        ...prev,
        [commentId]: draft,
      }));
      setOpenReplyBoxByCommentId((prev) => ({
        ...prev,
        [commentId]: true,
      }));
    } finally {
      setPostBusy(postId, false);
    }
  };

  const refreshReportEngagement = async (reportKey: string) => {
    const reportId = getReportIdFromEngagementKey(reportKey);
    if (!reportId) return;

    const response = await publicReportApi.getEngagement(
      reportId,
      actorContext.actorKey,
      actorContext.actorWallet
    );

    setEngagementByPostId((prev) => ({
      ...prev,
      [reportKey]: mapEngagement(response.data, 0),
    }));
  };

  const handleReportReaction = async (
    reportKey: string,
    reaction: ReactionType,
    baseLikes: number,
    mode: ReactionApplyMode = "toggle"
  ) => {
    const reportId = getReportIdFromEngagementKey(reportKey);
    if (!reportId) return;

    const previousEngagement = engagementByPostIdRef.current[reportKey] ?? createDefaultEngagement(baseLikes);
    const optimisticEngagement = applyReactionOptimistically(previousEngagement, reaction, mode);
    const requestVersion = (reactionRequestVersionRef.current[reportKey] ?? 0) + 1;
    reactionRequestVersionRef.current[reportKey] = requestVersion;

    engagementByPostIdRef.current = {
      ...engagementByPostIdRef.current,
      [reportKey]: optimisticEngagement,
    };

    setEngagementByPostId((prev) => ({
      ...prev,
      [reportKey]: optimisticEngagement,
    }));
    setOpenReactionPickerForPostId(null);
    suppressLikeClickPostIdRef.current = null;

    try {
      const response = await publicReportApi.react(reportId, {
        reactionType: reaction,
        actorKey: actorContext.actorKey,
        actorName: actorContext.actorName,
        actorWallet: actorContext.actorWallet,
      });

      if (reactionRequestVersionRef.current[reportKey] !== requestVersion) {
        return;
      }

      const serverEngagement = mapEngagement(response.data, baseLikes);
      engagementByPostIdRef.current = {
        ...engagementByPostIdRef.current,
        [reportKey]: serverEngagement,
      };

      setEngagementByPostId((prev) => ({
        ...prev,
        [reportKey]: serverEngagement,
      }));
    } catch {
      if (reactionRequestVersionRef.current[reportKey] !== requestVersion) {
        return;
      }

      engagementByPostIdRef.current = {
        ...engagementByPostIdRef.current,
        [reportKey]: previousEngagement,
      };

      setEngagementByPostId((prev) => ({
        ...prev,
        [reportKey]: previousEngagement,
      }));
    }
  };

  const handleAddReportComment = async (reportKey: string, baseLikes: number) => {
    const reportId = getReportIdFromEngagementKey(reportKey);
    if (!reportId) return;

    const draft = String(commentDraftByPostId[reportKey] ?? "").trim();
    if (!draft) return;

    if (busyPostById[reportKey]) return;

    const optimisticCommentId = `tmp-report-comment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const nowIso = new Date().toISOString();
    const optimisticComment: FeedbackComment = {
      id: optimisticCommentId,
      feedbackId: reportId,
      parentCommentId: null,
      author: actorContext.actorName,
      text: draft,
      actorWallet: actorContext.actorWallet ?? null,
      createdAt: nowIso,
      replies: [],
    };

    setPostBusy(reportKey, true);
    setEngagementByPostId((prev) => {
      const current = prev[reportKey] ?? createDefaultEngagement(baseLikes);
      return {
        ...prev,
        [reportKey]: {
          ...current,
          comments: [...current.comments, optimisticComment],
          commentsCount: current.commentsCount + 1,
        },
      };
    });
    setCommentDraftByPostId((prev) => ({
      ...prev,
      [reportKey]: "",
    }));
    setExpandedCommentsByPostId((prev) => ({
      ...prev,
      [reportKey]: true,
    }));

    try {
      const response = await publicReportApi.addComment(reportId, {
        content: draft,
        actorName: actorContext.actorName,
        actorWallet: actorContext.actorWallet,
        actorKey: actorContext.actorKey,
      });

      const createdComment = mapComment(response.data);

      setEngagementByPostId((prev) => {
        const current = prev[reportKey] ?? createDefaultEngagement(baseLikes);
        const replaced = replaceCommentInThread(current.comments, optimisticCommentId, createdComment);

        if (!replaced.replaced) {
          return {
            ...prev,
            [reportKey]: {
              ...current,
              comments: [...current.comments, createdComment],
              commentsCount: current.commentsCount + 1,
            },
          };
        }

        return {
          ...prev,
          [reportKey]: {
            ...current,
            comments: replaced.nextComments,
          },
        };
      });

      void refreshReportEngagement(reportKey);
    } catch (error) {
      console.error("Failed to add report comment", error);

      setEngagementByPostId((prev) => {
        const current = prev[reportKey] ?? createDefaultEngagement(baseLikes);
        const removed = removeCommentFromThread(current.comments, optimisticCommentId);

        if (!removed.removed) {
          return prev;
        }

        return {
          ...prev,
          [reportKey]: {
            ...current,
            comments: removed.nextComments,
            commentsCount: Math.max(0, current.commentsCount - 1),
          },
        };
      });

      setCommentDraftByPostId((prev) => ({
        ...prev,
        [reportKey]: draft,
      }));
    } finally {
      setPostBusy(reportKey, false);
    }
  };

  const handleAddReportReply = async (reportKey: string, commentId: string, baseLikes: number) => {
    const reportId = getReportIdFromEngagementKey(reportKey);
    if (!reportId) return;

    const draft = String(replyDraftByCommentId[commentId] ?? "").trim();
    if (!draft) return;

    if (busyPostById[reportKey]) return;

    const optimisticReplyId = `tmp-report-reply-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const nowIso = new Date().toISOString();
    const optimisticReply: FeedbackComment = {
      id: optimisticReplyId,
      feedbackId: reportId,
      parentCommentId: commentId,
      author: actorContext.actorName,
      text: draft,
      actorWallet: actorContext.actorWallet ?? null,
      createdAt: nowIso,
      replies: [],
    };

    setPostBusy(reportKey, true);
    setEngagementByPostId((prev) => {
      const current = prev[reportKey] ?? createDefaultEngagement(baseLikes);
      const nested = appendReplyToThread(current.comments, commentId, optimisticReply);

      if (!nested.appended) {
        return prev;
      }

      return {
        ...prev,
        [reportKey]: {
          ...current,
          comments: nested.nextComments,
          commentsCount: current.commentsCount + 1,
        },
      };
    });
    setReplyDraftByCommentId((prev) => ({
      ...prev,
      [commentId]: "",
    }));
    setOpenReplyBoxByCommentId((prev) => ({
      ...prev,
      [commentId]: false,
    }));
    setExpandedCommentsByPostId((prev) => ({
      ...prev,
      [reportKey]: true,
    }));
    setExpandedRepliesByCommentId((prev) => ({
      ...prev,
      [commentId]: true,
    }));

    try {
      const response = await publicReportApi.addReply(reportId, commentId, {
        content: draft,
        actorName: actorContext.actorName,
        actorWallet: actorContext.actorWallet,
        actorKey: actorContext.actorKey,
      });

      const createdReply = mapComment(response.data);

      setEngagementByPostId((prev) => {
        const current = prev[reportKey] ?? createDefaultEngagement(baseLikes);
        const replaced = replaceCommentInThread(current.comments, optimisticReplyId, createdReply);

        if (!replaced.replaced) {
          return prev;
        }

        return {
          ...prev,
          [reportKey]: {
            ...current,
            comments: replaced.nextComments,
          },
        };
      });

      void refreshReportEngagement(reportKey);
    } catch (error) {
      console.error("Failed to add report reply", error);

      setEngagementByPostId((prev) => {
        const current = prev[reportKey] ?? createDefaultEngagement(baseLikes);
        const removed = removeCommentFromThread(current.comments, optimisticReplyId);

        if (!removed.removed) {
          return prev;
        }

        return {
          ...prev,
          [reportKey]: {
            ...current,
            comments: removed.nextComments,
            commentsCount: Math.max(0, current.commentsCount - 1),
          },
        };
      });

      setReplyDraftByCommentId((prev) => ({
        ...prev,
        [commentId]: draft,
      }));
      setOpenReplyBoxByCommentId((prev) => ({
        ...prev,
        [commentId]: true,
      }));
    } finally {
      setPostBusy(reportKey, false);
    }
  };

  const renderCommentThread = (
    postId: string,
    comment: FeedbackComment,
    baseLikes: number,
    replyHandler: (postId: string, commentId: string, baseLikes: number) => Promise<void> = handleAddReply,
    depth = 0
  ): ReactElement => {
    const isPostingOnPost = Boolean(busyPostById[postId]);
    const canReply = depth === 0;
    const hasReplies = canReply && comment.replies.length > 0;
    const isRepliesExpanded = Boolean(expandedRepliesByCommentId[comment.id]);

    return (
      <div key={comment.id} style={{ marginLeft: depth > 0 ? 26 : 0 }} className="mt-2 first:mt-0">
        <div className="flex items-start gap-2">
          <div className="mt-0.5 h-7 w-7 shrink-0 rounded-full bg-primary/10 flex items-center justify-center">
            <UserCircle className="h-4 w-4 text-primary" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="rounded-2xl px-3 py-2">
              <p className="text-[11px] font-semibold text-foreground">{comment.author}</p>
              <p className="mt-0.5 text-xs text-foreground/90 leading-relaxed">{comment.text}</p>
            </div>

            <div className="mt-1 flex items-center gap-3 px-1">
              {canReply && (
                <button
                  type="button"
                  disabled={isPostingOnPost}
                  onClick={(event) => {
                    event.stopPropagation();
                    setOpenReplyBoxByCommentId((prev) => ({
                      ...prev,
                      [comment.id]: !prev[comment.id],
                    }));
                  }}
                  className="text-[11px] font-semibold text-muted-foreground transition-colors hover:text-primary disabled:opacity-50"
                >
                  Reply
                </button>
              )}
              <span className="text-[10px] text-muted-foreground">
                {new Date(comment.createdAt).toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </span>
            </div>

            {hasReplies && (
              <div className="mt-1 flex items-center gap-2 px-1">
                <span className="h-px w-6 bg-border/70" />
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setExpandedRepliesByCommentId((prev) => ({
                      ...prev,
                      [comment.id]: !prev[comment.id],
                    }));
                  }}
                  className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground"
                >
                  {isRepliesExpanded ? "Hide replies" : `View replies (${comment.replies.length})`}
                </button>
              </div>
            )}

            {canReply && openReplyBoxByCommentId[comment.id] && (
              <div className={`mt-2 flex items-center gap-2 ${isPostingOnPost ? "animate-pulse" : ""}`}>
                <input
                  type="text"
                  disabled={isPostingOnPost}
                  value={replyDraftByCommentId[comment.id] ?? ""}
                  onChange={(event) =>
                    setReplyDraftByCommentId((prev) => ({
                      ...prev,
                      [comment.id]: event.target.value,
                    }))
                  }
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return;
                    event.preventDefault();
                    event.stopPropagation();
                    void replyHandler(postId, comment.id, baseLikes);
                  }}
                  placeholder={isPostingOnPost ? "Sending reply..." : "Write a reply..."}
                  className="h-10 flex-1 rounded-[5px] bg-muted/60 px-3 text-xs text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-1 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60"
                />
                <button
                  type="button"
                  disabled={isPostingOnPost}
                  onClick={(event) => {
                    event.stopPropagation();
                    void replyHandler(postId, comment.id, baseLikes);
                  }}
                  className="h-8 rounded-full bg-muted px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted/80 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isPostingOnPost ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Sending
                    </span>
                  ) : (
                    "Reply"
                  )}
                </button>
              </div>
            )}

            {hasReplies && isRepliesExpanded && comment.replies.map((reply) => renderCommentThread(postId, reply, baseLikes, replyHandler, depth + 1))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background pt-20">
      {/* Header */}
      <div className="sticky top-14 z-20 border-b border-border/60 bg-background/85 backdrop-blur-xl sm:top-16">
        <div className="mx-auto max-w-2xl px-4 py-4 sm:px-6 sm:py-6" style={{ transform: "scale(0.9)", transformOrigin: "top center" }}>
          <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-black tracking-tight text-foreground sm:text-2xl">Community</h1>
              <p className="text-[11px] text-muted-foreground sm:text-xs">
                Citizen feedback & infrastructure reports
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                onClick={() => setCurrentPage("community-feedback-form")}
                variant="outline"
                size="sm"
                className="h-8 rounded-full border-border/70 bg-background/80 px-4 text-[11px]"
              >
                Write Feedback
              </Button>
              <Button
                onClick={() => setCurrentPage("community-report-form")}
                variant="outline"
                size="sm"
                className="h-8 rounded-full border-border/70 bg-background/80 px-4 text-[11px]"
              >
                File Report
              </Button>
            </div>
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-2">
            {/* Content Type Tabs */}
            <div className="inline-flex rounded-full border border-border/70 bg-card/80 p-1 shadow-sm">
              <button
                onClick={() => setContentType("feedback")}
                className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
                  contentType === "feedback"
                    ? "bg-primary text-primary-foreground shadow"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <Camera className="w-3.5 h-3.5" />
                Feedback
              </button>
              <button
                onClick={() => setContentType("reports")}
                className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
                  contentType === "reports"
                    ? "bg-primary text-primary-foreground shadow"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <AlertCircle className="w-3.5 h-3.5" />
                Reports
              </button>
            </div>

            {/* Search and Filters — collapsed by default */}
            <CollapsibleSection
              title="Search & Filters"
              icon={<SlidersHorizontal />}
              plain
              className="w-full sm:ml-auto sm:w-auto"
              badge={
                (searchQuery || filterMunicipality || filterRegion) ? (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">Active</span>
                ) : undefined
              }
            >
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search..."
                    className="w-full rounded-md border border-border bg-background py-1.5 pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground/50 transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20"
                  />
                </div>
                <select
                  value={filterRegion}
                  onChange={(e) => setFilterRegion(e.target.value)}
                  className="rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20"
                >
                  <option value="">All Regions</option>
                  {regionLookup.filter(r => r.name !== 'National').map((r) => (
                    <option key={r.id} value={r.name}>{r.name}</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={filterMunicipality}
                  onChange={(e) => setFilterMunicipality(e.target.value)}
                  placeholder="City or municipality..."
                  className="rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50 transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20"
                />
              </div>
            </CollapsibleSection>
          </div>

          {composerAlert && (
            <div
              className={`mb-3 rounded-md border px-2.5 py-2 text-[11px] ${
                composerAlert.type === "success"
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-destructive/30 bg-destructive/10 text-destructive"
              }`}
            >
              {composerAlert.message}
            </div>
          )}

          {showComposer && (
            <Card className="mb-3 rounded-2xl border border-border/70 bg-card/90 p-3 shadow-sm backdrop-blur-sm">
              {contentType === "feedback" ? (
                <div className="space-y-2.5">
                  <p className="text-xs font-semibold text-foreground">Feedback Form</p>

                  <select
                    value={feedbackDraft.projectId}
                    onChange={(event) => handleFeedbackProjectChange(event.target.value)}
                    className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary"
                  >
                    <option value="">Select project</option>
                    {allProjects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>

                  <input
                    type="text"
                    value={feedbackDraft.location}
                    onChange={(event) =>
                      setFeedbackDraft((prev) => ({
                        ...prev,
                        location: event.target.value,
                      }))
                    }
                    placeholder="Location"
                    className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary"
                  />

                  <textarea
                    value={feedbackDraft.caption}
                    onChange={(event) =>
                      setFeedbackDraft((prev) => ({
                        ...prev,
                        caption: event.target.value,
                      }))
                    }
                    placeholder="Share your feedback about this project"
                    className="min-h-20 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary"
                  />

                  <input
                    type="text"
                    value={feedbackDraft.photo}
                    onChange={(event) =>
                      setFeedbackDraft((prev) => ({
                        ...prev,
                        photo: event.target.value,
                      }))
                    }
                    placeholder="Photo URL (optional)"
                    className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary"
                  />

                  <div className="flex items-center justify-end gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-[11px]"
                      onClick={closeComposer}
                      disabled={isSubmittingComposer}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="h-7 text-[11px]"
                      onClick={handleSubmitFeedback}
                      disabled={isSubmittingComposer}
                    >
                      {isSubmittingComposer ? "Submitting..." : "Submit Feedback"}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <p className="text-xs font-semibold text-foreground">Report Form</p>

                  <select
                    value={reportDraft.projectId}
                    onChange={(event) => handleReportProjectChange(event.target.value)}
                    className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary"
                  >
                    <option value="">Select project</option>
                    {allProjects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>

                  <select
                    value={reportDraft.reportType}
                    onChange={(event) =>
                      setReportDraft((prev) => ({
                        ...prev,
                        reportType: event.target.value,
                      }))
                    }
                    className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary"
                  >
                    {reportTypeOptions.map((typeName) => (
                      <option key={typeName} value={typeName}>
                        {typeName}
                      </option>
                    ))}
                  </select>

                  <textarea
                    value={reportDraft.description}
                    onChange={(event) =>
                      setReportDraft((prev) => ({
                        ...prev,
                        description: event.target.value,
                      }))
                    }
                    placeholder="Describe the issue in detail"
                    className="min-h-20 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary"
                  />

                  <input
                    type="text"
                    value={reportDraft.photo}
                    onChange={(event) =>
                      setReportDraft((prev) => ({
                        ...prev,
                        photo: event.target.value,
                      }))
                    }
                    placeholder="Photo URL (optional)"
                    className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary"
                  />

                  <div className="flex items-center justify-end gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-[11px]"
                      onClick={closeComposer}
                      disabled={isSubmittingComposer}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="h-7 text-[11px]"
                      onClick={handleSubmitReport}
                      disabled={isSubmittingComposer}
                    >
                      {isSubmittingComposer ? "Submitting..." : "Submit Report"}
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          )}
          
          
        </div>
      </div>

      {/* Feed */}
      <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6" style={{ transform: "scale(0.9)", transformOrigin: "top center" }}>
        {/* Community Feedback View */}
        {contentType === "feedback" && (
          <>
            {/* Results Count */}
            {(searchQuery || filterMunicipality || filterRegion) && (
              <div className="mb-4 text-[11px] text-muted-foreground">
                Showing {filteredFeedback.length} of {communityFeedback.length} posts
              </div>
            )}
            
            {filteredFeedback.length === 0 ? (
              <div className="text-center py-20">
                <Search size={40} className="mx-auto mb-4 text-muted-foreground/30" />
                <p className="text-sm font-medium text-foreground/70 mb-2">No feedback found</p>
                <p className="text-xs text-muted-foreground mb-4">
                  {communityFeedback.length === 0
                    ? "No community feedback has been posted yet."
                    : "Try adjusting your search criteria."}
                </p>
                {(searchQuery || filterMunicipality || filterRegion) && (
                  <Button
                    onClick={() => {
                      setSearchQuery("");
                      setFilterMunicipality("");
                      setFilterRegion("");
                    }}
                    variant="ghost"
                    size="sm"
                    className="text-xs"
                  >
                    Clear Filters
                  </Button>
                )}
              </div>
            ) : (
            <div className="space-y-6">
          {pagedFeedback.map((feedback) => (
            (() => {
              const feedbackCoreMeta = getProjectCoreMeta(feedback.projectId);
              const locationCaption = feedback.location || feedbackCoreMeta.locationLabel;
              const postId = String(feedback.id ?? "").trim();
              const engagement = getPostEngagement(postId, feedback.likes);
              const totalReactions = engagement.totalReactions;
              const totalComments = engagement.commentsCount;
              const selectedReactionOption = REACTION_OPTIONS.find(
                (reaction) => reaction.type === engagement.selectedReaction
              );
              const SelectedReactionIcon = selectedReactionOption?.icon ?? Heart;
              const isBusyPost = Boolean(busyPostById[postId]);
              const showComments = Boolean(expandedCommentsByPostId[postId]);

              return (
            <Card 
              key={feedback.id} 
              className="cursor-pointer overflow-hidden rounded-3xl border border-border/70 bg-card/95 shadow-[0_12px_32px_-22px_rgba(15,23,42,0.65)] transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_34px_-20px_rgba(15,23,42,0.55)]"
              onClick={() => handleNavigateToProject(feedback.projectId)}
            >
              {/* Post Header */}
              <div className="px-4 pb-3 pt-4 sm:px-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-linear-to-br from-primary/20 via-primary/10 to-transparent ring-1 ring-primary/25">
                    <UserCircle className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-foreground">Citizen</span>
                      {feedback.verified && (
                        <div className="flex items-center gap-0.5 rounded-full border border-primary/25 bg-primary/10 px-1.5 py-px">
                          <ShieldCheck className="w-2.5 h-2.5 text-primary" />
                          <span className="text-[9px] font-medium text-primary">Verified</span>
                        </div>
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground/80">
                      {locationCaption} • {new Date(feedback.timestamp).toLocaleString('en-US', { 
                        month: 'short', 
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit'
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Photo */}
              {feedback.photo ? (
                <div className="relative">
                  <img 
                    src={feedback.photo} 
                    alt="Community feedback"
                    className="aspect-4/3 w-full object-cover"
                    onError={(e) => {
                      e.currentTarget.src = "https://images.unsplash.com/photo-1581094794329-c8112a89af12?w=800";
                    }}
                  />
                </div>
              ) : (
                <div className="flex aspect-4/3 items-center justify-center border-y border-border/70 bg-muted/25 text-xs text-muted-foreground">
                  <Camera className="mr-1.5 h-3.5 w-3.5" /> No image attached
                </div>
              )}

              {/* Caption & Actions */}
              <div className="px-4 py-3 sm:px-5">
                {/* Project Tag */}
                <div className="mb-3 mt-1">
                  <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                    <FolderOpen className="w-2.5 h-2.5" />
                    {feedback.projectName}
                  </span>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className="inline-flex items-center rounded-full border border-border/70 bg-muted/80 px-2 py-0.5 text-[10px] text-foreground wrap-break-word">
                      Region: {feedbackCoreMeta.region}
                    </span>
                    <span className="inline-flex items-center rounded-full border border-border/70 bg-muted/80 px-2 py-0.5 text-[10px] text-foreground wrap-break-word">
                      Municipality: {feedbackCoreMeta.municipality || "Unknown Municipality"}
                    </span>
                    <span className="inline-flex items-center rounded-full border border-border/70 bg-muted/80 px-2 py-0.5 text-[10px] text-foreground wrap-break-word">
                      Barangay: {feedbackCoreMeta.barangay || "Unknown Barangay"}
                    </span>
                    <span className="inline-flex items-center rounded-full border border-border/70 bg-muted/80 px-2 py-0.5 text-[10px] text-foreground wrap-break-word">
                      Milestone: {feedbackCoreMeta.milestoneName}
                    </span>
                    <span className="inline-flex items-center rounded-full border border-border/70 bg-muted/80 px-2 py-0.5 text-[10px] text-foreground wrap-break-word">
                      {feedbackCoreMeta.milestoneStatus}
                    </span>
                    <span className="inline-flex items-center rounded-full border border-border/70 bg-muted/80 px-2 py-0.5 text-[10px] text-foreground wrap-break-word">
                      Progress: {feedbackCoreMeta.projectProgress}
                    </span>
                  </div>
                </div>

                {/* Caption — truncated */}
                <p className="text-xs leading-relaxed text-foreground/90 sm:text-[13px]">
                  {feedback.caption}
                </p>

                <div
                  className="mt-5"
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className="relative"
                      data-reaction-root="true"
                      onMouseEnter={clearReactionCloseTimer}
                      onMouseLeave={() => {
                        clearReactionRevealTimer();
                        scheduleReactionPickerClose(postId);
                      }}
                    >
                      <button
                        type="button"
                        onMouseEnter={() => startReactionRevealTimer(postId, false)}
                        onMouseLeave={clearReactionRevealTimer}
                        onMouseDown={() => startReactionRevealTimer(postId, true)}
                        onMouseUp={clearReactionRevealTimer}
                        onTouchStart={() => startReactionRevealTimer(postId, true)}
                        onTouchEnd={clearReactionRevealTimer}
                        onTouchCancel={clearReactionRevealTimer}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (suppressLikeClickPostIdRef.current === postId) {
                            suppressLikeClickPostIdRef.current = null;
                            return;
                          }
                          void handleReaction(postId, "like", feedback.likes, "toggle");
                        }}
                        className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-full px-3 transition-colors ${
                          selectedReactionOption
                            ? `${selectedReactionOption.activeClass} bg-muted/80`
                            : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        }`}
                        title={selectedReactionOption?.label ?? "Like"}
                      >
                        <SelectedReactionIcon className="h-4.5 w-4.5" />
                        <span className="text-[11px] font-semibold">{totalReactions}</span>
                      </button>

                      {openReactionPickerForPostId === postId && (
                        <div className="absolute bottom-11 left-0 z-20 inline-flex rounded-full border border-border bg-background px-1.5 py-1 shadow-lg">
                          {REACTION_OPTIONS.map((reactionOption) => (
                            <button
                              key={reactionOption.type}
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                void handleReaction(postId, reactionOption.type, feedback.likes, "toggle");
                              }}
                              className={`inline-flex h-8 w-8 items-center justify-center rounded-full transition-transform hover:scale-110 ${reactionOption.activeClass}`}
                              title={reactionOption.label}
                            >
                              <reactionOption.icon className="h-4 w-4" />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setExpandedCommentsByPostId((prev) => ({
                          ...prev,
                          [postId]: !prev[postId],
                        }));
                      }}
                      className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full px-3 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      title="Comment"
                    >
                      <MessageCircle className="h-5 w-5" />
                      <span className="text-[11px] font-semibold">{totalComments}</span>
                    </button>
                  </div>
                </div>

                {showComments && (
                  <div
                    className="mt-3 space-y-3"
                    onClick={(event) => event.stopPropagation()}
                  >
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={commentDraftByPostId[postId] ?? ""}
                          onChange={(event) =>
                            setCommentDraftByPostId((prev) => ({
                              ...prev,
                              [postId]: event.target.value,
                            }))
                          }
                          onClick={(event) => event.stopPropagation()}
                          onKeyDown={(event) => {
                            if (isBusyPost) return;
                            if (event.key !== "Enter") return;
                            event.preventDefault();
                            event.stopPropagation();
                            void handleAddComment(postId, feedback.likes);
                          }}
                          placeholder="Write a public comment..."
                          className="h-11 flex-1 rounded-[5px] bg-muted/60 px-3 text-xs text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-1 focus:ring-primary/30"
                        />
                        <button
                          type="button"
                          disabled={isBusyPost}
                          aria-label="Send comment"
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleAddComment(postId, feedback.likes);
                          }}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-muted text-foreground transition-colors hover:bg-muted/80 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isBusyPost ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Send className="h-4 w-4" />
                          )}
                        </button>
                      </div>

                      {engagement.comments.length > 0 ? (
                        <div className="space-y-2">
                          {engagement.comments.map((comment) => renderCommentThread(postId, comment, feedback.likes))}
                        </div>
                      ) : (
                        <p className="text-[11px] text-muted-foreground">No comments yet. Start the discussion.</p>
                      )}
                  </div>
                )}
              </div>
            </Card>
              );
            })()
          ))}
        </div>
        )}

        {filteredFeedback.length > 0 && (
          <PaginationControls
            page={Math.min(feedbackPage, feedbackTotalPages)}
            totalPages={feedbackTotalPages}
            onPageChange={setFeedbackPage}
            className="pt-2"
          />
        )}
        </>
        )}

        {/* Infrastructure Reports View */}
        {contentType === "reports" && (
          <>
            {/* Results Count */}
            {searchQuery && (
              <div className="mb-4 text-[11px] text-muted-foreground">
                Showing {filteredReports.length} of {publicReports.length} reports
              </div>
            )}
            
            {filteredReports.length === 0 ? (
              <div className="text-center py-20">
                <AlertCircle size={40} className="mx-auto mb-4 text-muted-foreground/30" />
                <p className="text-sm font-medium text-foreground/70 mb-2">No reports found</p>
                <p className="text-xs text-muted-foreground mb-4">
                  {publicReports.length === 0
                    ? "No infrastructure reports have been submitted yet."
                    : "Try adjusting your search criteria."}
                </p>
                {searchQuery && (
                  <Button
                    onClick={() => setSearchQuery("")}
                    variant="ghost"
                    size="sm"
                    className="text-xs"
                  >
                    Clear Search
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {pagedReports.map((report) => (
                  (() => {
                    const reportCoreMeta = getProjectCoreMeta(report.projectId);
                    const reportId = String(report.id ?? "").trim();
                    const reportKey = getReportEngagementKey(reportId);
                    const engagement = getPostEngagement(reportKey, 0);
                    const totalReactions = engagement.totalReactions;
                    const totalComments = engagement.commentsCount;
                    const selectedReactionOption = REACTION_OPTIONS.find(
                      (reaction) => reaction.type === engagement.selectedReaction
                    );
                    const SelectedReactionIcon = selectedReactionOption?.icon ?? Heart;
                    const isBusyPost = Boolean(busyPostById[reportKey]);
                    const showComments = Boolean(expandedCommentsByPostId[reportKey]);
                    const showReportStatus = report.status?.toUpperCase() !== "PENDING";

                    return (
                  <Card 
                    key={report.id} 
                    className="cursor-pointer overflow-hidden rounded-3xl border border-border/70 bg-card/95 shadow-[0_12px_32px_-22px_rgba(15,23,42,0.65)] transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_34px_-20px_rgba(15,23,42,0.55)]"
                    onClick={() => handleNavigateToProject(report.projectId)}
                  >
                    {/* Report Image */}
                    {report.photo && (
                      <div className="relative">
                        <img 
                          src={report.photo} 
                          alt="Report photo"
                          className="aspect-4/3 w-full object-cover"
                          onError={(e) => {
                            e.currentTarget.src = "https://images.unsplash.com/photo-1581094794329-c8112a89af12?w=800";
                          }}
                        />
                        <div className="absolute top-2 left-2">
                          <div className="rounded-full border border-red-300/70 bg-red-600/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm backdrop-blur-sm">
                            {report.reportType}
                          </div>
                        </div>
                        {showReportStatus && (
                          <div className="absolute top-2 right-2">
                            <div className="rounded-full border border-white/40 bg-black/55 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white shadow-sm backdrop-blur-sm">
                              {report.status}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    
                    <div className="px-4 py-4 sm:px-5">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1 min-w-0">
                          {!report.photo && (
                            <div className="mb-3 flex flex-wrap items-center gap-2">
                              <div className="inline-block rounded-full border border-red-300/70 bg-red-600/90 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm">
                                {report.reportType}
                              </div>
                              {showReportStatus && (
                                <div className="inline-flex rounded-full border border-border/70 bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                  {report.status}
                                </div>
                              )}
                            </div>
                          )}
                          <div className="mb-2">
                            <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                              <FolderOpen className="w-2.5 h-2.5" />
                              {report.projectName}
                            </span>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              <span className="inline-flex items-center rounded-full border border-border/70 bg-muted/80 px-2 py-0.5 text-[10px] text-foreground wrap-break-word">
                                Region: {reportCoreMeta.region}
                              </span>
                              <span className="inline-flex items-center rounded-full border border-border/70 bg-muted/80 px-2 py-0.5 text-[10px] text-foreground wrap-break-word">
                                Municipality: {reportCoreMeta.municipality || "Unknown Municipality"}
                              </span>
                              <span className="inline-flex items-center rounded-full border border-border/70 bg-muted/80 px-2 py-0.5 text-[10px] text-foreground wrap-break-word">
                                Barangay: {reportCoreMeta.barangay || "Unknown Barangay"}
                              </span>
                              <span className="inline-flex items-center rounded-full border border-border/70 bg-muted/80 px-2 py-0.5 text-[10px] text-foreground wrap-break-word">
                                Milestone: {reportCoreMeta.milestoneName}
                              </span>
                              <span className="inline-flex items-center rounded-full border border-border/70 bg-muted/80 px-2 py-0.5 text-[10px] text-foreground wrap-break-word">
                                {reportCoreMeta.milestoneStatus}
                              </span>
                              <span className="inline-flex items-center rounded-full border border-border/70 bg-muted/80 px-2 py-0.5 text-[10px] text-foreground wrap-break-word">
                                Progress: {reportCoreMeta.projectProgress}
                              </span>
                            </div>
                          </div>
                          <p className="mt-3 text-xs leading-relaxed text-foreground">{report.description}</p>

                          <div
                            className="mt-4"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <div className="flex items-center gap-2.5">
                              <div
                                className="relative"
                                data-reaction-root="true"
                                onMouseEnter={clearReactionCloseTimer}
                                onMouseLeave={() => {
                                  clearReactionRevealTimer();
                                  scheduleReactionPickerClose(reportKey);
                                }}
                              >
                                <button
                                  type="button"
                                  onMouseEnter={() => startReactionRevealTimer(reportKey, false)}
                                  onMouseLeave={clearReactionRevealTimer}
                                  onMouseDown={() => startReactionRevealTimer(reportKey, true)}
                                  onMouseUp={clearReactionRevealTimer}
                                  onTouchStart={() => startReactionRevealTimer(reportKey, true)}
                                  onTouchEnd={clearReactionRevealTimer}
                                  onTouchCancel={clearReactionRevealTimer}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    if (suppressLikeClickPostIdRef.current === reportKey) {
                                      suppressLikeClickPostIdRef.current = null;
                                      return;
                                    }
                                    void handleReportReaction(reportKey, "like", 0, "toggle");
                                  }}
                                  className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-full px-3 transition-colors ${
                                    selectedReactionOption
                                      ? `${selectedReactionOption.activeClass} bg-muted/80`
                                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                                  }`}
                                  title={selectedReactionOption?.label ?? "Like"}
                                >
                                  <SelectedReactionIcon className="h-4.5 w-4.5" />
                                  <span className="text-[11px] font-semibold">{totalReactions}</span>
                                </button>

                                {openReactionPickerForPostId === reportKey && (
                                  <div className="absolute bottom-11 left-0 z-20 inline-flex rounded-full border border-border bg-background px-1.5 py-1 shadow-lg">
                                    {REACTION_OPTIONS.map((reactionOption) => (
                                      <button
                                        key={reactionOption.type}
                                        type="button"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          void handleReportReaction(reportKey, reactionOption.type, 0, "toggle");
                                        }}
                                        className={`inline-flex h-8 w-8 items-center justify-center rounded-full transition-transform hover:scale-110 ${reactionOption.activeClass}`}
                                        title={reactionOption.label}
                                      >
                                        <reactionOption.icon className="h-4 w-4" />
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>

                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setExpandedCommentsByPostId((prev) => ({
                                    ...prev,
                                    [reportKey]: !prev[reportKey],
                                  }));
                                }}
                                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full px-3 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                title="Comment"
                              >
                                <MessageCircle className="h-5 w-5" />
                                <span className="text-[11px] font-semibold">{totalComments}</span>
                              </button>
                            </div>
                          </div>

                          {showComments && (
                            <div
                              className="mt-3 space-y-3"
                              onClick={(event) => event.stopPropagation()}
                            >
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={commentDraftByPostId[reportKey] ?? ""}
                                  onChange={(event) =>
                                    setCommentDraftByPostId((prev) => ({
                                      ...prev,
                                      [reportKey]: event.target.value,
                                    }))
                                  }
                                  onClick={(event) => event.stopPropagation()}
                                  onKeyDown={(event) => {
                                    if (isBusyPost) return;
                                    if (event.key !== "Enter") return;
                                    event.preventDefault();
                                    event.stopPropagation();
                                    void handleAddReportComment(reportKey, 0);
                                  }}
                                  placeholder="Write a public comment..."
                                  className="h-11 flex-1 rounded-[5px] bg-muted/60 px-3 text-xs text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-1 focus:ring-primary/30"
                                />
                                <button
                                  type="button"
                                  disabled={isBusyPost}
                                  aria-label="Send comment"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    void handleAddReportComment(reportKey, 0);
                                  }}
                                  className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-muted text-foreground transition-colors hover:bg-muted/80 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {isBusyPost ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Send className="h-4 w-4" />
                                  )}
                                </button>
                              </div>

                              {engagement.comments.length > 0 ? (
                                <div className="space-y-2">
                                  {engagement.comments.map((comment) =>
                                    renderCommentThread(reportKey, comment, 0, handleAddReportReply)
                                  )}
                                </div>
                              ) : (
                                <p className="text-[11px] text-muted-foreground">No comments yet. Start the discussion.</p>
                              )}
                            </div>
                          )}
                        </div>
                        <Camera className="w-4 h-4 text-muted-foreground ml-2 shrink-0" />
                      </div>
                      
                    </div>
                  </Card>
                    );
                  })()
                ))}
              </div>
            )}

            {filteredReports.length > 0 && (
              <PaginationControls
                page={Math.min(reportsPage, reportsTotalPages)}
                totalPages={reportsTotalPages}
                onPageChange={setReportsPage}
                className="pt-2"
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
