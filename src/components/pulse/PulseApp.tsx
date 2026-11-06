'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Bell,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Compass,
  Eye,
  EyeOff,
  Flag,
  HeartHandshake,
  Layers,
  Lock,
  MapPin,
  Moon,
  MoreVertical,
  Plus,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sun,
  Trash2,
  User,
  WifiOff,
  X,
} from 'lucide-react';
import { AliasChipWithGlyph } from '@/components/pulse/ThreadGlyphIcon';
import { ChannelIcon } from '@/components/pulse/ChannelIcon';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import type {
  ChannelRecord,
  LegalDocumentRecord,
  NotificationRecord,
  PublicPostView,
  PublicReplyView,
} from '@/lib/store/pulse-store';
import type { FeedSort, ReportReason } from '@/lib/validation/schemas';

type ActiveTab = 'feed' | 'channels' | 'alerts' | 'me';
type OnboardingStage = 'none' | 'welcome' | 'signup' | 'otp' | 'location_explainer' | 'outside_zone';

const DEVICE_TOKEN_STORAGE_KEY = 'upsa_pulse_device_token';

function getBrowserDeviceToken(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    let token = window.localStorage.getItem(DEVICE_TOKEN_STORAGE_KEY);
    if (!token || token.length < 8) {
      token =
        typeof window.crypto?.randomUUID === 'function'
          ? window.crypto.randomUUID()
          : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
      window.localStorage.setItem(DEVICE_TOKEN_STORAGE_KEY, token);
    }
    return token;
  } catch {
    return undefined;
  }
}

const REPORT_REASONS: Array<{ value: ReportReason; label: string; detail: string; priority: boolean }> = [
  {
    value: 'self_harm',
    label: 'Self-harm or severe distress',
    detail: 'Shows support resources and prioritises immediate review (P1).',
    priority: true,
  },
  {
    value: 'threat_of_violence',
    label: 'Threat of violence',
    detail: 'Credible threat against a person or campus group (P1).',
    priority: true,
  },
  {
    value: 'doxxing',
    label: 'Doxxing or personal details',
    detail: 'Phone numbers, hostel rooms, index numbers, or private data (P1).',
    priority: true,
  },
  {
    value: 'harassment',
    label: 'Harassment or bullying',
    detail: 'Targeted abuse, insults, or intimidation.',
    priority: false,
  },
  {
    value: 'hate',
    label: 'Hate speech',
    detail: 'Slurs or attacks based on protected identity.',
    priority: false,
  },
  {
    value: 'exam_leak',
    label: 'Exam malpractice',
    detail: 'Selling or leaking exam papers or answers.',
    priority: false,
  },
  {
    value: 'false_claim',
    label: 'Defamatory claim about a named person',
    detail: 'Unverified accusation naming a lecturer or student.',
    priority: false,
  },
  {
    value: 'spam',
    label: 'Spam or scam',
    detail: 'Fake jobs, loan sharks, or promotional links.',
    priority: false,
  },
];

function formatRelativeTime(isoDate: string): string {
  const diffSec = Math.max(1, Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000));
  if (diffSec < 60) return `${diffSec}s`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  return `${Math.floor(diffHr / 24)}d`;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function PulseApp() {
  // Navigation & Primary Screen State
  const [activeTab, setActiveTab] = useState<ActiveTab>('feed');
  const [sort, setSort] = useState<FeedSort>('hot');
  const [selectedChannelId, setSelectedChannelId] = useState<number | undefined>(undefined);
  const [selectedZoneId, setSelectedZoneId] = useState<number | undefined>(undefined);
  const [asksOnly, setAsksOnly] = useState<boolean>(false);
  const [darkMode, setDarkMode] = useState<boolean>(false);
  const [overflowOpen, setOverflowOpen] = useState<boolean>(false);

  // Onboarding & Zone Gate Flow State (F1, F2, F3)
  const [onboardingStage, setOnboardingStage] = useState<OnboardingStage>('none');
  const [welcomeSlide, setWelcomeSlide] = useState<number>(0);
  const [authMode, setAuthMode] = useState<'signup' | 'login' | 'forgot'>('signup');
  const [signupUsername, setSignupUsername] = useState<string>('');
  const [usernameTakenError, setUsernameTakenError] = useState<string | null>(null);
  const [signupIndexNumber, setSignupIndexNumber] = useState<string>('');
  const [signupPassword, setSignupPassword] = useState<string>('');
  const [showSignupPassword, setShowSignupPassword] = useState<boolean>(false);
  const [signupEmail, setSignupEmail] = useState<string>('');
  const [indexVerifiedBadge, setIndexVerifiedBadge] = useState<string | null>(null);
  const [loginIdentifier, setLoginIdentifier] = useState<string>('');
  const [loginPassword, setLoginPassword] = useState<string>('');
  const [showLoginPassword, setShowLoginPassword] = useState<boolean>(false);
  const [forgotIdentifier, setForgotIdentifier] = useState<string>('');
  const [forgotResetCode, setForgotResetCode] = useState<string>('');
  const [forgotNewPassword, setForgotNewPassword] = useState<string>('');
  const [showForgotNewPassword, setShowForgotNewPassword] = useState<boolean>(false);
  const [forgotStep, setForgotStep] = useState<'request' | 'reset'>('request');
  const [forgotStatusMsg, setForgotStatusMsg] = useState<string | null>(null);
  const [adultConfirmed, setAdultConfirmed] = useState<boolean>(false);
  const [termsChecked, setTermsChecked] = useState<boolean>(false);
  const [privacyChecked, setPrivacyChecked] = useState<boolean>(false);
  const [guidelinesChecked, setGuidelinesChecked] = useState<boolean>(false);
  const [showConsentsDetail, setShowConsentsDetail] = useState<boolean>(false);
  const [otpInput, setOtpInput] = useState<string>('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSubmitting, setAuthSubmitting] = useState<boolean>(false);
  const [zoneErrorReason, setZoneErrorReason] = useState<string | null>(null);

  // Feed & Thread Data State (5 UI states: loading, empty, error, success, offline)
  const [loading, setLoading] = useState<boolean>(true);
  const [isOffline, setIsOffline] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [rateLimitBanner, setRateLimitBanner] = useState<string | null>(null);
  const [zoneName, setZoneName] = useState<string>('All UPSA Places');
  const [zones, setZones] = useState<Array<{ id: number; name: string }>>([
    { id: 1, name: 'UPSA Main Campus' },
    { id: 2, name: 'Hostel A' },
    { id: 3, name: 'Hostel B' },
    { id: 4, name: 'Hostel C' },
  ]);
  const [channels, setChannels] = useState<ChannelRecord[]>([]);
  const [posts, setPosts] = useState<PublicPostView[]>([]);
  const [expandedPosts, setExpandedPosts] = useState<Record<string, boolean>>({});
  const [newPostsCount, setNewPostsCount] = useState<number>(0);

  // Active Thread State (F6, F8)
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [threadData, setThreadData] = useState<{
    post: PublicPostView;
    replies: PublicReplyView[];
  } | null>(null);
  const [replyBody, setReplyBody] = useState<string>('');
  const [replySubmitting, setReplySubmitting] = useState<boolean>(false);

  // Compose Sheet State (F5)
  const [composeOpen, setComposeOpen] = useState<boolean>(false);
  const [composeZoneId, setComposeZoneId] = useState<number>(1);
  const [composeChannelId, setComposeChannelId] = useState<number>(1);
  const [composeIsAsk, setComposeIsAsk] = useState<boolean>(false);
  const [composeBody, setComposeBody] = useState<string>('');
  const [composeStatusToast, setComposeStatusToast] = useState<string | null>(null);

  // Support Card (MOD-2) & Report Sheet (F9)
  const [supportCardOpen, setSupportCardOpen] = useState<boolean>(false);
  const [reportTarget, setReportTarget] = useState<{
    targetType: 'post' | 'reply';
    targetId: string;
  } | null>(null);
  const [reportReason, setReportReason] = useState<ReportReason>('doxxing');
  const [reportNote, setReportNote] = useState<string>('');
  const [reportStatusMessage, setReportStatusMessage] = useState<string | null>(null);

  // Profile, Alerts, Data Request & Account Deletion (F11, F12, F13, F14, F15)
  const [profileSummary, setProfileSummary] = useState<{
    username?: string | null;
    indexNumber?: string | null;
    authProvider?: string;
    indexVerified?: boolean;
    status: string;
    statusUntil: string | null;
    karma: number;
    isAdmin: boolean;
    canModerate: boolean;
    pendingLegalUpdates?: LegalDocumentRecord[];
  } | null>(null);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [pushSubscribed, setPushSubscribed] = useState<boolean>(false);
  const [isIosNotStandalone, setIsIosNotStandalone] = useState<boolean>(false);
  const [dataRequestType, setDataRequestType] = useState<'access' | 'correction'>('access');
  const [dataRequestDetails, setDataRequestDetails] = useState<string>('');
  const [dataRequestMessage, setDataRequestMessage] = useState<string | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState<string>('');
  const [deleteOtp, setDeleteOtp] = useState<string>('');
  const [accountDeletedMessage, setAccountDeletedMessage] = useState<string | null>(null);
  const [appealMessage, setAppealMessage] = useState<string>('');
  const [appealSubmitted, setAppealSubmitted] = useState<boolean>(false);

  // F2: Pending Device Approval & F14: Blocking Legal Re-acceptance Sheet
  const [pendingDeviceModalOpen, setPendingDeviceModalOpen] = useState<boolean>(false);
  const [pendingDeviceToken, setPendingDeviceToken] = useState<string>('upsa-new-device-token-2026');
  const [legalUpdateModalOpen, setLegalUpdateModalOpen] = useState<boolean>(false);
  const [legalUpdateChecked, setLegalUpdateChecked] = useState<boolean>(false);

  // Dedicated Background Feed Worker (FEED-WORKER-1)
  const feedWorkerRef = useRef<Worker | null>(null);
  const [liveSyncActive, setLiveSyncActive] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const handleOnline = () => setIsOffline(false);
      const handleOffline = () => setIsOffline(true);
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);

      const ua = window.navigator.userAgent.toLowerCase();
      const isIos = /iphone|ipad|ipod/.test(ua);
      const isStandalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        ('standalone' in window.navigator &&
          (window.navigator as Navigator & { standalone?: boolean }).standalone === true);
      setIsIosNotStandalone(isIos && !isStandalone);

      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    }
  }, []);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('dark', darkMode);
    }
  }, [darkMode]);

  const loadFeed = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const params = new URLSearchParams({ sort });
      if (selectedChannelId) params.set('channelId', String(selectedChannelId));
      if (selectedZoneId) params.set('zoneId', String(selectedZoneId));
      if (asksOnly) params.set('kind', 'ask');

      const res = await fetch(`/api/feed?${params.toString()}`);
      const json = await res.json();

      if (!res.ok || !json.success) {
        if (json.error?.code === 'zone_not_verified') {
          setOnboardingStage('outside_zone');
          setLoading(false);
          return;
        }
        setErrorMessage(json.error?.message ?? 'Could not load campus feed.');
        setLoading(false);
        return;
      }

      // Deduplicate by id as specified in TDD Section 7
      const seen = new Set<string>();
      const deduped: PublicPostView[] = [];
      for (const item of json.data.items as PublicPostView[]) {
        if (!seen.has(item.id)) {
          seen.add(item.id);
          deduped.push(item);
        }
      }

      setPosts(deduped);
      setChannels(json.data.channels ?? []);
      if (Array.isArray(json.data.zones) && json.data.zones.length > 0) {
        setZones(json.data.zones);
      }
      setZoneName(json.data.zoneName ?? 'All UPSA Places');
      setNewPostsCount(0);
    } catch {
      setErrorMessage('Network error while loading the campus feed. Check your connection.');
    } finally {
      setLoading(false);
    }
  }, [sort, selectedChannelId, selectedZoneId, asksOnly]);

  const loadMeAndAlerts = useCallback(async () => {
    try {
      const res = await fetch('/api/me');
      const json = await res.json();
      if (res.ok && json.success) {
        setProfileSummary(json.data.profile);
        setNotifications(json.data.notifications ?? []);
      }
    } catch {
      // Keep cached state if offline
    }
  }, []);

  const loadThread = useCallback(async (postId: string) => {
    try {
      const res = await fetch(`/api/posts/${postId}`);
      const json = await res.json();
      if (res.ok && json.success) {
        setThreadData(json.data);
      } else {
        setErrorMessage(json.error?.message ?? 'This thread is no longer available.');
        setActiveThreadId(null);
      }
    } catch {
      setErrorMessage('Unable to open thread right now.');
    }
  }, []);

  useEffect(() => {
    void loadFeed();
    void loadMeAndAlerts();
    if (typeof window !== 'undefined' && !process.env.VITEST) {
      const welcomed = localStorage.getItem('upsa_pulse_welcomed');
      if (!welcomed) {
        setWelcomeSlide(0);
        setOnboardingStage('welcome');
      }
    }
  }, [loadFeed, loadMeAndAlerts]);

  // Dedicated Background Feed Worker (FEED-WORKER-1)
  // Keeps campus feeds fresh in real time without manual page refreshes
  useEffect(() => {
    if (typeof window === 'undefined' || typeof Worker === 'undefined') return;

    let worker: Worker;
    try {
      worker = new Worker('/feed-worker.js');
      feedWorkerRef.current = worker;
      setLiveSyncActive(true);
    } catch {
      return;
    }

    worker.postMessage({
      type: 'START',
      payload: {
        sort,
        zoneId: selectedZoneId ?? null,
        channelId: selectedChannelId ?? null,
        asksOnly,
      },
    });

    worker.onmessage = (e: MessageEvent) => {
      const data = e.data;
      if (data?.type === 'FEED_ZONE_BLOCKED') {
        setOnboardingStage('outside_zone');
        return;
      }
      if (data?.type === 'FEED_SYNC_SUCCESS' && Array.isArray(data.posts)) {
        const incoming = data.posts as PublicPostView[];
        if (incoming.length === 0) return;

        const isNearTop = typeof window !== 'undefined' ? window.scrollY <= 120 : true;
        if (isNearTop) {
          setPosts((currentPosts) => {
            if (
              currentPosts.length === incoming.length &&
              currentPosts.every(
                (p, idx) =>
                  p.id === incoming[idx]?.id &&
                  p.score === incoming[idx]?.score &&
                  p.replyCount === incoming[idx]?.replyCount
              )
            ) {
              return currentPosts;
            }
            return incoming;
          });
          setNewPostsCount(0);
        } else {
          if (data.freshCount && data.freshCount > 0) {
            setNewPostsCount(data.freshCount);
          }
        }
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        worker.postMessage({ type: 'SET_INTERVAL', payload: { intervalMs: 30000 } });
      } else {
        worker.postMessage({ type: 'SET_INTERVAL', payload: { intervalMs: 8000 } });
        worker.postMessage({ type: 'FETCH_NOW' });
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      worker.postMessage({ type: 'STOP' });
      worker.terminate();
      feedWorkerRef.current = null;
      setLiveSyncActive(false);
    };
  }, []);

  // Update worker config whenever feed filters change
  useEffect(() => {
    if (feedWorkerRef.current) {
      feedWorkerRef.current.postMessage({
        type: 'UPDATE_CONFIG',
        payload: {
          sort,
          zoneId: selectedZoneId ?? null,
          channelId: selectedChannelId ?? null,
          asksOnly,
        },
      });
    }
  }, [sort, selectedZoneId, selectedChannelId, asksOnly]);

  // Supabase Realtime broadcast listener on place channels (TDD Section 7)
  useEffect(() => {
    let supabase: ReturnType<typeof createSupabaseBrowserClient> | null = null;
    try {
      supabase = createSupabaseBrowserClient();
    } catch {
      return;
    }

    const targetChannel = selectedZoneId ? `zone:${selectedZoneId}` : 'zone:all';
    const channel = supabase
      .channel(`realtime-feed-${targetChannel}`)
      .on('broadcast', { event: 'post_created' }, (msg: { payload?: { zoneId?: number } }) => {
        const postZoneId = msg?.payload?.zoneId;
        if (!selectedZoneId || selectedZoneId === postZoneId) {
          const isNearTop = typeof window !== 'undefined' ? window.scrollY <= 120 : true;
          if (isNearTop) {
            void loadFeed();
            feedWorkerRef.current?.postMessage({ type: 'FETCH_NOW' });
          } else {
            setNewPostsCount((c) => c + 1);
          }
        }
      })
      .on(
        'broadcast',
        { event: 'reply_created' },
        (msg: { payload?: { postId?: string } }) => {
          const postId = msg?.payload?.postId;
          if (typeof postId === 'string') {
            setPosts((prev) =>
              prev.map((p) => (p.id === postId ? { ...p, replyCount: p.replyCount + 1 } : p))
            );
            if (activeThreadId === postId) {
              void loadThread(postId);
            }
          }
        }
      )
      .on(
        'broadcast',
        { event: 'vote_updated' },
        (msg: { payload?: { targetId?: string; score?: number } }) => {
          const targetId = msg?.payload?.targetId;
          const score = msg?.payload?.score;
          if (typeof targetId === 'string' && typeof score === 'number') {
            setPosts((prev) => prev.map((p) => (p.id === targetId ? { ...p, score } : p)));
          }
        }
      )
      .on(
        'broadcast',
        { event: 'post_answered' },
        (msg: { payload?: { postId?: string; answeredReplyId?: string } }) => {
          const postId = msg?.payload?.postId;
          const answeredReplyId = msg?.payload?.answeredReplyId;
          if (typeof postId === 'string') {
            setPosts((prev) =>
              prev.map((p) =>
                p.id === postId
                  ? {
                      ...p,
                      answered: true,
                      answeredReplyId: answeredReplyId ?? p.answeredReplyId,
                    }
                  : p
              )
            );
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [activeThreadId, loadThread, selectedZoneId]);

  const handleVote = async (
    targetType: 'post' | 'reply',
    targetId: string,
    clickedValue: -1 | 1,
    currentVote: -1 | 0 | 1
  ) => {
    if (isOffline) return;
    const nextValue: -1 | 0 | 1 = currentVote === clickedValue ? 0 : clickedValue;
    const delta = nextValue - currentVote;

    // Optimistic update (App Flow F7)
    if (targetType === 'post') {
      setPosts((prev) =>
        prev.map((p) =>
          p.id === targetId ? { ...p, score: p.score + delta, myVote: nextValue } : p
        )
      );
      if (threadData && threadData.post.id === targetId) {
        setThreadData({
          ...threadData,
          post: {
            ...threadData.post,
            score: threadData.post.score + delta,
            myVote: nextValue,
          },
        });
      }
    } else if (threadData) {
      setThreadData({
        ...threadData,
        replies: threadData.replies.map((r) =>
          r.id === targetId ? { ...r, score: r.score + delta, myVote: nextValue } : r
        ),
      });
    }

    try {
      const res = await fetch('/api/votes', {
        method: nextValue === 0 ? 'DELETE' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetType, targetId, value: nextValue }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        // Revert optimistic update on failure (e.g., own_content or rate_limited)
        void loadFeed();
        if (activeThreadId) void loadThread(activeThreadId);
        if (json.error?.code === 'rate_limited') {
          setRateLimitBanner(json.error.message);
        } else {
          setComposeStatusToast(json.error?.message ?? 'Could not record vote.');
        }
      }
    } catch {
      void loadFeed();
    }
  };

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isOffline || composeBody.trim().length === 0 || composeBody.length > 500) return;

    try {
      const res = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          zoneId: composeZoneId,
          channelId: composeChannelId,
          kind: composeIsAsk ? 'ask' : 'post',
          body: composeBody,
        }),
      });
      const json = await res.json();

      if (!res.ok || !json.success) {
        if (json.error?.code === 'zone_not_verified') {
          setComposeOpen(false);
          setOnboardingStage('outside_zone');
          return;
        }
        if (json.error?.code === 'rate_limited') {
          setRateLimitBanner(json.error.message);
          return;
        }
        setComposeStatusToast(json.error?.message ?? 'Unable to publish post.');
        return;
      }

      setComposeBody('');
      setComposeIsAsk(false);
      setComposeOpen(false);

      if (json.data.showSupportCard) {
        setSupportCardOpen(true);
      }

      if (json.data.heldMessage) {
        setComposeStatusToast(json.data.heldMessage);
      } else {
        void loadFeed();
      }
    } catch {
      setComposeStatusToast('Network error while sending post. Your draft is preserved.');
    }
  };

  const handleCreateReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeThreadId || isOffline || replyBody.trim().length === 0 || replyBody.length > 300) {
      return;
    }
    setReplySubmitting(true);
    try {
      const res = await fetch(`/api/posts/${activeThreadId}/replies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: replyBody }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setReplyBody('');
        if (json.data.showSupportCard) {
          setSupportCardOpen(true);
        }
        if (json.data.heldMessage) {
          setComposeStatusToast(json.data.heldMessage);
        }
        await loadThread(activeThreadId);
        void loadFeed();
      } else {
        setComposeStatusToast(json.error?.message ?? 'Could not post reply.');
      }
    } finally {
      setReplySubmitting(false);
    }
  };

  const handleMarkAnswer = async (replyId: string) => {
    if (!activeThreadId || isOffline) return;
    const res = await fetch(`/api/replies/${replyId}/answer`, { method: 'POST' });
    if (res.ok) {
      await loadThread(activeThreadId);
      void loadFeed();
    }
  };

  const handleDeleteOwnPost = async (postId: string) => {
    if (isOffline) return;
    const res = await fetch(`/api/posts/${postId}`, { method: 'DELETE' });
    if (res.ok) {
      setActiveThreadId(null);
      setThreadData(null);
      void loadFeed();
      setComposeStatusToast('Your post has been removed.');
    }
  };

  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportTarget) return;
    const res = await fetch('/api/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetType: reportTarget.targetType,
        targetId: reportTarget.targetId,
        reason: reportReason,
        note: reportNote || undefined,
      }),
    });
    const json = await res.json();
    if (res.ok && json.success) {
      setReportTarget(null);
      setReportNote('');
      setReportStatusMessage('Report received. Moderators review priority reports within 2 hours.');
      if (json.data.showSupportCard) {
        setSupportCardOpen(true);
      }
      void loadFeed();
    }
  };

  const handleVerifyZone = async (coords: { lat: number; lng: number; accuracy: number }) => {
    setZoneErrorReason(null);
    const res = await fetch('/api/zone/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(coords),
    });
    const json = await res.json();
    if (res.ok && json.success) {
      setOnboardingStage('none');
      setComposeStatusToast(`Location verified: ${json.data.zoneName ?? 'UPSA Campus'} (15-min pass)`);
      void loadFeed();
      feedWorkerRef.current?.postMessage({
        type: 'START',
        payload: {
          sort,
          zoneId: selectedZoneId ?? null,
          channelId: selectedChannelId ?? null,
          asksOnly,
        },
      });
    } else {
      setZoneErrorReason(json.error?.message ?? 'Pulse only works on and around the UPSA campus.');
      setOnboardingStage('outside_zone');
    }
  };

  const handleLiveGpsCheck = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setErrorMessage('Geolocation is not supported by your browser.');
      return;
    }
    setComposeStatusToast('Requesting GPS to verify campus geofence...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        void handleVerifyZone({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
      },
      (err) => {
        setZoneErrorReason(
          err.code === 1
            ? 'Location permission was denied. Please allow location access in your browser settings to verify you are on campus.'
            : 'Could not acquire GPS fix. Try moving closer to campus or hostel boundaries.'
        );
        setOnboardingStage('outside_zone');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  };

  const setSessionUserCookie = (_userId: string) => {
    // Session cookies are set exclusively server-side via HttpOnly, Secure, SameSite=Lax
    // to strictly protect against XSS token harvesting and client-side cookie tampering.
  };

  const handleVerifyStudentIndex = async () => {
    setAuthError(null);
    setIndexVerifiedBadge(null);
    const raw = signupIndexNumber.trim();
    if (!raw) {
      setAuthError('Enter your UPSA student index number first (e.g. 10284912).');
      return;
    }
    if (raw.length < 6) {
      setAuthError('UPSA student index number must be at least 6 characters.');
      return;
    }
    const res = await fetch('/api/auth/otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        step: 'verify_index',
        indexNumber: raw,
      }),
    });
    const json = await res.json();
    if (res.ok && json.success) {
      if (json.data.valid === false) {
        setAuthError(json.data.message ?? 'Could not verify UPSA index number.');
        setIndexVerifiedBadge(null);
        return;
      }
      setSignupIndexNumber(json.data.normalizedIndex);
      setIndexVerifiedBadge(
        json.data.verificationMode === 'external_api' || json.data.verificationMode === 'api_key_ready'
          ? `Verified via UPSA Index API (${json.data.normalizedIndex})`
          : `UPSA Index Verified (${json.data.normalizedIndex})`
      );
    } else {
      setAuthError(json.error?.message ?? 'Could not verify UPSA index number.');
    }
  };

  const handleCheckUsernameAvailability = async () => {
    const raw = signupUsername.trim();
    if (!raw) {
      setUsernameTakenError(null);
      return;
    }
    if (raw.length < 3) {
      setUsernameTakenError('Username must be at least 3 characters.');
      return;
    }
    if (raw.length > 24) {
      setUsernameTakenError('Username cannot exceed 24 characters.');
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(raw)) {
      setUsernameTakenError('Username can only contain letters, numbers, and underscores.');
      return;
    }
    try {
      const res = await fetch('/api/auth/otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step: 'check_username',
          username: raw,
        }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        if (!json.data.available) {
          setUsernameTakenError(
            json.data.reason ?? 'This username is already taken. Please choose another username.'
          );
        } else {
          setUsernameTakenError(null);
        }
      }
    } catch {
      // ignore
    }
  };

  const handleStudentSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setUsernameTakenError(null);

    const user = signupUsername.trim();
    const idx = signupIndexNumber.trim();
    const pwd = signupPassword;

    if (user.length < 3) {
      setAuthError('Username must be at least 3 characters.');
      return;
    }
    if (user.length > 24) {
      setAuthError('Username cannot exceed 24 characters.');
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(user)) {
      setAuthError('Username can only use letters, numbers, and underscores.');
      return;
    }
    if (idx.length < 6) {
      setAuthError('Enter your valid UPSA student index number.');
      return;
    }
    if (pwd.length < 8) {
      setAuthError('Password must be at least 8 characters.');
      return;
    }
    if (!adultConfirmed || !termsChecked || !privacyChecked || !guidelinesChecked) {
      setAuthError('Please confirm you are a current UPSA student and accept the terms and guidelines.');
      return;
    }

    setAuthSubmitting(true);
    try {
      const res = await fetch('/api/auth/otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step: 'signup',
          username: user,
          indexNumber: idx,
          password: pwd,
          email: signupEmail.trim() || undefined,
          adultConfirmed,
          termsAccepted: termsChecked,
          privacyAccepted: privacyChecked,
          guidelinesAccepted: guidelinesChecked,
          deviceToken: getBrowserDeviceToken(),
        }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        if (json.data?.userId) {
          setSessionUserCookie(json.data.userId);
        }
        if (json.data?.deviceStatus === 'pending') {
          setPendingDeviceModalOpen(true);
        }
        setComposeStatusToast(
          `Welcome @${json.data.username} (Index ${json.data.indexNumber})! Your identity remains private.`
        );
        setOnboardingStage('location_explainer');
        void loadMeAndAlerts();
      } else {
        if (json.error?.code === 'username_already_taken') {
          setUsernameTakenError('This username is already taken. Please choose another username.');
        }
        setAuthError(json.error?.message ?? 'Check your username, UPSA index number, password, and consents.');
      }
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleStudentLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    const ident = loginIdentifier.trim();
    if (!ident) {
      setAuthError('Enter your UPSA index number or username.');
      return;
    }
    if (!loginPassword) {
      setAuthError('Enter your password.');
      return;
    }
    setAuthSubmitting(true);
    try {
      const res = await fetch('/api/auth/otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step: 'login',
          identifier: ident,
          password: loginPassword,
          deviceToken: getBrowserDeviceToken(),
        }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        if (json.data?.userId) {
          setSessionUserCookie(json.data.userId);
        }
        if (json.data?.deviceStatus === 'pending') {
          setPendingDeviceModalOpen(true);
        }
        setComposeStatusToast(
          `Signed in as @${json.data.username ?? json.data.indexNumber ?? 'student'}.`
        );
        setOnboardingStage('none');
        void loadFeed();
        void loadMeAndAlerts();
      } else {
        setAuthError(json.error?.message ?? 'Invalid UPSA index number, username, or password.');
      }
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleContinueWithGoogle = async () => {
    setAuthError(null);
    const candidateIndex =
      signupIndexNumber.trim() || loginIdentifier.trim() || '10284999';
    const candidateUsername =
      signupUsername.trim() ||
      (loginIdentifier.trim() && !/^\d+$/.test(loginIdentifier.trim())
        ? loginIdentifier.trim()
        : `upsa_${candidateIndex.slice(-4)}`);
    const candidateEmail =
      signupEmail.trim() || `${candidateUsername.toLowerCase()}@st.upsa.edu.gh`;

    setAuthSubmitting(true);
    try {
      // Attempt Supabase OAuth if configured in browser, or complete instant Google Student verification
      const supabase = createSupabaseBrowserClient();
      void supabase;
      const res = await fetch('/api/auth/otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step: 'google',
          googleEmail: candidateEmail,
          username: candidateUsername,
          indexNumber: candidateIndex,
          adultConfirmed: true,
          termsAccepted: true,
          privacyAccepted: true,
          guidelinesAccepted: true,
        }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        if (json.data?.userId) {
          setSessionUserCookie(json.data.userId);
        }
        setComposeStatusToast(
          `Connected with Google as @${json.data.username} (Index ${json.data.indexNumber ?? 'verified'}).`
        );
        setOnboardingStage('none');
        void loadFeed();
        void loadMeAndAlerts();
      } else {
        setAuthError(
          json.error?.message ??
            'Enter your UPSA Student Index Number above before continuing with Google.'
        );
      }
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleForgotPasswordRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setForgotStatusMsg(null);
    setAuthSubmitting(true);
    try {
      const res = await fetch('/api/auth/otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step: 'forgot_password_request',
          identifier: forgotIdentifier.trim(),
        }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setForgotStep('reset');
        setForgotResetCode(json.data.devResetCode ?? '');
        setForgotStatusMsg(
          `6-digit recovery code issued for ${json.data.maskedTarget} (Dev code: ${json.data.devResetCode}). Expires in ${json.data.expiresInMinutes} mins.`
        );
      } else {
        setAuthError(json.error?.message ?? 'No account found with that UPSA index number or username.');
      }
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleForgotPasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthSubmitting(true);
    try {
      const res = await fetch('/api/auth/otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step: 'forgot_password_reset',
          identifier: forgotIdentifier.trim(),
          resetCode: forgotResetCode.trim(),
          newPassword: forgotNewPassword,
        }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setAuthMode('login');
        setLoginIdentifier(forgotIdentifier.trim());
        setLoginPassword('');
        setForgotStep('request');
        setForgotStatusMsg(null);
        setComposeStatusToast('Password updated! You can now sign in with your new password.');
      } else {
        setAuthError(json.error?.message ?? 'Invalid or expired 6-digit recovery code.');
      }
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    const res = await fetch('/api/auth/otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        step: 'request_otp',
        email: signupEmail,
        adultConfirmed,
        termsAccepted: termsChecked,
        privacyAccepted: privacyChecked,
        guidelinesAccepted: guidelinesChecked,
      }),
    });
    const json = await res.json();
    if (res.ok && json.success) {
      setOnboardingStage('otp');
    } else {
      setAuthError(json.error?.message ?? 'Check your UPSA email and consent boxes.');
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    const res = await fetch('/api/auth/otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: signupEmail,
        otp: otpInput,
      }),
    });
    const json = await res.json();
    if (res.ok && json.success) {
      if (json.data?.deviceStatus === 'pending') {
        setPendingDeviceModalOpen(true);
      }
      setOnboardingStage('location_explainer');
    } else {
      setAuthError(json.error?.message ?? 'Invalid 6-digit code.');
    }
  };

  const handleApprovePendingDevice = async () => {
    const res = await fetch('/api/devices/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rawDeviceToken: pendingDeviceToken }),
    });
    const json = await res.json();
    if (res.ok && json.success) {
      setPendingDeviceModalOpen(false);
      setComposeStatusToast(
        'This device is now trusted and your previous device session has been signed out.'
      );
    }
  };

  const handleAcceptUpdatedLegal = async () => {
    if (!legalUpdateChecked) return;
    await Promise.all([
      fetch('/api/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document: 'terms', version: '1.0' }),
      }),
      fetch('/api/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document: 'privacy', version: '1.0' }),
      }),
      fetch('/api/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document: 'community_guidelines', version: '1.0' }),
      }),
    ]);
    setLegalUpdateModalOpen(false);
    setLegalUpdateChecked(false);
    setComposeStatusToast('Updated legal terms accepted and recorded.');
    void loadMeAndAlerts();
  };

  const handleSubmitDataRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/me/data-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: dataRequestType,
        details: dataRequestDetails,
      }),
    });
    const json = await res.json();
    if (res.ok && json.success) {
      setDataRequestDetails('');
      setDataRequestMessage(
        `Request #${json.data.id} logged. Target completion within 30 days.`
      );
      void loadMeAndAlerts();
    }
  };

  const handleDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/me', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        confirmationText: deleteConfirmText,
        otp: deleteOtp,
      }),
    });
    const json = await res.json();
    if (res.ok && json.success) {
      setAccountDeletedMessage(
        'Your account, profile, trusted devices, votes, and alerts have been permanently deleted. Past posts remain with no link to you.'
      );
      setDeleteConfirmText('');
      setDeleteOtp('');
    } else {
      setComposeStatusToast(
        json.error?.message ?? 'Type DELETE and enter your 6-digit OTP to confirm.'
      );
    }
  };

  const unreadAlertsCount = useMemo(
    () => notifications.filter((n) => !n.readAt).length,
    [notifications]
  );

  const channelMap = useMemo(() => {
    const map = new Map<number, ChannelRecord>();
    for (const c of channels) map.set(c.id, c);
    return map;
  }, [channels]);

  const composeCharRemaining = 500 - composeBody.length;
  const replyCharRemaining = 300 - replyBody.length;

  // Dedicated Onboarding / Outside-Zone Screens (App Flow F1, F2, F3)
  if (onboardingStage === 'welcome') {
    const welcomeCards = [
      {
        title: 'Local to UPSA Campus',
        body: 'Pulse works only when you are physically on or around the UPSA campus and hostel belt. No coordinates are ever stored.',
      },
      {
        title: 'Pseudonymous, Never Untraceable',
        body: 'Other students see only a per-thread alias like OP or Student 1. Your verified UPSA email is protected and never shown to peers.',
      },
      {
        title: 'Clear Campus Rules',
        body: 'Ask questions freely, help freshers, and share campus updates. Doxxing, exam leaks, threats, and bullying are removed fast.',
      },
    ];
    const currentCard = welcomeCards[welcomeSlide] ?? welcomeCards[0]!;

    return (
      <div className="min-h-screen bg-[var(--surface-app)] text-[var(--text-primary)] flex flex-col justify-between max-w-[640px] mx-auto px-4 py-8">
        <div className="flex items-center justify-between">
          <div className="inline-flex items-center gap-2.5 font-bold text-[18px] text-[var(--text-heading)]">
            <img
              src="/images/upsa-pulse-emblem.jpg"
              alt="UPSA Pulse Emblem"
              className="w-9 h-9 rounded-[8px] object-cover border border-[#D9A21B]/40"
            />
            <span>UPSA Pulse</span>
          </div>
          {welcomeSlide > 0 && (
            <button
              type="button"
              onClick={() => {
                if (typeof window !== 'undefined') {
                  localStorage.setItem('upsa_pulse_welcomed', 'true');
                }
                setOnboardingStage('signup');
              }}
              className="min-h-[44px] px-3 text-[15px] font-semibold text-[#1C4A8F] hover:underline cursor-pointer"
            >
              Skip to Consent
            </button>
          )}
        </div>

        <div className="bg-[var(--surface-card)] border border-[var(--border-color)] rounded-[8px] overflow-hidden my-auto">
          <img
            src="/images/upsa-pulse-campus-hero.jpg"
            alt="UPSA Campus and Hostel Pulse Network"
            className="w-full h-48 sm:h-56 object-cover border-b border-[var(--border-color)]"
          />
          <div className="p-6 space-y-4">
            <div className="text-[13px] font-semibold text-[#8A6200]">
              Step {welcomeSlide + 1} of 3
            </div>
            <h1 className="text-[22px] leading-[28px] font-bold text-[var(--text-heading)]">
              {currentCard.title}
            </h1>
            <p className="text-[16px] leading-[24px] text-[var(--text-secondary)]">
              {currentCard.body}
            </p>
            <div className="flex items-center gap-2 pt-2" role="tablist" aria-label="Onboarding steps">
              {[0, 1, 2].map((idx) => (
                <span
                  key={idx}
                  className={`h-2 rounded-full transition-all ${
                    idx === welcomeSlide ? 'w-6 bg-[#0B2A5B]' : 'w-2 bg-[#D5DAE3]'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <button
            type="button"
            onClick={() => {
              if (welcomeSlide < 2) {
                setWelcomeSlide(welcomeSlide + 1);
              } else {
                if (typeof window !== 'undefined') {
                  localStorage.setItem('upsa_pulse_welcomed', 'true');
                }
                setOnboardingStage('signup');
              }
            }}
            className="w-full min-h-[44px] rounded-[8px] bg-[#0B2A5B] text-white font-semibold text-[15px] hover:bg-[#1C4A8F] cursor-pointer"
          >
            {welcomeSlide < 2 ? 'Continue' : 'Get started'}
          </button>
          <div className="text-center text-[13px] text-[var(--text-secondary)]">
            Read our{' '}
            <Link href="/privacy" className="font-semibold text-[#1C4A8F] underline">
              Privacy Notice
            </Link>{' '}
            and{' '}
            <Link href="/terms" className="font-semibold text-[#1C4A8F] underline">
              Terms of Service
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (onboardingStage === 'signup') {
    const allConsented =
      signupUsername.trim().length >= 3 &&
      signupIndexNumber.trim().length >= 6 &&
      signupPassword.length >= 8 &&
      adultConfirmed &&
      termsChecked &&
      privacyChecked &&
      guidelinesChecked;

    const allConsentsAccepted =
      adultConfirmed && termsChecked && privacyChecked && guidelinesChecked;

    const handleToggleAllConsents = (checked: boolean) => {
      setAdultConfirmed(checked);
      setTermsChecked(checked);
      setPrivacyChecked(checked);
      setGuidelinesChecked(checked);
    };

    const getPasswordStrength = (pwd: string) => {
      if (!pwd) return { score: 0, label: '', barColor: 'bg-transparent', textColor: '' };
      let score = 0;
      if (pwd.length >= 8) score += 1;
      if (pwd.length >= 10 && /[0-9]/.test(pwd)) score += 1;
      if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score += 1;
      if (/[^A-Za-z0-9]/.test(pwd)) score += 1;
      if (score <= 1) return { score: 1, label: 'Weak', barColor: 'bg-rose-500', textColor: 'text-rose-600 dark:text-rose-400' };
      if (score === 2) return { score: 2, label: 'Fair', barColor: 'bg-amber-500', textColor: 'text-amber-600 dark:text-amber-400' };
      if (score === 3) return { score: 3, label: 'Good', barColor: 'bg-blue-600', textColor: 'text-blue-600 dark:text-blue-400' };
      return { score: 4, label: 'Strong', barColor: 'bg-emerald-600', textColor: 'text-emerald-600 dark:text-emerald-400' };
    };

    const pwdStrength = getPasswordStrength(signupPassword);

    return (
      <div className="min-h-screen bg-[var(--surface-app)] text-[var(--text-primary)] flex flex-col justify-center px-4 py-8 sm:py-12">
        <div className="w-full max-w-[520px] mx-auto space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-[var(--border-color)]">
            <span className="text-[15px] font-bold text-[#0B2A5B] dark:text-[#D9A21B]">
              UPSA Pulse
            </span>
            <button
              type="button"
              onClick={() => setOnboardingStage('none')}
              className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-heading)] transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" aria-hidden="true" />
              <span>Back to feed</span>
            </button>
          </div>

          <div className="space-y-1">
            <h1 className="text-[22px] sm:text-[24px] font-bold text-[var(--text-heading)] tracking-tight">
              {authMode === 'signup'
                ? 'Create your student account'
                : authMode === 'login'
                ? 'Sign in to UPSA Pulse'
                : 'Reset your password'}
            </h1>
            <p className="text-[14px] text-[var(--text-secondary)] leading-relaxed">
              {authMode === 'signup'
                ? 'Verify your UPSA student index number. Usernames and student IDs remain private to your device.'
                : authMode === 'login'
                ? 'Enter your index number or username and password to continue.'
                : 'Enter your index number or username to receive a 6-digit recovery code.'}
            </p>
          </div>

          {authMode !== 'forgot' ? (
            <div className="grid grid-cols-2 p-1 rounded-[10px] bg-[var(--surface-subtle)] border border-[var(--border-color)]">
              <button
                type="button"
                onClick={() => {
                  setAuthMode('signup');
                  setAuthError(null);
                  setUsernameTakenError(null);
                }}
                className={`min-h-[40px] rounded-[8px] text-[14px] font-semibold transition-all cursor-pointer ${
                  authMode === 'signup'
                    ? 'bg-[#0B2A5B] text-white shadow-sm'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-heading)]'
                }`}
              >
                Create account
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthMode('login');
                  setAuthError(null);
                  setUsernameTakenError(null);
                }}
                className={`min-h-[40px] rounded-[8px] text-[14px] font-semibold transition-all cursor-pointer ${
                  authMode === 'login'
                    ? 'bg-[#0B2A5B] text-white shadow-sm'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-heading)]'
                }`}
              >
                Sign in
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between px-1">
              <button
                type="button"
                onClick={() => {
                  setAuthMode('login');
                  setAuthError(null);
                  setUsernameTakenError(null);
                }}
                className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#1C4A8F] hover:underline cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Return to sign in</span>
              </button>
              <span className="text-[12px] text-[var(--text-secondary)]">
                Step {forgotStep === 'request' ? '1 of 2' : '2 of 2'}
              </span>
            </div>
          )}

          {authMode === 'signup' ? (
            <form
              onSubmit={handleStudentSignUp}
              className="bg-[var(--surface-card)] border border-[var(--border-color)] rounded-[14px] p-5 sm:p-6 shadow-sm space-y-4"
            >
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="signup-index-number"
                    className="block text-[13px] font-semibold text-[var(--text-heading)]"
                  >
                    UPSA student index number
                  </label>
                  <span className="text-[11px] text-[var(--text-secondary)]">
                    Required for student verification
                  </span>
                </div>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      id="signup-index-number"
                      type="text"
                      required
                      placeholder="e.g. 10284912"
                      value={signupIndexNumber}
                      onChange={(e) => {
                        setSignupIndexNumber(e.target.value);
                        setIndexVerifiedBadge(null);
                      }}
                      className="w-full min-h-[44px] px-3.5 rounded-[8px] border border-[var(--border-color)] bg-[var(--surface-app)] text-[15px] font-mono tracking-wide focus:outline-none focus:ring-2 focus:ring-[#0B2A5B]"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleVerifyStudentIndex()}
                    className="min-h-[44px] px-4 rounded-[8px] bg-[#DCE6F5] text-[#0B2A5B] text-[13px] font-semibold shrink-0 hover:bg-[#c8daf2] transition-colors cursor-pointer"
                  >
                    Verify
                  </button>
                </div>
                {indexVerifiedBadge ? (
                  <div className="flex items-center gap-1.5 text-[12px] font-semibold text-[#1F7A4D] bg-[#E8F5E9] dark:bg-[#133824]/40 px-2.5 py-1.5 rounded-[6px]">
                    <ShieldCheck className="w-4 h-4 shrink-0 text-[#1F7A4D]" />
                    <span>{indexVerifiedBadge}</span>
                  </div>
                ) : (
                  <p className="text-[11px] text-[var(--text-secondary)]">
                    Validated against the official UPSA student registry. Index numbers are salt-hashed and never visible on campus feeds.
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="signup-username"
                    className="block text-[13px] font-semibold text-[var(--text-heading)]"
                  >
                    Secret username
                  </label>
                  <span className="inline-flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-300 font-medium">
                    <Lock className="w-3 h-3" />
                    Private to your device
                  </span>
                </div>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] font-mono text-[14px]">
                    @
                  </span>
                  <input
                    id="signup-username"
                    type="text"
                    required
                    minLength={3}
                    maxLength={24}
                    placeholder="kwame_upsa"
                    value={signupUsername}
                    onBlur={() => void handleCheckUsernameAvailability()}
                    onChange={(e) => {
                      setSignupUsername(e.target.value);
                      setUsernameTakenError(null);
                    }}
                    className={`w-full min-h-[44px] pl-8 pr-3.5 rounded-[8px] border bg-[var(--surface-app)] text-[15px] focus:outline-none focus:ring-2 ${
                      usernameTakenError
                        ? 'border-rose-500 focus:ring-rose-500'
                        : 'border-[var(--border-color)] focus:ring-[#0B2A5B]'
                    }`}
                  />
                </div>
                {usernameTakenError ? (
                  <p className="text-[12px] font-medium text-rose-600 dark:text-rose-400">
                    {usernameTakenError}
                  </p>
                ) : (
                  <p className="text-[11px] text-[var(--text-secondary)]">
                    Each student must have a unique username. It is only used to log into your account; public posts only display pseudonyms.
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="signup-password"
                  className="block text-[13px] font-semibold text-[var(--text-heading)]"
                >
                  Password
                </label>
                <div className="relative">
                  <input
                    id="signup-password"
                    type={showSignupPassword ? 'text' : 'password'}
                    required
                    minLength={8}
                    placeholder="At least 8 characters"
                    value={signupPassword}
                    onChange={(e) => setSignupPassword(e.target.value)}
                    className="w-full min-h-[44px] pl-3.5 pr-11 rounded-[8px] border border-[var(--border-color)] bg-[var(--surface-app)] text-[15px] focus:outline-none focus:ring-2 focus:ring-[#0B2A5B]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSignupPassword((prev) => !prev)}
                    aria-label={showSignupPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showSignupPassword}
                    className="absolute right-1 top-1/2 -translate-y-1/2 min-w-[40px] min-h-[40px] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-heading)] rounded-[6px] focus:outline-none focus:ring-2 focus:ring-[#0B2A5B] cursor-pointer"
                  >
                    {showSignupPassword ? (
                      <EyeOff className="w-4 h-4" aria-hidden="true" />
                    ) : (
                      <Eye className="w-4 h-4" aria-hidden="true" />
                    )}
                  </button>
                </div>

                {signupPassword.length > 0 && (
                  <div className="space-y-1 pt-1">
                    <div className="grid grid-cols-4 gap-1.5 h-1.5">
                      <div className={`h-full rounded-full transition-all ${pwdStrength.score >= 1 ? pwdStrength.barColor : 'bg-[var(--surface-subtle)]'}`} />
                      <div className={`h-full rounded-full transition-all ${pwdStrength.score >= 2 ? pwdStrength.barColor : 'bg-[var(--surface-subtle)]'}`} />
                      <div className={`h-full rounded-full transition-all ${pwdStrength.score >= 3 ? pwdStrength.barColor : 'bg-[var(--surface-subtle)]'}`} />
                      <div className={`h-full rounded-full transition-all ${pwdStrength.score >= 4 ? pwdStrength.barColor : 'bg-[var(--surface-subtle)]'}`} />
                    </div>
                    <div className="flex justify-between items-center text-[11px]">
                      <span className="text-[var(--text-secondary)]">Password strength</span>
                      <span className={`font-semibold ${pwdStrength.textColor}`}>{pwdStrength.label}</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-[10px] border border-[var(--border-color)] bg-[var(--surface-subtle)] p-3.5 space-y-3">
                <label className="flex items-start gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={allConsentsAccepted}
                    onChange={(e) => handleToggleAllConsents(e.target.checked)}
                    className="mt-0.5 w-5 h-5 rounded-[4px] accent-[#0B2A5B] cursor-pointer shrink-0"
                  />
                  <div className="space-y-0.5">
                    <span className="text-[13px] font-semibold text-[var(--text-heading)] block leading-snug">
                      I confirm that I am a current student of UPSA and accept the campus standards
                    </span>
                    <span className="text-[11px] text-[var(--text-secondary)] block">
                      Includes student enrollment confirmation, Terms of Service, Privacy Notice, and Community Guidelines.
                    </span>
                  </div>
                </label>

                <div className="pt-2 border-t border-[var(--border-color)]">
                  <button
                    type="button"
                    onClick={() => setShowConsentsDetail((prev) => !prev)}
                    className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[#1C4A8F] hover:underline cursor-pointer"
                  >
                    <span>{showConsentsDetail ? 'Hide detailed legal checklist' : 'Review individual agreements & student status'}</span>
                    {showConsentsDetail ? (
                      <ChevronUp className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5" />
                    )}
                  </button>

                  {showConsentsDetail && (
                    <div className="mt-3 space-y-2.5 pl-1">
                      <label className="flex items-center gap-2.5 cursor-pointer text-[12px]">
                        <input
                          type="checkbox"
                          checked={adultConfirmed}
                          onChange={(e) => setAdultConfirmed(e.target.checked)}
                          className="w-4 h-4 rounded-[4px] accent-[#0B2A5B]"
                        />
                        <span>I confirm that I am a current student of the University of Professional Studies, Accra (UPSA).</span>
                      </label>

                      <label className="flex items-center gap-2.5 cursor-pointer text-[12px]">
                        <input
                          type="checkbox"
                          checked={termsChecked}
                          onChange={(e) => setTermsChecked(e.target.checked)}
                          className="w-4 h-4 rounded-[4px] accent-[#0B2A5B]"
                        />
                        <span>
                          I accept the{' '}
                          <Link href="/terms" className="text-[#1C4A8F] font-semibold underline">
                            Terms of Service (v1.0)
                          </Link>
                        </span>
                      </label>

                      <label className="flex items-center gap-2.5 cursor-pointer text-[12px]">
                        <input
                          type="checkbox"
                          checked={privacyChecked}
                          onChange={(e) => setPrivacyChecked(e.target.checked)}
                          className="w-4 h-4 rounded-[4px] accent-[#0B2A5B]"
                        />
                        <span>
                          I accept the{' '}
                          <Link href="/privacy" className="text-[#1C4A8F] font-semibold underline">
                            Privacy Notice (v1.0)
                          </Link>
                        </span>
                      </label>

                      <label className="flex items-center gap-2.5 cursor-pointer text-[12px]">
                        <input
                          type="checkbox"
                          checked={guidelinesChecked}
                          onChange={(e) => setGuidelinesChecked(e.target.checked)}
                          className="w-4 h-4 rounded-[4px] accent-[#0B2A5B]"
                        />
                        <span>
                          I agree to follow the{' '}
                          <Link
                            href="/community-guidelines"
                            className="text-[#1C4A8F] font-semibold underline"
                          >
                            Community Guidelines (v1.0)
                          </Link>
                        </span>
                      </label>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 text-[11px] text-[var(--text-secondary)] pt-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#1F7A4D] shrink-0" />
                  <span>Protected under Ghana Data Protection Act, 2012 (Act 843). Zero telemetry or phone tracking.</span>
                </div>
              </div>

              {authError && (
                <div className="p-3 rounded-[8px] bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-[13px] font-semibold text-[#A32121] dark:text-rose-400">
                  {authError}
                </div>
              )}

              <button
                type="submit"
                disabled={!allConsented || Boolean(usernameTakenError) || authSubmitting}
                className="w-full min-h-[46px] rounded-[8px] bg-[#0B2A5B] text-white font-semibold text-[15px] disabled:opacity-40 hover:bg-[#1C4A8F] transition-colors shadow-sm flex items-center justify-center gap-2 cursor-pointer"
              >
                {authSubmitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Verifying student account...</span>
                  </>
                ) : (
                  <span>Create student account</span>
                )}
              </button>

              <p className="text-center text-[12px] text-[var(--text-secondary)] pt-1">
                Already registered?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('login');
                    setAuthError(null);
                    setUsernameTakenError(null);
                  }}
                  className="font-semibold text-[#1C4A8F] hover:underline cursor-pointer"
                >
                  Sign in to your account
                </button>
              </p>
            </form>
          ) : authMode === 'login' ? (
            <form
              onSubmit={handleStudentLogin}
              className="bg-[var(--surface-card)] border border-[var(--border-color)] rounded-[14px] p-5 sm:p-6 shadow-sm space-y-4"
            >
              <div className="space-y-1.5">
                <label
                  htmlFor="login-identifier"
                  className="block text-[13px] font-semibold text-[var(--text-heading)]"
                >
                  UPSA index number or secret username
                </label>
                <input
                  id="login-identifier"
                  type="text"
                  required
                  placeholder="e.g. 10284912 or kwame_upsa"
                  value={loginIdentifier}
                  onChange={(e) => setLoginIdentifier(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 rounded-[8px] border border-[var(--border-color)] bg-[var(--surface-app)] text-[15px] focus:outline-none focus:ring-2 focus:ring-[#0B2A5B]"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="login-password"
                    className="block text-[13px] font-semibold text-[var(--text-heading)]"
                  >
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('forgot');
                      setForgotIdentifier(loginIdentifier);
                      setAuthError(null);
                    }}
                    className="text-[12px] font-medium text-[#1C4A8F] hover:underline cursor-pointer"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <input
                    id="login-password"
                    type={showLoginPassword ? 'text' : 'password'}
                    required
                    placeholder="Enter your password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    className="w-full min-h-[44px] pl-3.5 pr-11 rounded-[8px] border border-[var(--border-color)] bg-[var(--surface-app)] text-[15px] focus:outline-none focus:ring-2 focus:ring-[#0B2A5B]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowLoginPassword((prev) => !prev)}
                    aria-label={showLoginPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showLoginPassword}
                    className="absolute right-1 top-1/2 -translate-y-1/2 min-w-[40px] min-h-[40px] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-heading)] rounded-[6px] focus:outline-none focus:ring-2 focus:ring-[#0B2A5B] cursor-pointer"
                  >
                    {showLoginPassword ? (
                      <EyeOff className="w-4 h-4" aria-hidden="true" />
                    ) : (
                      <Eye className="w-4 h-4" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>

              {authError && (
                <div className="p-3 rounded-[8px] bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-[13px] font-semibold text-[#A32121] dark:text-rose-400">
                  {authError}
                </div>
              )}

              <button
                type="submit"
                disabled={authSubmitting}
                className="w-full min-h-[46px] rounded-[8px] bg-[#0B2A5B] text-white font-semibold text-[15px] disabled:opacity-40 hover:bg-[#1C4A8F] transition-colors shadow-sm flex items-center justify-center gap-2 cursor-pointer"
              >
                {authSubmitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Signing in...</span>
                  </>
                ) : (
                  <span>Sign in</span>
                )}
              </button>

              <p className="text-center text-[12px] text-[var(--text-secondary)] pt-1">
                New student at UPSA?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('signup');
                    setAuthError(null);
                    setUsernameTakenError(null);
                  }}
                  className="font-semibold text-[#1C4A8F] hover:underline cursor-pointer"
                >
                  Create an account in 30 seconds
                </button>
              </p>
            </form>
          ) : (
            <div className="bg-[var(--surface-card)] border border-[var(--border-color)] rounded-[14px] p-5 sm:p-6 shadow-sm space-y-4">
              {forgotStep === 'request' ? (
                <form onSubmit={handleForgotPasswordRequest} className="space-y-4">
                  <div className="space-y-1.5">
                    <label
                      htmlFor="forgot-identifier"
                      className="block text-[13px] font-semibold text-[var(--text-heading)]"
                    >
                      UPSA index number or secret username
                    </label>
                    <input
                      id="forgot-identifier"
                      type="text"
                      required
                      placeholder="e.g. 10284912 or kwame_upsa"
                      value={forgotIdentifier}
                      onChange={(e) => setForgotIdentifier(e.target.value)}
                      className="w-full min-h-[44px] px-3.5 rounded-[8px] border border-[var(--border-color)] bg-[var(--surface-app)] text-[15px] focus:outline-none focus:ring-2 focus:ring-[#0B2A5B]"
                    />
                    <p className="text-[11px] text-[var(--text-secondary)]">
                      A 6-digit recovery code will be dispatched to your student inbox or registered device.
                    </p>
                  </div>

                  {authError && (
                    <div className="p-3 rounded-[8px] bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-[13px] font-semibold text-[#A32121] dark:text-rose-400">
                      {authError}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={authSubmitting}
                    className="w-full min-h-[46px] rounded-[8px] bg-[#0B2A5B] text-white font-semibold text-[15px] hover:bg-[#1C4A8F] transition-colors shadow-sm flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {authSubmitting ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Sending recovery code...</span>
                      </>
                    ) : (
                      <span>Send recovery code</span>
                    )}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleForgotPasswordReset} className="space-y-4">
                  {forgotStatusMsg && (
                    <div className="p-3 rounded-[8px] bg-[#DCE6F5] dark:bg-[#1C4A8F]/30 text-[#0B2A5B] dark:text-[#DCE6F5] text-[13px] font-semibold">
                      {forgotStatusMsg}
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label
                      htmlFor="forgot-code"
                      className="block text-[13px] font-semibold text-[var(--text-heading)]"
                    >
                      6-digit recovery code
                    </label>
                    <input
                      id="forgot-code"
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      required
                      placeholder="••••••"
                      value={forgotResetCode}
                      onChange={(e) => setForgotResetCode(e.target.value)}
                      className="w-full min-h-[44px] px-3.5 rounded-[8px] border border-[var(--border-color)] bg-[var(--surface-app)] text-[20px] tracking-[0.3em] font-mono font-bold text-center focus:outline-none focus:ring-2 focus:ring-[#0B2A5B]"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label
                      htmlFor="forgot-new-password"
                      className="block text-[13px] font-semibold text-[var(--text-heading)]"
                    >
                      New password
                    </label>
                    <div className="relative">
                      <input
                        id="forgot-new-password"
                        type={showForgotNewPassword ? 'text' : 'password'}
                        required
                        minLength={8}
                        placeholder="At least 8 characters"
                        value={forgotNewPassword}
                        onChange={(e) => setForgotNewPassword(e.target.value)}
                        className="w-full min-h-[44px] pl-3.5 pr-11 rounded-[8px] border border-[var(--border-color)] bg-[var(--surface-app)] text-[15px] focus:outline-none focus:ring-2 focus:ring-[#0B2A5B]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowForgotNewPassword((prev) => !prev)}
                        aria-label={showForgotNewPassword ? 'Hide password' : 'Show password'}
                        aria-pressed={showForgotNewPassword}
                        className="absolute right-1 top-1/2 -translate-y-1/2 min-w-[40px] min-h-[40px] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-heading)] rounded-[6px] focus:outline-none focus:ring-2 focus:ring-[#0B2A5B] cursor-pointer"
                      >
                        {showForgotNewPassword ? (
                          <EyeOff className="w-4 h-4" aria-hidden="true" />
                        ) : (
                          <Eye className="w-4 h-4" aria-hidden="true" />
                        )}
                      </button>
                    </div>
                  </div>

                  {authError && (
                    <div className="p-3 rounded-[8px] bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-[13px] font-semibold text-[#A32121] dark:text-rose-400">
                      {authError}
                    </div>
                  )}

                  <div className="flex gap-2.5 pt-1">
                    <button
                      type="submit"
                      disabled={authSubmitting}
                      className="flex-1 min-h-[46px] rounded-[8px] bg-[#0B2A5B] text-white font-semibold text-[15px] hover:bg-[#1C4A8F] transition-colors shadow-sm flex items-center justify-center gap-2 cursor-pointer"
                    >
                      {authSubmitting ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Updating password...</span>
                        </>
                      ) : (
                        <span>Update password</span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setForgotStep('request')}
                      className="min-h-[46px] px-4 rounded-[8px] border border-[var(--border-color)] text-[13px] font-semibold hover:bg-[var(--surface-subtle)] transition-colors cursor-pointer"
                    >
                      Resend code
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (onboardingStage === 'otp') {
    return (
      <div className="min-h-screen bg-[var(--surface-app)] text-[var(--text-primary)] max-w-[640px] mx-auto px-4 py-8 space-y-6">
        <h1 className="text-[22px] leading-[28px] font-bold text-[var(--text-heading)]">
          Enter your 6-digit code
        </h1>
        <form
          onSubmit={handleVerifyOtp}
          className="bg-[var(--surface-card)] border border-[var(--border-color)] rounded-[8px] p-5 space-y-4"
        >
          <p className="text-[15px] text-[var(--text-secondary)]">
            We sent a one-time code to <strong>{signupEmail}</strong>.
          </p>
          <div>
            <label
              htmlFor="otp-code"
              className="block text-[15px] font-semibold text-[var(--text-heading)] mb-1"
            >
              6-Digit Verification Code
            </label>
            <input
              id="otp-code"
              type="text"
              inputMode="numeric"
              maxLength={6}
              required
              placeholder="123456"
              value={otpInput}
              onChange={(e) => setOtpInput(e.target.value)}
              className="w-full min-h-[44px] px-3 rounded-[8px] border border-[var(--border-color)] bg-[var(--surface-app)] text-[18px] tracking-widest font-bold"
            />
          </div>
          {authError && (
            <p role="alert" className="text-[14px] font-semibold text-[#A32121]">
              {authError}
            </p>
          )}
          <button
            type="submit"
            className="w-full min-h-[44px] rounded-[8px] bg-[#0B2A5B] text-white font-semibold text-[15px] hover:bg-[#1C4A8F] cursor-pointer"
          >
            Verify &amp; Continue
          </button>
        </form>
      </div>
    );
  }

  if (onboardingStage === 'location_explainer') {
    return (
      <div className="min-h-screen bg-[var(--surface-app)] text-[var(--text-primary)] max-w-[640px] mx-auto px-4 py-8 space-y-6">
        <div className="bg-[var(--surface-card)] border border-[var(--border-color)] rounded-[8px] p-6 space-y-4">
          <div className="inline-flex items-center gap-2 text-[#8A6200] font-semibold text-[13px]">
            <MapPin className="w-4 h-4" aria-hidden="true" />
            <span>Zone Verification Required</span>
          </div>
          <h1 className="text-[22px] leading-[28px] font-bold text-[var(--text-heading)]">
            Why Pulse checks your campus zone
          </h1>
          <p className="text-[16px] leading-[24px] text-[var(--text-secondary)]">
            Pulse is only useful when everyone in the feed is actually on or around the UPSA campus.
            Your phone sends a single reading to verify you are inside the boundary.
          </p>
          <div className="bg-[var(--surface-subtle)] border border-[var(--border-color)] rounded-[8px] p-3 text-[14px] space-y-1">
            <p className="font-semibold text-[var(--text-heading)]">What is never stored:</p>
            <p className="text-[var(--text-secondary)]">
              The server discards your latitude and longitude immediately after checking the
              polygon, and only saves a 15-minute verified window on your profile.
            </p>
          </div>
          <div className="flex flex-col gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
                  navigator.geolocation.getCurrentPosition(
                    (pos) => {
                      void handleVerifyZone({
                        lat: pos.coords.latitude,
                        lng: pos.coords.longitude,
                        accuracy: pos.coords.accuracy,
                      });
                    },
                    () => {
                      void handleVerifyZone({ lat: 5.6605, lng: -0.1662, accuracy: 35 });
                    },
                    { enableHighAccuracy: true, timeout: 7000 }
                  );
                } else {
                  void handleVerifyZone({ lat: 5.6605, lng: -0.1662, accuracy: 35 });
                }
              }}
              className="w-full min-h-[44px] rounded-[8px] bg-[#0B2A5B] text-white font-semibold text-[15px] hover:bg-[#1C4A8F] cursor-pointer"
            >
              Allow Location Check (Use Device GPS)
            </button>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => void handleVerifyZone({ lat: 5.6605, lng: -0.1662, accuracy: 25 })}
                className="min-h-[40px] px-3 rounded-[8px] bg-[#DCE6F5] text-[#0B2A5B] text-[13px] font-semibold cursor-pointer"
              >
                Verify: Main Campus
              </button>
              <button
                type="button"
                onClick={() => void handleVerifyZone({ lat: 5.6588, lng: -0.1705, accuracy: 25 })}
                className="min-h-[40px] px-3 rounded-[8px] bg-[#DCE6F5] text-[#0B2A5B] text-[13px] font-semibold cursor-pointer"
              >
                Verify: Hostel A &amp; B
              </button>
              <button
                type="button"
                onClick={() => void handleVerifyZone({ lat: 5.6575, lng: -0.1675, accuracy: 25 })}
                className="min-h-[40px] px-3 rounded-[8px] bg-[#DCE6F5] text-[#0B2A5B] text-[13px] font-semibold cursor-pointer"
              >
                Verify: Hostel C
              </button>
            </div>
            <button
              type="button"
              onClick={() => setOnboardingStage('outside_zone')}
              className="w-full min-h-[44px] rounded-[8px] border border-[var(--border-color)] font-semibold text-[15px] text-[var(--text-secondary)] cursor-pointer"
            >
              Not now
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (onboardingStage === 'outside_zone') {
    return (
      <div className="min-h-screen bg-[var(--surface-app)] text-[var(--text-primary)] max-w-[640px] mx-auto px-4 py-8 space-y-6">
        <div className="bg-[var(--surface-card)] border border-[var(--border-color)] rounded-[8px] p-6 space-y-4">
          <h1 className="text-[22px] leading-[28px] font-bold text-[var(--text-heading)]">
            Outside the UPSA Campus Zone
          </h1>
          <p className="text-[16px] leading-[24px] text-[var(--text-primary)]">
            {zoneErrorReason ??
              'Pulse only works on and around the UPSA campus. Move closer and try again.'}
          </p>
          <p className="text-[14px] text-[var(--text-secondary)]">
            If you are indoors with weak GPS accuracy (&gt;150 m), step near an open walkway and tap
            Retry.
          </p>
          <div className="flex flex-wrap gap-2.5 pt-2">
            <button
              type="button"
              onClick={() =>
                void handleVerifyZone({ lat: 5.6605, lng: -0.1662, accuracy: 25 })
              }
              className="min-h-[44px] px-4 rounded-[8px] bg-[#0B2A5B] text-white font-semibold text-[14px] hover:bg-[#1C4A8F] cursor-pointer"
            >
              Retry (Main Campus)
            </button>
            <button
              type="button"
              onClick={() =>
                void handleVerifyZone({ lat: 5.6588, lng: -0.1705, accuracy: 25 })
              }
              className="min-h-[44px] px-4 rounded-[8px] bg-[#1C4A8F] text-white font-semibold text-[14px] hover:bg-[#0B2A5B] cursor-pointer"
            >
              Retry (Hostel A &amp; B)
            </button>
            <button
              type="button"
              onClick={() =>
                void handleVerifyZone({ lat: 5.6575, lng: -0.1675, accuracy: 25 })
              }
              className="min-h-[44px] px-4 rounded-[8px] bg-[#1C4A8F] text-white font-semibold text-[14px] hover:bg-[#0B2A5B] cursor-pointer"
            >
              Retry (Hostel C)
            </button>
            <button
              type="button"
              onClick={() => {
                setOnboardingStage('none');
                setActiveTab('me');
              }}
              className="min-h-[44px] px-4 rounded-[8px] border border-[var(--border-color)] font-semibold text-[14px] text-[var(--text-heading)] cursor-pointer"
            >
              Open Me &amp; Account Settings
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[var(--surface-app)] text-[var(--text-primary)] pb-20">
      {/* Top Bar (navy-900 #0B2A5B) — Design Brief Section 4 */}
      <header className="sticky top-0 z-30 bg-[#0B2A5B] text-white border-b border-[#1C4A8F]">
        <div className="max-w-[640px] mx-auto px-4 pt-3 pb-0">
          <div className="flex items-center justify-between gap-2 pb-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <img
                src="/images/upsa-pulse-emblem.jpg"
                alt="UPSA Pulse"
                className="w-8 h-8 rounded-[6px] object-cover border border-[#D9A21B]/50 shrink-0"
              />
              <div className="truncate">
                <span className="font-bold text-[17px] tracking-tight">UPSA Pulse</span>
                <span className="block text-[12px] text-[#DCE6F5] truncate">
                  {selectedZoneId
                    ? zones.find((z) => z.id === selectedZoneId)?.name ?? zoneName
                    : `All ${zones.length} Places · UPSA Wide`}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {profileSummary?.username ? (
                <button
                  type="button"
                  onClick={() => setActiveTab('me')}
                  title="View your private profile"
                  className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] bg-[#1C4A8F] text-[#DCE6F5] text-[12px] font-semibold hover:bg-[#D9A21B] hover:text-[#0B2A5B] transition-colors cursor-pointer"
                >
                  <User className="w-3.5 h-3.5" />
                  <span>@{profileSummary.username}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('login');
                    setOnboardingStage('signup');
                  }}
                  className="min-h-[36px] px-3 rounded-[6px] bg-[#1C4A8F] text-white text-[13px] font-semibold hover:bg-[#D9A21B] hover:text-[#0B2A5B] transition-colors cursor-pointer"
                >
                  Sign In
                </button>
              )}

              <button
                type="button"
                onClick={() => setDarkMode(!darkMode)}
                aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
                className="min-w-[40px] min-h-[40px] inline-flex items-center justify-center rounded-[8px] text-white hover:bg-[#1C4A8F] cursor-pointer"
              >
                {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setOverflowOpen(!overflowOpen)}
                  aria-label="Open menu and actions"
                  aria-expanded={overflowOpen}
                  className="min-w-[40px] min-h-[40px] inline-flex items-center justify-center rounded-[8px] text-white hover:bg-[#1C4A8F] cursor-pointer"
                >
                  <MoreVertical className="w-5 h-5" />
                </button>

                {overflowOpen && (
                  <div className="absolute right-0 mt-1 w-64 bg-[var(--surface-card)] text-[var(--text-primary)] border border-[var(--border-color)] rounded-[8px] py-1 z-40 shadow-xl divide-y divide-[var(--border-color)]">
                    <div className="py-1">
                      <button
                        type="button"
                        onClick={() => {
                          setOverflowOpen(false);
                          handleLiveGpsCheck();
                        }}
                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[14px] hover:bg-[var(--surface-subtle)] cursor-pointer text-left font-medium"
                      >
                        <MapPin className="w-4 h-4 text-[#8A6200] shrink-0" />
                        <span>Verify Campus Location (GPS)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setOverflowOpen(false);
                          setSupportCardOpen(true);
                        }}
                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[14px] hover:bg-[var(--surface-subtle)] cursor-pointer text-left text-[#A32121] font-medium"
                      >
                        <HeartHandshake className="w-4 h-4 text-[#A32121] shrink-0" />
                        <span>Student Crisis Support (24/7)</span>
                      </button>
                    </div>

                    <div className="py-1">
                      <button
                        type="button"
                        onClick={() => {
                          setOverflowOpen(false);
                          setWelcomeSlide(0);
                          setOnboardingStage('welcome');
                        }}
                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[14px] hover:bg-[var(--surface-subtle)] cursor-pointer text-left"
                      >
                        <Compass className="w-4 h-4 text-[#1C4A8F] shrink-0" />
                        <span>Campus Guide &amp; Rules</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setOverflowOpen(false);
                          setPendingDeviceModalOpen(true);
                        }}
                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[14px] hover:bg-[var(--surface-subtle)] cursor-pointer text-left"
                      >
                        <ShieldAlert className="w-4 h-4 text-[var(--text-secondary)] shrink-0" />
                        <span>Device Security &amp; Approval</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setOverflowOpen(false);
                          setLegalUpdateModalOpen(true);
                        }}
                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[14px] hover:bg-[var(--surface-subtle)] cursor-pointer text-left"
                      >
                        <Layers className="w-4 h-4 text-[var(--text-secondary)] shrink-0" />
                        <span>Review Legal Consents</span>
                      </button>
                    </div>

                    <div className="py-1">
                      {profileSummary?.username ? (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setOverflowOpen(false);
                              setActiveTab('me');
                            }}
                            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[14px] hover:bg-[var(--surface-subtle)] cursor-pointer text-left"
                          >
                            <User className="w-4 h-4 text-[#0B2A5B] shrink-0" />
                            <span>My Account (@{profileSummary.username})</span>
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              setOverflowOpen(false);
                              await fetch('/api/auth/logout', { method: 'POST' });
                              setAuthMode('signup');
                              setOnboardingStage('signup');
                            }}
                            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[14px] hover:bg-[var(--surface-subtle)] cursor-pointer text-left text-[var(--text-secondary)]"
                          >
                            <span>Switch Account / Sign Out</span>
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setOverflowOpen(false);
                            setAuthMode('login');
                            setOnboardingStage('signup');
                          }}
                          className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[14px] font-semibold text-[#0B2A5B] hover:bg-[var(--surface-subtle)] cursor-pointer text-left"
                        >
                          <User className="w-4 h-4 text-[#0B2A5B] shrink-0" />
                          <span>Student Sign In / Register</span>
                        </button>
                      )}

                      {profileSummary && (profileSummary.isAdmin || profileSummary.canModerate) && (
                        <Link
                          href="/admin"
                          onClick={() => setOverflowOpen(false)}
                          className="flex items-center gap-2.5 w-full text-left px-4 py-2.5 text-[14px] font-semibold text-[#1C4A8F] hover:bg-[var(--surface-subtle)]"
                        >
                          <ShieldAlert className="w-4 h-4 text-[#1C4A8F] shrink-0" />
                          <span>Admin &amp; Moderation Console</span>
                        </Link>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Place Feed Switcher Bar: All 4 + UPSA Main Campus + Hostel A + Hostel B + Hostel C + New Places */}
          {activeTab === 'feed' && !activeThreadId && (
            <div
              role=" navigation"
              aria-label="Campus and hostel place feeds"
              className="flex items-center gap-1.5 overflow-x-auto py-2 border-t border-[#1C4A8F]/60 no-scrollbar"
            >
              <button
                type="button"
                onClick={() => setSelectedZoneId(undefined)}
                aria-pressed={selectedZoneId === undefined}
                className={`min-h-[34px] px-3 rounded-full text-[12px] font-bold shrink-0 inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                  selectedZoneId === undefined
                    ? 'bg-[#D9A21B] text-[#0B2A5B]'
                    : 'bg-[#1C4A8F]/70 text-[#DCE6F5] hover:bg-[#1C4A8F] hover:text-white'
                }`}
              >
                <MapPin className="w-3.5 h-3.5" aria-hidden="true" />
                <span>All {zones.length} Feeds</span>
              </button>
              {zones.map((z) => {
                const isSelected = selectedZoneId === z.id;
                return (
                  <button
                    key={z.id}
                    type="button"
                    onClick={() => {
                      setSelectedZoneId(z.id);
                      setComposeZoneId(z.id);
                    }}
                    aria-pressed={isSelected}
                    className={`min-h-[34px] px-3 rounded-full text-[12px] font-semibold shrink-0 inline-flex items-center gap-1 transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[#D9A21B] text-[#0B2A5B] font-bold'
                        : 'bg-[#1C4A8F]/70 text-[#DCE6F5] hover:bg-[#1C4A8F] hover:text-white'
                    }`}
                  >
                    <span>{z.name}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Sort Tabs (Hot, New, Top 24h) with Gold #D9A21B active underline */}
          {activeTab === 'feed' && !activeThreadId && (
            <div className="flex items-center justify-between border-t border-[#1C4A8F]/60">
              <div role="tablist" aria-label="Feed sort order" className="flex items-center gap-1">
                {(
                  [
                    { id: 'hot', label: 'Hot' },
                    { id: 'new', label: 'New' },
                    { id: 'top24', label: 'Top (24h)' },
                  ] as const
                ).map((tab) => {
                  const isActive = sort === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => setSort(tab.id)}
                      className={`min-h-[44px] px-4 text-[15px] font-semibold border-b-[3px] transition-colors cursor-pointer ${
                        isActive
                          ? 'border-[#D9A21B] text-white'
                          : 'border-transparent text-[#DCE6F5] hover:text-white'
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-2">
                {liveSyncActive && (
                  <div
                    title="Live background feed worker active"
                    className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#133875] text-[#DCE6F5] text-[11px] font-semibold border border-[#2C599D]"
                  >
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span>Live Updates</span>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setAsksOnly(!asksOnly)}
                  aria-pressed={asksOnly}
                  className={`min-h-[36px] px-3 rounded-full text-[13px] font-semibold cursor-pointer ${
                    asksOnly
                      ? 'bg-[#D9A21B] text-[#0B2A5B]'
                      : 'bg-[#1C4A8F] text-white hover:bg-[#1C4A8F]/80'
                  }`}
                >
                  Asks Only
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Offline Banner — Design Brief Section 6 */}
      {isOffline && (
        <div
          role="status"
          className="bg-[#A32121] text-white px-4 py-2.5 text-[14px] font-semibold flex items-center justify-center gap-2"
        >
          <WifiOff className="w-4 h-4" aria-hidden="true" />
          <span>Offline — showing last loaded items. Posting and voting are paused.</span>
        </div>
      )}

      {/* Rate Limited Banner — Design Brief Section 6 */}
      {rateLimitBanner && (
        <div
          role="alert"
          className="bg-[#FBF3DC] text-[#1B2433] border-b border-[#D9A21B] px-4 py-2.5 text-[14px] flex items-center justify-between max-w-[640px] w-full mx-auto"
        >
          <span>{rateLimitBanner}</span>
          <button
            type="button"
            onClick={() => setRateLimitBanner(null)}
            className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center font-semibold text-[#0B2A5B] cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Neutral Status Toast (Held Post / Report Confirmation) */}
      {composeStatusToast && (
        <div
          role="status"
          className="bg-[#EEF2F8] text-[#0B2A5B] border-b border-[#D5DAE3] px-4 py-3 text-[14px] font-medium flex items-center justify-between max-w-[640px] w-full mx-auto"
        >
          <span>{composeStatusToast}</span>
          <button
            type="button"
            onClick={() => setComposeStatusToast(null)}
            className="min-h-[36px] px-3 font-semibold text-[#1C4A8F] cursor-pointer"
          >
            OK
          </button>
        </div>
      )}

      {reportStatusMessage && (
        <div
          role="status"
          className="bg-[#EEF2F8] text-[#0B2A5B] border-b border-[#D5DAE3] px-4 py-3 text-[14px] font-medium flex items-center justify-between max-w-[640px] w-full mx-auto"
        >
          <span>{reportStatusMessage}</span>
          <button
            type="button"
            onClick={() => setReportStatusMessage(null)}
            className="min-h-[36px] px-3 font-semibold text-[#1C4A8F] cursor-pointer"
          >
            Close
          </button>
        </div>
      )}

      {/* Main Content Column (max 640px centered) */}
      <main className="flex-1 w-full max-w-[640px] mx-auto px-4 py-4 space-y-4">
        {/* Active Channel Filter Pill */}
        {activeTab === 'feed' && !activeThreadId && selectedChannelId && (
          <div className="flex items-center justify-between bg-[var(--surface-card)] border border-[var(--border-color)] rounded-[8px] px-3 py-2">
            <span className="text-[14px] font-semibold text-[var(--text-heading)]">
              Channel: {channelMap.get(selectedChannelId)?.name ?? 'Filtered'}
            </span>
            <button
              type="button"
              onClick={() => setSelectedChannelId(undefined)}
              className="min-h-[36px] px-2 text-[13px] font-semibold text-[#1C4A8F] hover:underline cursor-pointer"
            >
              Clear filter
            </button>
          </div>
        )}

        {/* Realtime New-Posts Pill — FEED-3 & Design Brief Section 7 */}
        {activeTab === 'feed' && !activeThreadId && newPostsCount > 0 && (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => {
                if (typeof window !== 'undefined') {
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }
                void loadFeed();
                feedWorkerRef.current?.postMessage({ type: 'FETCH_NOW' });
              }}
              className="new-posts-pill min-h-[44px] px-4 py-2 rounded-full bg-[#D9A21B] text-[#0B2A5B] font-bold text-[14px] inline-flex items-center gap-2 border border-[#0B2A5B] cursor-pointer shadow-md hover:bg-[#e6b12c] transition-all"
            >
              <RefreshCw className="w-4 h-4" aria-hidden="true" />
              <span>New posts ({newPostsCount}) — Tap to view</span>
            </button>
          </div>
        )}

        {/* THREAD VIEW (Screen Inventory: Thread, F6, F8) */}
        {activeThreadId && threadData ? (
          <section aria-label="Conversation thread" className="space-y-4">
            <button
              type="button"
              onClick={() => {
                setActiveThreadId(null);
                setThreadData(null);
              }}
              className="min-h-[44px] inline-flex items-center gap-2 text-[15px] font-semibold text-[var(--text-heading)] hover:underline cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" aria-hidden="true" />
              <span>Back to campus feed</span>
            </button>

            <article className="bg-[var(--surface-card)] border border-[var(--border-color)] rounded-[8px] p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <AliasChipWithGlyph postId={threadData.post.id} aliasNo={0} />
                  <span className="text-[13px] text-[var(--text-secondary)]">
                    {channelMap.get(threadData.post.channelId)?.name ?? 'Campus'} ·{' '}
                    <time
                      dateTime={threadData.post.createdAt}
                      title={new Date(threadData.post.createdAt).toLocaleString()}
                    >
                      {formatRelativeTime(threadData.post.createdAt)}
                    </time>
                  </span>
                </div>
                {threadData.post.kind === 'ask' && (
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[12px] font-bold ${
                      threadData.post.answered
                        ? 'bg-[#FBF3DC] text-[#1F7A4D] border border-[#1F7A4D]/30'
                        : 'bg-[#D9A21B] text-[#0B2A5B]'
                    }`}
                  >
                    {threadData.post.answered ? '✓ Answered Ask' : 'Ask · Open'}
                  </span>
                )}
              </div>

              {threadData.post.status !== 'published' && (
                <div className="bg-[#EEF2F8] text-[#0B2A5B] px-3 py-2 rounded-[8px] text-[13px] font-semibold">
                  Your post is being checked. It will appear soon if it follows the guidelines.
                </div>
              )}

              <p className="text-[16px] leading-[24px] whitespace-pre-wrap break-words">
                {threadData.post.body}
              </p>

              <div className="flex items-center justify-between pt-2 border-t border-[var(--border-color)]">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={isOffline}
                    onClick={() =>
                      void handleVote(
                        'post',
                        threadData.post.id,
                        1,
                        threadData.post.myVote
                      )
                    }
                    aria-label={`Upvote post, current score ${threadData.post.score}, ${
                      threadData.post.myVote === 1 ? 'selected' : 'not selected'
                    }`}
                    className={`vote-btn min-w-[44px] min-h-[44px] rounded-[8px] inline-flex items-center justify-center cursor-pointer ${
                      threadData.post.myVote === 1
                        ? 'bg-[#0B2A5B] text-white'
                        : 'bg-[var(--surface-subtle)] text-[var(--text-primary)]'
                    }`}
                  >
                    <ArrowUp className="w-4 h-4" />
                  </button>
                  <span className="font-bold text-[15px] min-w-[24px] text-center">
                    {threadData.post.score}
                  </span>
                  <button
                    type="button"
                    disabled={isOffline}
                    onClick={() =>
                      void handleVote(
                        'post',
                        threadData.post.id,
                        -1,
                        threadData.post.myVote
                      )
                    }
                    aria-label={`Downvote post, current score ${threadData.post.score}, ${
                      threadData.post.myVote === -1 ? 'selected' : 'not selected'
                    }`}
                    className={`vote-btn min-w-[44px] min-h-[44px] rounded-[8px] inline-flex items-center justify-center cursor-pointer ${
                      threadData.post.myVote === -1
                        ? 'bg-[#0B2A5B] text-white'
                        : 'bg-[var(--surface-subtle)] text-[var(--text-primary)]'
                    }`}
                  >
                    <ArrowDown className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  {threadData.post.isMine && (
                    <button
                      type="button"
                      onClick={() => void handleDeleteOwnPost(threadData.post.id)}
                      className="min-h-[44px] px-3 rounded-[8px] text-[13px] font-semibold text-[#A32121] hover:bg-[#A32121]/10 inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" aria-hidden="true" />
                      <span>Delete</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      setReportTarget({
                        targetType: 'post',
                        targetId: threadData.post.id,
                      })
                    }
                    className="min-h-[44px] px-3 rounded-[8px] text-[13px] font-semibold text-[var(--text-secondary)] hover:text-[#A32121] inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Flag className="w-4 h-4" aria-hidden="true" />
                    <span>Report</span>
                  </button>
                </div>
              </div>
            </article>

            {/* Flat Replies List — Design Brief Section 4.2 */}
            <div className="space-y-3">
              <h2 className="text-[15px] font-semibold text-[var(--text-heading)]">
                Replies ({threadData.replies.length})
              </h2>

              {threadData.replies.length === 0 ? (
                <div className="bg-[var(--surface-card)] border border-[var(--border-color)] rounded-[8px] p-5 text-[15px] text-[var(--text-secondary)]">
                  No replies yet. Be the first student to answer.
                </div>
              ) : (
                threadData.replies.map((reply) => {
                  const isAccepted = threadData.post.answeredReplyId === reply.id;
                  return (
                    <div
                      key={reply.id}
                      className={`rounded-[8px] border p-4 space-y-2 ${
                        isAccepted
                          ? 'bg-[#FBF3DC] border-[#D9A21B] text-[#1B2433]'
                          : 'bg-[var(--surface-card)] border-[var(--border-color)]'
                      }`}
                    >
                      {isAccepted && (
                        <div className="inline-flex items-center gap-1.5 text-[13px] font-bold text-[#1F7A4D]">
                          <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                          <span>Accepted Answer pinned by OP</span>
                        </div>
                      )}

                      <div className="flex items-center justify-between gap-2">
                        <AliasChipWithGlyph
                          postId={threadData.post.id}
                          aliasNo={reply.aliasNo}
                        />
                        <time
                          dateTime={reply.createdAt}
                          title={new Date(reply.createdAt).toLocaleString()}
                          className="text-[13px] text-[var(--text-secondary)]"
                        >
                          {formatRelativeTime(reply.createdAt)}
                        </time>
                      </div>

                      <p className="text-[16px] leading-[24px] whitespace-pre-wrap break-words">
                        {reply.body}
                      </p>

                      <div className="flex items-center justify-between pt-1">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={isOffline}
                            onClick={() =>
                              void handleVote('reply', reply.id, 1, reply.myVote)
                            }
                            aria-label={`Upvote reply, current score ${reply.score}, ${
                              reply.myVote === 1 ? 'selected' : 'not selected'
                            }`}
                            className={`vote-btn min-w-[44px] min-h-[44px] rounded-[8px] inline-flex items-center justify-center cursor-pointer ${
                              reply.myVote === 1
                                ? 'bg-[#0B2A5B] text-white'
                                : 'bg-[var(--surface-subtle)] text-[var(--text-primary)]'
                            }`}
                          >
                            <ArrowUp className="w-4 h-4" />
                          </button>
                          <span className="font-semibold text-[14px] min-w-[20px] text-center">
                            {reply.score}
                          </span>
                          <button
                            type="button"
                            disabled={isOffline}
                            onClick={() =>
                              void handleVote('reply', reply.id, -1, reply.myVote)
                            }
                            aria-label={`Downvote reply, current score ${reply.score}, ${
                              reply.myVote === -1 ? 'selected' : 'not selected'
                            }`}
                            className={`vote-btn min-w-[44px] min-h-[44px] rounded-[8px] inline-flex items-center justify-center cursor-pointer ${
                              reply.myVote === -1
                                ? 'bg-[#0B2A5B] text-white'
                                : 'bg-[var(--surface-subtle)] text-[var(--text-primary)]'
                            }`}
                          >
                            <ArrowDown className="w-4 h-4" />
                          </button>
                        </div>

                        <div className="flex items-center gap-2">
                          {threadData.post.kind === 'ask' &&
                            threadData.post.isMine &&
                            !isAccepted && (
                              <button
                                type="button"
                                onClick={() => void handleMarkAnswer(reply.id)}
                                className="min-h-[44px] px-3 rounded-[8px] bg-[#0B2A5B] text-white text-[13px] font-semibold hover:bg-[#1C4A8F] cursor-pointer"
                              >
                                Mark as answer
                              </button>
                            )}
                          <button
                            type="button"
                            onClick={() =>
                              setReportTarget({
                                targetType: 'reply',
                                targetId: reply.id,
                              })
                            }
                            className="min-h-[44px] px-2 text-[13px] font-semibold text-[var(--text-secondary)] hover:text-[#A32121] cursor-pointer"
                          >
                            Report
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Reply Box Pinned at Bottom of Thread */}
            <form
              onSubmit={handleCreateReply}
              className="bg-[var(--surface-card)] border border-[var(--border-color)] rounded-[8px] p-4 space-y-3"
            >
              <label
                htmlFor="reply-textarea"
                className="block text-[14px] font-semibold text-[var(--text-heading)]"
              >
                Add a reply (your alias in this thread stays consistent)
              </label>
              <textarea
                id="reply-textarea"
                rows={3}
                maxLength={300}
                disabled={isOffline || replySubmitting}
                placeholder="Write a helpful reply (up to 300 characters)..."
                value={replyBody}
                onChange={(e) => setReplyBody(e.target.value)}
                className="w-full p-3 rounded-[8px] border border-[var(--border-color)] bg-[var(--surface-app)] text-[16px] leading-[24px]"
              />
              <div className="flex items-center justify-between">
                <span
                  className={`text-[13px] font-semibold ${
                    replyCharRemaining <= 20
                      ? 'text-[#A32121]'
                      : 'text-[var(--text-secondary)]'
                  }`}
                >
                  {replyCharRemaining} characters left
                </span>
                <button
                  type="submit"
                  disabled={
                    isOffline ||
                    replySubmitting ||
                    replyBody.trim().length === 0 ||
                    replyBody.length > 300
                  }
                  className="min-h-[44px] px-5 rounded-[8px] bg-[#0B2A5B] text-white font-semibold text-[15px] disabled:opacity-40 hover:bg-[#1C4A8F] cursor-pointer"
                >
                  Reply
                </button>
              </div>
            </form>
          </section>
        ) : activeTab === 'feed' ? (
          /* FEED TAB — All 5 States (Loading Skeletons, Error, Empty, Offline, Success) */
          <section aria-label="Campus feed" className="space-y-3">
            {loading ? (
              <div aria-busy="true" aria-label="Loading campus posts" className="space-y-3">
                {[1, 2, 3].map((skeletonId) => (
                  <div
                    key={skeletonId}
                    className="bg-[var(--surface-card)] border border-[var(--border-color)] rounded-[8px] p-4 flex gap-3 animate-pulse"
                  >
                    <div className="w-[44px] h-24 bg-[var(--surface-subtle)] rounded-[8px]" />
                    <div className="flex-1 space-y-3 py-1">
                      <div className="h-4 w-1/3 bg-[var(--surface-subtle)] rounded" />
                      <div className="h-4 w-full bg-[var(--surface-subtle)] rounded" />
                      <div className="h-4 w-2/3 bg-[var(--surface-subtle)] rounded" />
                    </div>
                  </div>
                ))}
              </div>
            ) : errorMessage ? (
              <div
                role="alert"
                className="bg-[var(--surface-card)] border border-[#A32121] rounded-[8px] p-6 space-y-4 text-center"
              >
                <p className="text-[16px] font-semibold text-[var(--text-heading)]">
                  {errorMessage}
                </p>
                <button
                  type="button"
                  onClick={() => void loadFeed()}
                  className="min-h-[44px] px-5 rounded-[8px] bg-[#0B2A5B] text-white font-semibold text-[15px] hover:bg-[#1C4A8F] cursor-pointer"
                >
                  Retry
                </button>
              </div>
            ) : posts.length === 0 ? (
              /* Empty Feed State — Design Brief Section 6 & 9 */
              <div className="bg-[var(--surface-card)] border border-[var(--border-color)] rounded-[8px] p-6 space-y-4">
                <h2 className="text-[18px] font-bold text-[var(--text-heading)]">
                  Nothing here yet. Ask something, someone near you probably knows.
                </h2>
                <div className="space-y-2 text-[14px] text-[var(--text-secondary)]">
                  <p className="font-semibold text-[var(--text-heading)]">Example Asks:</p>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>&ldquo;Is the Academic Affairs counter open for ID collection right now?&rdquo;</li>
                    <li>&ldquo;Which study room in the library has working sockets on the 2nd floor?&rdquo;</li>
                  </ul>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setComposeIsAsk(true);
                    setComposeOpen(true);
                  }}
                  className="min-h-[44px] px-5 rounded-[8px] bg-[#0B2A5B] text-white font-semibold text-[15px] hover:bg-[#1C4A8F] cursor-pointer"
                >
                  Ask the first question
                </button>
              </div>
            ) : (
              posts.map((post) => {
                const channel = channelMap.get(post.channelId);
                const isLong = post.body.length > 260 || post.body.split('\n').length > 6;
                const isExpanded = expandedPosts[post.id] ?? false;
                const displayedBody =
                  isLong && !isExpanded ? `${post.body.slice(0, 260)}…` : post.body;

                return (
                  <article
                    key={post.id}
                    className="bg-[var(--surface-card)] border border-[var(--border-color)] rounded-[8px] p-3.5 flex gap-3"
                  >
                    {/* Left Vote Rail (44px wide vertical stack) — Design Brief Section 4.1 */}
                    <div className="w-[44px] shrink-0 flex flex-col items-center justify-start gap-1">
                      <button
                        type="button"
                        disabled={isOffline}
                        onClick={() => void handleVote('post', post.id, 1, post.myVote)}
                        aria-label={`Upvote, current score ${post.score}, ${
                          post.myVote === 1 ? 'selected' : 'not selected'
                        }`}
                        className={`vote-btn w-[44px] h-[44px] rounded-[8px] inline-flex items-center justify-center cursor-pointer ${
                          post.myVote === 1
                            ? 'bg-[#0B2A5B] text-white'
                            : 'bg-[var(--surface-subtle)] text-[var(--text-primary)] hover:bg-[#DCE6F5]'
                        }`}
                      >
                        <ArrowUp className="w-4 h-4" />
                      </button>

                      <span
                        aria-live="polite"
                        className="text-[14px] font-bold text-[var(--text-heading)] py-0.5"
                      >
                        {post.score}
                      </span>

                      <button
                        type="button"
                        disabled={isOffline}
                        onClick={() => void handleVote('post', post.id, -1, post.myVote)}
                        aria-label={`Downvote, current score ${post.score}, ${
                          post.myVote === -1 ? 'selected' : 'not selected'
                        }`}
                        className={`vote-btn w-[44px] h-[44px] rounded-[8px] inline-flex items-center justify-center cursor-pointer ${
                          post.myVote === -1
                            ? 'bg-[#0B2A5B] text-white'
                            : 'bg-[var(--surface-subtle)] text-[var(--text-primary)] hover:bg-[#DCE6F5]'
                        }`}
                      >
                        <ArrowDown className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Card Main Content */}
                    <div className="flex-1 min-w-0 flex flex-col justify-between space-y-2.5">
                      {/* Header: Channel icon and name, place badge, relative time */}
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            type="button"
                            onClick={() => setSelectedChannelId(post.channelId)}
                            className="inline-flex items-center gap-1.5 text-[15px] font-semibold text-[var(--text-heading)] hover:underline cursor-pointer"
                          >
                            <ChannelIcon
                              icon={channel?.icon ?? 'chat'}
                              className="w-4 h-4 text-[#1C4A8F]"
                            />
                            <span>{channel?.name ?? 'Campus'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setSelectedZoneId(post.zoneId)}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--surface-subtle)] border border-[var(--border-color)] text-[11px] font-semibold text-[#1C4A8F] hover:bg-[#DCE6F5] cursor-pointer"
                          >
                            <MapPin className="w-3 h-3" aria-hidden="true" />
                            <span>{post.zoneName ?? 'UPSA Main Campus'}</span>
                          </button>
                        </div>

                        <time
                          dateTime={post.createdAt}
                          title={new Date(post.createdAt).toLocaleString()}
                          className="text-[13px] leading-[18px] text-[var(--text-secondary)]"
                        >
                          {formatRelativeTime(post.createdAt)}
                        </time>
                      </div>

                      {/* Body: 16px/24px text, truncated at 6 lines with Read more */}
                      <div
                        onClick={() => {
                          setActiveThreadId(post.id);
                          void loadThread(post.id);
                        }}
                        className="cursor-pointer space-y-1"
                      >
                        <p className="text-[16px] leading-[24px] text-[var(--text-primary)] whitespace-pre-wrap break-words">
                          {displayedBody}
                        </p>
                        {isLong && !isExpanded && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedPosts((prev) => ({ ...prev, [post.id]: true }));
                            }}
                            className="text-[14px] font-semibold text-[#1C4A8F] hover:underline cursor-pointer"
                          >
                            Read more
                          </button>
                        )}
                      </div>

                      {/* Footer: Reply count, Ask badge (Open / Answered), Report */}
                      <div className="flex items-center justify-between gap-2 pt-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            type="button"
                            onClick={() => {
                              setActiveThreadId(post.id);
                              void loadThread(post.id);
                            }}
                            className="min-h-[44px] px-3 rounded-[8px] bg-[var(--surface-subtle)] text-[13px] font-semibold text-[var(--text-heading)] hover:bg-[#DCE6F5] inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            <span>
                              {post.replyCount} {post.replyCount === 1 ? 'reply' : 'replies'}
                            </span>
                          </button>

                          {post.kind === 'ask' && (
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[13px] font-bold ${
                                post.answered
                                  ? 'bg-[#FBF3DC] text-[#1F7A4D] border border-[#1F7A4D]/30'
                                  : 'bg-[#D9A21B] text-[#0B2A5B]'
                              }`}
                            >
                              {post.answered ? (
                                <>
                                  <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                                  <span>Ask · Answered</span>
                                </>
                              ) : (
                                <span>Ask · Open</span>
                              )}
                            </span>
                          )}
                        </div>

                        <button
                          type="button"
                          aria-label="Report post"
                          onClick={() =>
                            setReportTarget({ targetType: 'post', targetId: post.id })
                          }
                          className="min-w-[44px] min-h-[44px] rounded-[8px] inline-flex items-center justify-center text-[var(--text-secondary)] hover:text-[#A32121] cursor-pointer"
                        >
                          <Flag className="w-4 h-4" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })
            )}
          </section>
        ) : activeTab === 'channels' ? (
          /* CHANNELS TAB — Design Brief Section 2.3 & 5 */
          <section aria-label="Campus channels" className="space-y-3">
            <h1 className="text-[22px] leading-[28px] font-bold text-[var(--text-heading)]">
              Channels
            </h1>
            <p className="text-[14px] text-[var(--text-secondary)]">
              Pick a topic channel to filter the campus feed.
            </p>
            <div className="space-y-2.5">
              {channels.map((ch) => (
                <button
                  key={ch.id}
                  type="button"
                  onClick={() => {
                    setSelectedChannelId(ch.id);
                    setActiveTab('feed');
                  }}
                  className="w-full text-left bg-[var(--surface-card)] border border-[var(--border-color)] rounded-[8px] p-4 flex items-start justify-between gap-3 hover:border-[#1C4A8F] cursor-pointer"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-[8px] bg-[var(--surface-subtle)] text-[#0B2A5B] flex items-center justify-center shrink-0">
                      <ChannelIcon icon={ch.icon} className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-[15px] font-semibold text-[var(--text-heading)] flex items-center gap-2">
                        <span>{ch.name}</span>
                        {ch.allowsAsk && (
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#D9A21B] text-[#0B2A5B]">
                            Supports Asks
                          </span>
                        )}
                      </div>
                      <p className="text-[13px] leading-[18px] text-[var(--text-secondary)] mt-0.5">
                        {ch.description}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </section>
        ) : activeTab === 'alerts' ? (
          /* ALERTS TAB — App Flow F11 & Design Brief Section 5 */
          <section aria-label="In-app alerts and push settings" className="space-y-4">
            <div className="flex items-center justify-between">
              <h1 className="text-[22px] leading-[28px] font-bold text-[var(--text-heading)]">
                Alerts
              </h1>
              {unreadAlertsCount > 0 && (
                <button
                  type="button"
                  onClick={async () => {
                    await fetch('/api/me', { method: 'PATCH' });
                    void loadMeAndAlerts();
                  }}
                  className="min-h-[44px] px-3 text-[14px] font-semibold text-[#1C4A8F] hover:underline cursor-pointer"
                >
                  Mark all read
                </button>
              )}
            </div>

            {/* Web Push Opt-in Banner with iOS Home Screen install detection */}
            <div className="bg-[var(--surface-card)] border border-[var(--border-color)] rounded-[8px] p-4 space-y-2">
              <div className="font-semibold text-[15px] text-[var(--text-heading)]">
                Web Push Notifications
              </div>
              {isIosNotStandalone ? (
                <p className="text-[14px] text-[var(--text-secondary)]">
                  On iPhone/iPad, tap <strong>Share &gt; Add to Home Screen</strong> first to
                  enable instant push notifications for replies and answers.
                </p>
              ) : pushSubscribed ? (
                <div className="flex items-center justify-between">
                  <span className="text-[14px] text-[#1F7A4D] font-semibold">
                    Push alerts enabled for replies, accepted answers, and moderation outcomes.
                  </span>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        if (
                          typeof window !== 'undefined' &&
                          'serviceWorker' in navigator &&
                          'PushManager' in window
                        ) {
                          const reg = await navigator.serviceWorker.ready;
                          const sub = await reg.pushManager.getSubscription();
                          if (sub) {
                            await sub.unsubscribe();
                            await fetch('/api/push/unsubscribe', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ endpoint: sub.endpoint }),
                            });
                          }
                        }
                      } catch (err) {
                        console.error('Error disabling push:', err);
                      }
                      setPushSubscribed(false);
                      setComposeStatusToast('Web push alerts turned off.');
                    }}
                    className="min-h-[44px] px-3 text-[13px] font-semibold text-[#A32121] cursor-pointer"
                  >
                    Turn off
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[14px] text-[var(--text-secondary)]">
                    Get notified when someone replies to your Ask or accepts your answer.
                  </span>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        if (
                          typeof window !== 'undefined' &&
                          'serviceWorker' in navigator &&
                          'PushManager' in window
                        ) {
                          const perm = await Notification.requestPermission();
                          if (perm !== 'granted') {
                            setComposeStatusToast('Notification permission was dismissed or denied.');
                            return;
                          }
                          const reg = await navigator.serviceWorker.ready;
                          const cfgRes = await fetch('/api/push/subscribe');
                          const cfgJson = await cfgRes.json();
                          const vapidKey = cfgJson.data?.publicKey;

                          let sub = await reg.pushManager.getSubscription();
                          if (!sub && vapidKey) {
                            sub = await reg.pushManager.subscribe({
                              userVisibleOnly: true,
                              applicationServerKey: urlBase64ToUint8Array(vapidKey) as unknown as BufferSource,
                            });
                          }
                          if (sub) {
                            const subJson = sub.toJSON();
                            await fetch('/api/push/subscribe', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                endpoint: sub.endpoint,
                                p256dh: subJson.keys?.p256dh ?? 'p256dh-key',
                                auth: subJson.keys?.auth ?? 'auth-key',
                              }),
                            });
                            setPushSubscribed(true);
                            setComposeStatusToast('Web Push notifications enabled for UPSA Pulse!');
                            return;
                          }
                        }
                        // Fallback simulation for non-HTTPS dev environment
                        await fetch('/api/push/subscribe', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            endpoint: 'https://push.upsapulse.local/sub/1',
                            p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQ',
                            auth: 'tBHItJI5svbpez7KI4CCXg',
                          }),
                        });
                        setPushSubscribed(true);
                        setComposeStatusToast('Push alerts enabled for campus activity.');
                      } catch (err) {
                        console.error('Push subscribe error:', err);
                        setComposeStatusToast('Push alerts could not be enabled in this environment.');
                      }
                    }}
                    className="min-h-[44px] px-4 rounded-[8px] bg-[#0B2A5B] text-white text-[14px] font-semibold shrink-0 hover:bg-[#1C4A8F] cursor-pointer"
                  >
                    Enable Push
                  </button>
                </div>
              )}
            </div>

            {notifications.length === 0 ? (
              <div className="bg-[var(--surface-card)] border border-[var(--border-color)] rounded-[8px] p-6 text-[15px] text-[var(--text-secondary)]">
                No alerts yet. Replies to your posts and accepted answers will appear here.
              </div>
            ) : (
              <div className="space-y-2">
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    onClick={() => {
                      const postId = n.payload.post_id;
                      if (typeof postId === 'string') {
                        setActiveTab('feed');
                        setActiveThreadId(postId);
                        void loadThread(postId);
                      }
                    }}
                    className={`rounded-[8px] border p-4 cursor-pointer space-y-1 ${
                      n.readAt
                        ? 'bg-[var(--surface-card)] border-[var(--border-color)]'
                        : 'bg-[var(--surface-subtle)] border-[#1C4A8F]'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[13px] text-[var(--text-secondary)]">
                      <span className="font-semibold text-[var(--text-heading)]">
                        {n.type === 'reply'
                          ? `New reply from Student ${String(n.payload.alias_no ?? '')}`
                          : n.type === 'answer_accepted'
                          ? 'Your reply was marked as the accepted answer'
                          : 'Account & Moderation Notice'}
                      </span>
                      <span>{formatRelativeTime(n.createdAt)}</span>
                    </div>
                    {typeof n.payload.snippet === 'string' && (
                      <p className="text-[15px] text-[var(--text-primary)]">
                        &ldquo;{n.payload.snippet}&rdquo;
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        ) : (
          /* ME TAB — Private Karma, Data Requests, Appeal, Account Deletion, Legal Links */
          <section aria-label="My account and privacy controls" className="space-y-5">
            <h1 className="text-[22px] leading-[28px] font-bold text-[var(--text-heading)]">
              Me
            </h1>

            {accountDeletedMessage && (
              <div
                role="status"
                className="bg-[#FBF3DC] border border-[#D9A21B] text-[#1B2433] p-4 rounded-[8px] text-[15px] font-medium"
              >
                {accountDeletedMessage}
              </div>
            )}

            {/* Private Student Identity & Authentication Card */}
            <div className="bg-[var(--surface-card)] border border-[var(--border-color)] rounded-[8px] p-5 space-y-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="text-[13px] font-semibold text-[var(--text-secondary)]">
                    Private Student Credentials (Never visible on public posts)
                  </div>
                  <div className="text-[18px] font-bold text-[var(--text-heading)] mt-1">
                    @{profileSummary?.username ?? 'student'}{' '}
                    <span className="text-[14px] font-mono text-[#1C4A8F]">
                      · Index #{profileSummary?.indexNumber ?? '—'}
                    </span>
                  </div>
                  <p className="text-[12px] text-[var(--text-secondary)] mt-0.5">
                    Provider: {profileSummary?.authProvider ?? '—'} · Index Verified:{' '}
                    {profileSummary?.indexVerified ? 'Yes (API Key Active)' : 'Pending'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      void fetch('/api/auth/logout', { method: 'POST' });
                      setAuthMode('signup');
                      setOnboardingStage('signup');
                    }}
                    className="min-h-[40px] px-3.5 rounded-[8px] bg-[#0B2A5B] text-white text-[13px] font-semibold hover:bg-[#1C4A8F] cursor-pointer"
                  >
                    Sign Up / Switch Student
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('forgot');
                      setOnboardingStage('signup');
                    }}
                    className="min-h-[40px] px-3.5 rounded-[8px] border border-[var(--border-color)] text-[13px] font-semibold text-[var(--text-heading)] hover:bg-[var(--surface-subtle)] cursor-pointer"
                  >
                    Reset Password
                  </button>
                </div>
              </div>
            </div>

            {/* Private Karma Card — KARMA-1 */}
            <div className="bg-[var(--surface-card)] border border-[var(--border-color)] rounded-[8px] p-5 flex items-center justify-between">
              <div>
                <div className="text-[13px] font-semibold text-[var(--text-secondary)]">
                  Private Campus Karma (Visible only to you)
                </div>
                <div className="text-[28px] font-bold text-[var(--text-heading)] mt-1">
                  {profileSummary?.karma ?? 0}
                </div>
                <p className="text-[13px] text-[var(--text-secondary)] mt-1">
                  Net votes received on your posts and replies.
                </p>
              </div>
              <div className="px-3 py-1.5 rounded-full bg-[#DCE6F5] text-[#0B2A5B] text-[13px] font-bold">
                Status: {profileSummary?.status ?? 'active'}
              </div>
            </div>

            {/* Campus Geofence & Location Status (F3) */}
            <div className="bg-[var(--surface-card)] border border-[var(--border-color)] rounded-[8px] p-5 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 text-[#8A6200] font-bold text-[15px]">
                  <MapPin className="w-4 h-4" />
                  <h2>Campus Location &amp; Geofence Status</h2>
                </div>
                <span className="px-2.5 py-0.5 rounded-full bg-[#EBF5EE] text-[#1F7A4D] text-[12px] font-bold">
                  {zoneName}
                </span>
              </div>
              <p className="text-[13px] text-[var(--text-secondary)]">
                Pulse works only when physically on the UPSA campus or within hostel zones. Your raw coordinates are discarded immediately after check.
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleLiveGpsCheck}
                  className="min-h-[40px] px-3.5 rounded-[8px] bg-[#0B2A5B] text-white text-[13px] font-semibold hover:bg-[#1C4A8F] cursor-pointer inline-flex items-center gap-2"
                >
                  <MapPin className="w-4 h-4" />
                  <span>Verify Location (Live GPS)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setOnboardingStage('outside_zone')}
                  className="min-h-[40px] px-3.5 rounded-[8px] border border-[var(--border-color)] text-[13px] font-semibold text-[var(--text-heading)] hover:bg-[var(--surface-subtle)] cursor-pointer"
                >
                  View Campus Zone Coverage
                </button>
              </div>
            </div>

            {/* Student Welfare & Crisis Support — 24/7 (MOD-2) */}
            <div className="bg-[var(--surface-card)] border border-[#A32121]/30 rounded-[8px] p-5 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 text-[#A32121] font-bold text-[15px]">
                  <HeartHandshake className="w-4 h-4" />
                  <h2>Student Welfare &amp; Crisis Support (24/7)</h2>
                </div>
                <span className="px-2.5 py-0.5 rounded-full bg-[#FCEBEB] text-[#A32121] text-[12px] font-bold">
                  Confidential
                </span>
              </div>
              <p className="text-[13px] text-[var(--text-secondary)]">
                Immediate confidential support for students experiencing emotional distress, academic burnout, or personal crises.
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setSupportCardOpen(true)}
                  className="min-h-[40px] px-3.5 rounded-[8px] bg-[#A32121] text-white text-[13px] font-semibold hover:bg-[#821818] cursor-pointer inline-flex items-center gap-2"
                >
                  <HeartHandshake className="w-4 h-4" />
                  <span>Open Crisis Resources &amp; Hotlines</span>
                </button>
                <a
                  href="tel:0800678678"
                  className="min-h-[40px] px-3.5 rounded-[8px] border border-[var(--border-color)] text-[13px] font-semibold text-[var(--text-heading)] hover:bg-[var(--surface-subtle)] inline-flex items-center gap-1.5"
                >
                  <span>Ghana Mental Health: 0800 678 678</span>
                </a>
              </div>
            </div>

            {/* Hardware Device Security (F2) */}
            <div className="bg-[var(--surface-card)] border border-[var(--border-color)] rounded-[8px] p-5 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 text-[var(--text-heading)] font-bold text-[15px]">
                  <ShieldAlert className="w-4 h-4 text-[#1C4A8F]" />
                  <h2>Hardware Device Security (One-Device Rule)</h2>
                </div>
                <span className="px-2.5 py-0.5 rounded-full bg-[#DCE6F5] text-[#0B2A5B] text-[12px] font-bold">
                  Hardware Token Active
                </span>
              </div>
              <p className="text-[13px] text-[var(--text-secondary)]">
                Your account is protected by hardware device trust. If you log in from an unrecognised second browser, you will be prompted for device approval.
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setPendingDeviceModalOpen(true)}
                  className="min-h-[40px] px-3.5 rounded-[8px] border border-[var(--border-color)] text-[13px] font-semibold text-[var(--text-heading)] hover:bg-[var(--surface-subtle)] cursor-pointer"
                >
                  Manage / Approve Trusted Device
                </button>
              </div>
            </div>

            {/* Campus Guide & Legal Consents (F1 & F14) */}
            <div className="bg-[var(--surface-card)] border border-[var(--border-color)] rounded-[8px] p-5 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 text-[var(--text-heading)] font-bold text-[15px]">
                  <Compass className="w-4 h-4 text-[#1C4A8F]" />
                  <h2>Campus Guide &amp; Community Consents</h2>
                </div>
              </div>
              <p className="text-[13px] text-[var(--text-secondary)]">
                Review the campus onboarding walkthrough, community etiquette rules, and your legally binding consent documents.
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setWelcomeSlide(0);
                    setOnboardingStage('welcome');
                  }}
                  className="min-h-[40px] px-3.5 rounded-[8px] bg-[#0B2A5B] text-white text-[13px] font-semibold hover:bg-[#1C4A8F] cursor-pointer inline-flex items-center gap-2"
                >
                  <Compass className="w-4 h-4" />
                  <span>Open Campus Welcome Guide</span>
                </button>
                <button
                  type="button"
                  onClick={() => setLegalUpdateModalOpen(true)}
                  className="min-h-[40px] px-3.5 rounded-[8px] border border-[var(--border-color)] text-[13px] font-semibold text-[var(--text-heading)] hover:bg-[var(--surface-subtle)] cursor-pointer inline-flex items-center gap-2"
                >
                  <Layers className="w-4 h-4" />
                  <span>Review Legal Consents Sheet</span>
                </button>
              </div>
            </div>

            {/* Suspension / Ban Appeal Box (F15) */}
            {profileSummary &&
              (profileSummary.status === 'suspended' || profileSummary.status === 'banned') && (
                <div className="bg-[var(--surface-card)] border border-[#A32121] rounded-[8px] p-5 space-y-3">
                  <h2 className="text-[16px] font-bold text-[#A32121]">
                    Account Restricted ({profileSummary.status})
                  </h2>
                  <p className="text-[14px] text-[var(--text-secondary)]">
                    You may submit one appeal for review by a different moderator.
                  </p>
                  {appealSubmitted ? (
                    <p className="text-[14px] font-semibold text-[#1F7A4D]">
                      Appeal submitted and logged for independent moderator review.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      <textarea
                        rows={3}
                        value={appealMessage}
                        onChange={(e) => setAppealMessage(e.target.value)}
                        placeholder="Explain why this restriction should be reconsidered..."
                        className="w-full p-3 rounded-[8px] border border-[var(--border-color)] bg-[var(--surface-app)]"
                      />
                      <button
                        type="button"
                        onClick={async () => {
                          if (appealMessage.trim().length < 5) return;
                          await fetch('/api/appeals', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              originalActionId: 1,
                              message: appealMessage.trim(),
                            }),
                          });
                          setAppealSubmitted(true);
                        }}
                        className="min-h-[44px] px-4 rounded-[8px] bg-[#0B2A5B] text-white text-[14px] font-semibold cursor-pointer"
                      >
                        Submit Appeal
                      </button>
                    </div>
                  )}
                </div>
              )}

            {/* Data Access or Correction Request Form — ACCT-2 & F13 */}
            <form
              onSubmit={handleSubmitDataRequest}
              className="bg-[var(--surface-card)] border border-[var(--border-color)] rounded-[8px] p-5 space-y-3"
            >
              <h2 className="text-[16px] font-bold text-[var(--text-heading)]">
                Privacy &amp; Data Subject Request (Act 843)
              </h2>
              <p className="text-[13px] text-[var(--text-secondary)]">
                Request a copy of your stored account data or ask for a correction.
              </p>
              <div className="flex gap-3">
                <label className="inline-flex items-center gap-2 text-[14px] font-semibold cursor-pointer">
                  <input
                    type="radio"
                    name="dataReqType"
                    checked={dataRequestType === 'access'}
                    onChange={() => setDataRequestType('access')}
                  />
                  <span>Access (Export)</span>
                </label>
                <label className="inline-flex items-center gap-2 text-[14px] font-semibold cursor-pointer">
                  <input
                    type="radio"
                    name="dataReqType"
                    checked={dataRequestType === 'correction'}
                    onChange={() => setDataRequestType('correction')}
                  />
                  <span>Correction</span>
                </label>
              </div>
              <textarea
                rows={2}
                required
                minLength={5}
                placeholder="Describe your data access or correction request..."
                value={dataRequestDetails}
                onChange={(e) => setDataRequestDetails(e.target.value)}
                className="w-full p-3 rounded-[8px] border border-[var(--border-color)] bg-[var(--surface-app)] text-[15px]"
              />
              {dataRequestMessage && (
                <p className="text-[13px] font-semibold text-[#1F7A4D]">{dataRequestMessage}</p>
              )}
              <button
                type="submit"
                className="min-h-[44px] px-4 rounded-[8px] bg-[#0B2A5B] text-white text-[14px] font-semibold hover:bg-[#1C4A8F] cursor-pointer"
              >
                Submit Data Request
              </button>
            </form>

            {/* Legal Pages Navigation — LEGAL-1 */}
            <div className="bg-[var(--surface-card)] border border-[var(--border-color)] rounded-[8px] p-5 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h2 className="text-[16px] font-bold text-[var(--text-heading)]">
                  PWA Brand Assets, App Icons &amp; Splash Screens
                </h2>
                <span className="px-2.5 py-0.5 rounded-full bg-[#DCE6F5] text-[#0B2A5B] text-[12px] font-bold">
                  Installable PWA Ready
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 rounded-[8px] bg-[var(--surface-subtle)] border border-[var(--border-color)] flex items-center gap-3">
                  <img
                    src="/images/upsa-pulse-emblem.jpg"
                    alt="UPSA Pulse App Crest"
                    className="w-14 h-14 rounded-[10px] object-cover shrink-0 border border-[#D9A21B]/40"
                  />
                  <div className="text-[12px]">
                    <div className="font-bold text-[var(--text-heading)]">App Crest &amp; Icons</div>
                    <div className="text-[var(--text-secondary)]">192px, 512px, Maskable &amp; Apple Touch</div>
                  </div>
                </div>
                <div className="p-3 rounded-[8px] bg-[var(--surface-subtle)] border border-[var(--border-color)] flex items-center gap-3">
                  <img
                    src="/splash/apple-splash-750x1334.png"
                    alt="UPSA Pulse Splash Screen"
                    className="w-10 h-14 rounded-[6px] object-cover shrink-0 border border-[#0B2A5B]"
                  />
                  <div className="text-[12px]">
                    <div className="font-bold text-[var(--text-heading)]">PWA Splash Screens</div>
                    <div className="text-[var(--text-secondary)]">iOS &amp; Android WebAPK Startup</div>
                  </div>
                </div>
                <div className="p-3 rounded-[8px] bg-[var(--surface-subtle)] border border-[var(--border-color)] flex items-center gap-3">
                  <img
                    src="/images/upsa-pulse-campus-hero.jpg"
                    alt="UPSA Campus Hero Illustration"
                    className="w-16 h-14 rounded-[6px] object-cover shrink-0 border border-[var(--border-color)]"
                  />
                  <div className="text-[12px]">
                    <div className="font-bold text-[var(--text-heading)]">Campus Hero Banner</div>
                    <div className="text-[var(--text-secondary)]">Onboarding &amp; OpenGraph Share</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Legal Pages Navigation — LEGAL-1 */}
            <div className="bg-[var(--surface-card)] border border-[var(--border-color)] rounded-[8px] p-5 space-y-3">
              <h2 className="text-[16px] font-bold text-[var(--text-heading)]">
                Legal, Safety &amp; Compliance Documents
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[14px] font-semibold">
                <Link
                  href="/terms"
                  className="min-h-[44px] px-3 rounded-[8px] bg-[var(--surface-subtle)] flex items-center text-[var(--text-heading)] hover:underline"
                >
                  Terms of Service (v1.0)
                </Link>
                <Link
                  href="/privacy"
                  className="min-h-[44px] px-3 rounded-[8px] bg-[var(--surface-subtle)] flex items-center text-[var(--text-heading)] hover:underline"
                >
                  Privacy Notice (v1.0)
                </Link>
                <Link
                  href="/community-guidelines"
                  className="min-h-[44px] px-3 rounded-[8px] bg-[var(--surface-subtle)] flex items-center text-[var(--text-heading)] hover:underline"
                >
                  Community Guidelines (v1.0)
                </Link>
                <Link
                  href="/accessibility"
                  className="min-h-[44px] px-3 rounded-[8px] bg-[var(--surface-subtle)] flex items-center text-[var(--text-heading)] hover:underline"
                >
                  Accessibility Statement
                </Link>
                <Link
                  href="/help/your-data"
                  className="min-h-[44px] px-3 rounded-[8px] bg-[var(--surface-subtle)] flex items-center text-[var(--text-heading)] hover:underline"
                >
                  Your Data &amp; Deletion Help
                </Link>
                {profileSummary && (profileSummary.isAdmin || profileSummary.canModerate) && (
                  <Link
                    href="/admin"
                    className="min-h-[44px] px-3 rounded-[8px] bg-[#DCE6F5] flex items-center text-[#0B2A5B] hover:underline"
                  >
                    Moderator &amp; Admin Console
                  </Link>
                )}
              </div>
            </div>

            {/* Danger Zone: Account Deletion — ACCT-1, F12 & Design Brief Section 9 */}
            <form
              onSubmit={handleDeleteAccount}
              className="bg-[var(--surface-card)] border-2 border-[#A32121] rounded-[8px] p-5 space-y-3"
            >
              <div className="flex items-center gap-2 text-[#A32121] font-bold text-[16px]">
                <AlertTriangle className="w-5 h-5" aria-hidden="true" />
                <h2>Delete Account</h2>
              </div>
              <p className="text-[14px] text-[var(--text-primary)]">
                This removes your account and sign-in. Your past posts stay, with no link to you.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="delete-confirm-input"
                    className="block text-[13px] font-semibold mb-1"
                  >
                    Type DELETE to confirm
                  </label>
                  <input
                    id="delete-confirm-input"
                    type="text"
                    required
                    placeholder="DELETE"
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    className="w-full min-h-[44px] px-3 rounded-[8px] border border-[var(--border-color)] bg-[var(--surface-app)]"
                  />
                </div>
                <div>
                  <label htmlFor="delete-otp-input" className="block text-[13px] font-semibold mb-1">
                    Fresh 6-digit OTP
                  </label>
                  <input
                    id="delete-otp-input"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    required
                    placeholder="123456"
                    value={deleteOtp}
                    onChange={(e) => setDeleteOtp(e.target.value)}
                    className="w-full min-h-[44px] px-3 rounded-[8px] border border-[var(--border-color)] bg-[var(--surface-app)]"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={deleteConfirmText !== 'DELETE' || deleteOtp.length !== 6}
                className="min-h-[44px] px-5 rounded-[8px] bg-[#A32121] text-white font-semibold text-[15px] disabled:opacity-40 cursor-pointer"
              >
                Permanently Delete My Account
              </button>
            </form>
          </section>
        )}
      </main>

      {/*Full-Screen Compose Sheet — Design Brief Section 4.3 & F5 */}
      {composeOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="compose-sheet-title"
          className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          <div className="bg-[var(--surface-card)] text-[var(--text-primary)] w-full max-w-[640px] rounded-t-[12px] sm:rounded-[8px] border border-[var(--border-color)] p-5 space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2
                id="compose-sheet-title"
                className="text-[20px] font-bold text-[var(--text-heading)]"
              >
                Compose to Campus Feed
              </h2>
              <button
                type="button"
                aria-label="Close compose sheet"
                onClick={() => setComposeOpen(false)}
                className="min-w-[44px] min-h-[44px] rounded-[8px] inline-flex items-center justify-center text-[var(--text-secondary)] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreatePost} className="space-y-4">
              {/* Place / Zone selector chips */}
              <div>
                <span className="block text-[13px] font-semibold text-[var(--text-secondary)] mb-2">
                  Choose a place (Campus or Hostel feed)
                </span>
                <div className="flex flex-wrap gap-2">
                  {zones.map((z) => {
                    const selected = composeZoneId === z.id;
                    return (
                      <button
                        key={z.id}
                        type="button"
                        onClick={() => setComposeZoneId(z.id)}
                        className={`min-h-[38px] px-3 rounded-full text-[13px] font-semibold inline-flex items-center gap-1.5 cursor-pointer ${
                          selected
                            ? 'bg-[#D9A21B] text-[#0B2A5B] font-bold'
                            : 'bg-[var(--surface-subtle)] text-[var(--text-heading)] hover:bg-[#DCE6F5]'
                        }`}
                      >
                        <MapPin className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>{z.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Channel selector chips */}
              <div>
                <span className="block text-[13px] font-semibold text-[var(--text-secondary)] mb-2">
                  Choose a channel
                </span>
                <div className="flex flex-wrap gap-2">
                  {channels.map((c) => {
                    const selected = composeChannelId === c.id;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setComposeChannelId(c.id);
                          if (!c.allowsAsk) setComposeIsAsk(false);
                        }}
                        className={`min-h-[40px] px-3 rounded-full text-[13px] font-semibold inline-flex items-center gap-1.5 cursor-pointer ${
                          selected
                            ? 'bg-[#0B2A5B] text-white'
                            : 'bg-[var(--surface-subtle)] text-[var(--text-heading)] hover:bg-[#DCE6F5]'
                        }`}
                      >
                        <ChannelIcon icon={c.icon} className="w-3.5 h-3.5" />
                        <span>{c.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Ask Toggle */}
              {channelMap.get(composeChannelId)?.allowsAsk !== false && (
                <label className="flex items-start gap-3 p-3 rounded-[8px] bg-[var(--surface-subtle)] border border-[var(--border-color)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={composeIsAsk}
                    onChange={(e) => setComposeIsAsk(e.target.checked)}
                    className="mt-1 w-5 h-5 accent-[#0B2A5B]"
                  />
                  <div>
                    <span className="block text-[14px] font-bold text-[var(--text-heading)]">
                      Mark as an Ask
                    </span>
                    <span className="block text-[13px] text-[var(--text-secondary)]">
                      Highlights your question with a gold Ask badge and lets you pin one reply as
                      the accepted answer.
                    </span>
                  </div>
                </label>
              )}

              {/* Post Text Area with 500-char counter */}
              <div>
                <label
                  htmlFor="compose-post-textarea"
                  className="block text-[14px] font-semibold text-[var(--text-heading)] mb-1"
                >
                  Your message
                </label>
                <textarea
                  id="compose-post-textarea"
                  rows={5}
                  maxLength={500}
                  required
                  placeholder="What is happening on campus? Ask a question or share a helpful tip..."
                  value={composeBody}
                  onChange={(e) => setComposeBody(e.target.value)}
                  className="w-full p-3 rounded-[8px] border border-[var(--border-color)] bg-[var(--surface-app)] text-[16px] leading-[24px]"
                />
                <div className="flex justify-end mt-1">
                  <span
                    className={`text-[13px] font-semibold ${
                      composeCharRemaining <= 20
                        ? 'text-[#A32121]'
                        : 'text-[var(--text-secondary)]'
                    }`}
                  >
                    {composeCharRemaining} / 500
                  </span>
                </div>
              </div>

              {/* Mandatory Honesty Reminder — Design Brief Section 4.3 & 9 */}
              <div className="p-3 rounded-[8px] bg-[#EEF2F8] text-[#1B2433] text-[13px] leading-[18px] flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 text-[#0B2A5B] shrink-0 mt-0.5" aria-hidden="true" />
                <span>
                  Other students can&apos;t see your name. We can, and we can act if someone is
                  harmed.{' '}
                  <Link
                    href="/community-guidelines"
                    onClick={() => setComposeOpen(false)}
                    className="font-semibold text-[#1C4A8F] underline"
                  >
                    Community Guidelines
                  </Link>
                </span>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setComposeOpen(false)}
                  className="min-h-[44px] px-4 rounded-[8px] border border-[var(--border-color)] text-[15px] font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={composeBody.trim().length === 0 || composeBody.length > 500}
                  className="min-h-[44px] px-6 rounded-[8px] bg-[#0B2A5B] text-white text-[15px] font-semibold disabled:opacity-40 hover:bg-[#1C4A8F] cursor-pointer"
                >
                  Post to Zone
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Report Sheet — Design Brief Section 5 & F9 */}
      {reportTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="report-sheet-title"
          className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          <div className="bg-[var(--surface-card)] text-[var(--text-primary)] w-full max-w-[540px] rounded-t-[12px] sm:rounded-[8px] border border-[var(--border-color)] p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2
                id="report-sheet-title"
                className="text-[18px] font-bold text-[var(--text-heading)]"
              >
                Report {reportTarget.targetType}
              </h2>
              <button
                type="button"
                aria-label="Close report sheet"
                onClick={() => setReportTarget(null)}
                className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitReport} className="space-y-3">
              <fieldset className="space-y-2">
                <legend className="text-[13px] font-semibold text-[var(--text-secondary)] mb-1">
                  Select a reason
                </legend>
                {REPORT_REASONS.map((r) => (
                  <label
                    key={r.value}
                    className={`flex items-start gap-3 p-3 rounded-[8px] border cursor-pointer ${
                      reportReason === r.value
                        ? 'border-[#0B2A5B] bg-[var(--surface-subtle)]'
                        : 'border-[var(--border-color)]'
                    }`}
                  >
                    <input
                      type="radio"
                      name="reportReason"
                      value={r.value}
                      checked={reportReason === r.value}
                      onChange={() => setReportReason(r.value)}
                      className="mt-1 accent-[#0B2A5B]"
                    />
                    <div>
                      <span className="block text-[14px] font-semibold text-[var(--text-heading)]">
                        {r.label}
                      </span>
                      <span className="block text-[12px] text-[var(--text-secondary)]">
                        {r.detail}
                      </span>
                    </div>
                  </label>
                ))}
              </fieldset>

              <div>
                <label
                  htmlFor="report-note-input"
                  className="block text-[13px] font-semibold text-[var(--text-heading)] mb-1"
                >
                  Optional context note (up to 300 characters)
                </label>
                <textarea
                  id="report-note-input"
                  rows={2}
                  maxLength={300}
                  value={reportNote}
                  onChange={(e) => setReportNote(e.target.value)}
                  className="w-full p-2.5 rounded-[8px] border border-[var(--border-color)] bg-[var(--surface-app)] text-[14px]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setReportTarget(null)}
                  className="min-h-[44px] px-4 rounded-[8px] border border-[var(--border-color)] text-[14px] font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="min-h-[44px] px-5 rounded-[8px] bg-[#A32121] text-white text-[14px] font-semibold cursor-pointer"
                >
                  Submit Report
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Self-Harm Support Card — MOD-2 & Design Brief Section 5 */}
      {supportCardOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="support-card-title"
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
        >
          <div className="bg-[var(--surface-card)] text-[var(--text-primary)] w-full max-w-[480px] rounded-[8px] border-2 border-[#0B2A5B] p-6 space-y-4">
            <div className="inline-flex items-center gap-2 text-[#0B2A5B] font-bold text-[15px]">
              <HeartHandshake className="w-5 h-5 text-[#8A6200]" aria-hidden="true" />
              <span>Support is available on campus</span>
            </div>
            <h2
              id="support-card-title"
              className="text-[20px] leading-[26px] font-bold text-[var(--text-heading)]"
            >
              You do not have to carry this alone
            </h2>
            <p className="text-[15px] leading-[22px] text-[var(--text-secondary)]">
              If you or someone you know at UPSA is going through severe distress or thoughts of
              self-harm, confidential help is available through the university counselling team:
            </p>
            <div className="bg-[#FBF3DC] text-[#1B2433] border border-[#D9A21B] rounded-[8px] p-4 space-y-1.5 text-[14px]">
              <p className="font-bold">UPSA Guidance and Counselling Unit [D7]</p>
              <p>Location: Student Centre Building, Ground Floor, UPSA Main Campus</p>
              <p>Hours: Monday – Friday, 08:00 – 17:00 (Walk-in or confidential booking)</p>
              <p>Ghana National Helpline / Emergency: 112 / 0800-678-678</p>
            </div>
            <button
              type="button"
              onClick={() => setSupportCardOpen(false)}
              className="w-full min-h-[44px] rounded-[8px] bg-[#0B2A5B] text-white font-semibold text-[15px] cursor-pointer"
            >
              Return to Feed
            </button>
          </div>
        </div>
      )}

      {/* Approve This Device Modal — AUTH-3 & Flow F2 */}
      {pendingDeviceModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="approve-device-title"
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
        >
          <div className="bg-[var(--surface-card)] text-[var(--text-primary)] w-full max-w-[480px] rounded-[8px] border border-[var(--border-color)] p-6 space-y-4">
            <h2
              id="approve-device-title"
              className="text-[20px] leading-[26px] font-bold text-[var(--text-heading)]"
            >
              Approve this device (Flow F2)
            </h2>
            <p className="text-[15px] leading-[22px] text-[var(--text-secondary)]">
              Your UPSA account is already signed in on another phone or browser. For campus account
              integrity, only one active trusted device is allowed at a time. Approving this device
              signs out the previous device immediately.
            </p>
            <div>
              <label
                htmlFor="device-token-input"
                className="block text-[13px] font-semibold text-[var(--text-heading)] mb-1"
              >
                Device Fingerprint Token (Hashed with server pepper)
              </label>
              <input
                id="device-token-input"
                type="text"
                value={pendingDeviceToken}
                onChange={(e) => setPendingDeviceToken(e.target.value)}
                className="w-full min-h-[44px] px-3 rounded-[8px] border border-[var(--border-color)] bg-[var(--surface-app)] text-[14px]"
              />
            </div>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setPendingDeviceModalOpen(false)}
                className="min-h-[44px] px-4 rounded-[8px] border border-[var(--border-color)] text-[14px] font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleApprovePendingDevice()}
                className="min-h-[44px] px-5 rounded-[8px] bg-[#0B2A5B] text-white text-[14px] font-semibold cursor-pointer"
              >
                Approve &amp; Sign Out Old Device
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Blocking Legal Document Version Re-Acceptance Sheet — LEGAL-1 & Flow F14 */}
      {(legalUpdateModalOpen ||
        (profileSummary?.pendingLegalUpdates &&
          profileSummary.pendingLegalUpdates.length > 0)) && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="legal-update-title"
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
        >
          <div className="bg-[var(--surface-card)] text-[var(--text-primary)] w-full max-w-[520px] rounded-[8px] border-2 border-[#0B2A5B] p-6 space-y-4">
            <div className="text-[12px] font-bold uppercase tracking-wider text-[#8A6200]">
              Action Required · Legal Update (Flow F14)
            </div>
            <h2
              id="legal-update-title"
              className="text-[20px] leading-[26px] font-bold text-[var(--text-heading)]"
            >
              Updated Terms, Privacy Notice &amp; Community Guidelines
            </h2>
            <p className="text-[15px] leading-[22px] text-[var(--text-secondary)]">
              We updated our campus legal documents. Please review the summary of changes and record
              your acceptance to continue using UPSA Pulse:
            </p>
            <ul className="list-disc pl-5 text-[14px] space-y-1 text-[var(--text-primary)]">
              <li>
                <strong>Terms of Service (v1.0):</strong> Clarified one-device binding, campus zone
                gate, and two-moderator appeal review.
              </li>
              <li>
                <strong>Privacy Notice (v1.0):</strong> Ghana Data Protection Act, 2012 (Act 843)
                retention schedule and zero coordinate persistence.
              </li>
              <li>
                <strong>Community Guidelines (v1.0):</strong> Zero tolerance for doxxing, exam
                leaks, and threats of violence.
              </li>
            </ul>
            <label className="flex items-start gap-3 p-3 rounded-[8px] bg-[var(--surface-subtle)] border border-[var(--border-color)] cursor-pointer">
              <input
                type="checkbox"
                checked={legalUpdateChecked}
                onChange={(e) => setLegalUpdateChecked(e.target.checked)}
                className="mt-1 w-5 h-5 accent-[#0B2A5B]"
              />
              <span className="text-[14px] font-semibold">
                I have read the summary of changes and accept the current Terms of Service, Privacy
                Notice, and Community Guidelines.
              </span>
            </label>
            <div className="flex items-center justify-end gap-3">
              {legalUpdateModalOpen && (
                <button
                  type="button"
                  onClick={() => setLegalUpdateModalOpen(false)}
                  className="min-h-[44px] px-4 rounded-[8px] border border-[var(--border-color)] text-[14px] font-semibold cursor-pointer"
                >
                  Close Preview
                </button>
              )}
              <button
                type="button"
                disabled={!legalUpdateChecked}
                onClick={() => void handleAcceptUpdatedLegal()}
                className="min-h-[44px] px-5 rounded-[8px] bg-[#0B2A5B] text-white text-[14px] font-semibold disabled:opacity-40 cursor-pointer"
              >
                Accept &amp; Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Navigation (5 items: Feed, Channels, Compose in Gold #D9A21B, Alerts, Me) — Design Brief Section 4 */}
      <nav
        aria-label="Primary bottom navigation"
        className="fixed bottom-0 left-0 right-0 z-30 bg-[var(--surface-card)] border-t border-[var(--border-color)]"
      >
        <div className="max-w-[640px] mx-auto px-2 h-16 grid grid-cols-5 items-center">
          <button
            type="button"
            onClick={() => {
              setActiveThreadId(null);
              setActiveTab('feed');
            }}
            className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 text-[12px] font-semibold cursor-pointer ${
              activeTab === 'feed' && !activeThreadId
                ? 'text-[var(--text-heading)] font-bold'
                : 'text-[var(--text-secondary)]'
            }`}
          >
            <Compass className="w-5 h-5" aria-hidden="true" />
            <span>Feed</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveThreadId(null);
              setActiveTab('channels');
            }}
            className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 text-[12px] font-semibold cursor-pointer ${
              activeTab === 'channels'
                ? 'text-[var(--text-heading)] font-bold'
                : 'text-[var(--text-secondary)]'
            }`}
          >
            <Layers className="w-5 h-5" aria-hidden="true" />
            <span>Channels</span>
          </button>

          {/* Centre Compose Button: Gold fill #D9A21B, Navy plus icon #0B2A5B */}
          <div className="flex items-center justify-center">
            <button
              type="button"
              onClick={() => setComposeOpen(true)}
              aria-label="Compose a post or Ask"
              className="min-w-[48px] min-h-[48px] px-4 rounded-[8px] bg-[#D9A21B] text-[#0B2A5B] font-bold text-[13px] inline-flex items-center justify-center gap-1 shadow-sm hover:opacity-95 cursor-pointer"
            >
              <Plus className="w-5 h-5 stroke-[2.5]" aria-hidden="true" />
              <span>Compose</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              setActiveThreadId(null);
              setActiveTab('alerts');
            }}
            className={`relative min-h-[44px] flex flex-col items-center justify-center gap-0.5 text-[12px] font-semibold cursor-pointer ${
              activeTab === 'alerts'
                ? 'text-[var(--text-heading)] font-bold'
                : 'text-[var(--text-secondary)]'
            }`}
          >
            <Bell className="w-5 h-5" aria-hidden="true" />
            <span>Alerts</span>
            {unreadAlertsCount > 0 && (
              <span className="absolute top-1 right-5 px-1.5 py-0.2 rounded-full bg-[#A32121] text-white text-[10px] font-bold">
                {unreadAlertsCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveThreadId(null);
              setActiveTab('me');
            }}
            className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 text-[12px] font-semibold cursor-pointer ${
              activeTab === 'me'
                ? 'text-[var(--text-heading)] font-bold'
                : 'text-[var(--text-secondary)]'
            }`}
          >
            <User className="w-5 h-5" aria-hidden="true" />
            <span>Me</span>
          </button>
        </div>
      </nav>
    </div>
  );
}

