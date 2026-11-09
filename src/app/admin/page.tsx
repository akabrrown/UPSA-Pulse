'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Shield, Lock, AlertCircle, CheckCircle2, Search, Scale, Sliders, Plus } from 'lucide-react';
import { ChannelIcon } from '@/components/pulse/ChannelIcon';

interface QueueItem {
  targetType: 'post' | 'reply';
  targetId: string;
  postId: string;
  channelId: number;
  aliasLabel: string;
  body: string;
  status: string;
  hiddenReason: string | null;
  reportCount: number;
  reportReasons: string[];
  priority: 'P1' | 'P2';
  createdAt: string;
  conflictOfInterest: boolean;
}

interface AdminConfigSummary {
  zones: Array<{ id: number; name: string; maxAccuracyMeters: number; isActive: boolean }>;
  channels: Array<{
    id: number;
    slug: string;
    name: string;
    description?: string;
    icon?: string;
    sortOrder?: number;
    allowsAsk: boolean;
    isActive: boolean;
  }>;
  allowedDomains: string[];
  keywordRules: Array<{ id: number; pattern: string; matchType: string; category: string }>;
  auditLogCount?: number;
  openAppeals?: Array<{
    id: number;
    original_action_id: number;
    message: string;
    status: string;
    created_at: string;
  }>;
  unmaskRequests?: Array<{
    id: number;
    post_id: string;
    requested_by: string;
    approved_by: string | null;
    basis: string;
    reference: string;
    reason: string;
    status: string;
    created_at: string;
  }>;
}

export default function AdminQueuePage() {
  const [currentUser, setCurrentUser] = useState<{
    id?: string;
    username?: string | null;
    isAdmin: boolean;
    canModerate: boolean;
  } | null>(null);
  const [authChecked, setAuthChecked] = useState<boolean>(false);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [reasonMap, setReasonMap] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<string | null>(null);
  const [newKeywordPattern, setNewKeywordPattern] = useState<string>('');
  const [newKeywordCategory, setNewKeywordCategory] = useState<string>('exam_leak');
  const [newDomain, setNewDomain] = useState<string>('');
  const [maxAccuracyInput, setMaxAccuracyInput] = useState<number>(150);
  const [configSummary, setConfigSummary] = useState<AdminConfigSummary | null>(null);

  // New Campus Channel creation state (ADMIN-1)
  const [newChannelName, setNewChannelName] = useState<string>('');
  const [newChannelSlug, setNewChannelSlug] = useState<string>('');
  const [newChannelDescription, setNewChannelDescription] = useState<string>('');
  const [newChannelIcon, setNewChannelIcon] = useState<string>('briefcase');
  const [newChannelAllowsAsk, setNewChannelAllowsAsk] = useState<boolean>(true);
  const [newChannelIsActive, setNewChannelIsActive] = useState<boolean>(true);

  // New Campus / Hostel Place GeoJSON creation state (ADMIN-1)
  const [newPlaceName, setNewPlaceName] = useState<string>('');
  const [newPlaceAccuracy, setNewPlaceAccuracy] = useState<number>(150);
  const [newPlaceGeoJson, setNewPlaceGeoJson] = useState<string>('');

  // Case Lookup state (ADMIN-1)
  const [lookupPostId, setLookupPostId] = useState<string>('a0000000-0000-4000-8000-000000000001');
  const [lookupAliasNo, setLookupAliasNo] = useState<number>(0);
  const [lookupResult, setLookupResult] = useState<Record<string, unknown> | null>(null);

  // Appeal Review state (F15)
  const [appealIdInput, setAppealIdInput] = useState<string>('');
  const [appealNoteInput, setAppealNoteInput] = useState<string>('');

  // Two-person Unmask state (MOD-3 / F16)
  const [unmaskPostId, setUnmaskPostId] = useState<string>('a0000000-0000-4000-8000-000000000001');
  const [unmaskBasis, setUnmaskBasis] = useState<
    'legal_request' | 'credible_threat' | 'upsa_disciplinary_referral'
  >('credible_threat');
  const [unmaskReference, setUnmaskReference] = useState<string>('CASE-UPSA-2026-09');
  const [unmaskReason, setUnmaskReason] = useState<string>(
    'Imminent physical safety escalation requiring two-holder review.'
  );
  const [unmaskApproveId, setUnmaskApproveId] = useState<string>('');
  const [unmaskOutcome, setUnmaskOutcome] = useState<string | null>(null);

  useEffect(() => {
    async function verifyAdminAuth() {
      try {
        const res = await fetch('/api/me');
        const json = await res.json();
        if (res.ok && json.success && json.data.profile) {
          if (json.data.profile.isAdmin || json.data.profile.canModerate) {
            setCurrentUser(json.data.profile);
            setAuthChecked(true);
            return;
          }
        }
      } catch {
        // auth failed
      }
      setCurrentUser(null);
      setAuthChecked(true);
    }
    void verifyAdminAuth();
  }, []);

  const loadQueueAndConfig = useCallback(async () => {
    setLoading(true);
    try {
      const [qRes, cRes] = await Promise.all([
        fetch('/api/admin/queue'),
        fetch('/api/admin/config'),
      ]);
      const qJson = await qRes.json();
      const cJson = await cRes.json();
      if (qRes.ok && qJson.success) {
        setQueue(qJson.data.items ?? []);
      }
      if (cRes.ok && cJson.success) {
        setConfigSummary(cJson.data);
        if (cJson.data.zones?.[0]?.maxAccuracyMeters) {
          setMaxAccuracyInput(cJson.data.zones[0].maxAccuracyMeters);
        }
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authChecked && currentUser && (currentUser.isAdmin || currentUser.canModerate)) {
      void loadQueueAndConfig();
    }
  }, [authChecked, currentUser, loadQueueAndConfig]);

  const handleAction = async (
    item: QueueItem,
    action: 'restore' | 'remove' | 'suspend' | 'ban'
  ) => {
    const reason = (reasonMap[item.targetId] ?? '').trim();
    if (reason.length < 5) {
      setFeedback('A mandatory reason of at least 5 characters is required for every moderation action.');
      return;
    }

    const res = await fetch('/api/admin/actions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        targetType: item.targetType,
        targetId: item.targetId,
        action,
        reason,
        suspendDays: action === 'suspend' ? 7 : undefined,
      }),
    });
    const json = await res.json();
    if (res.ok && json.success) {
      setFeedback(`Action "${action}" logged to append-only moderation_actions table.`);
      void loadQueueAndConfig();
    } else {
      setFeedback(json.error?.message ?? 'Action could not be completed.');
    }
  };

  const handleAddKeywordRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeywordPattern.trim()) return;
    const res = await fetch('/api/admin/config', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        section: 'keyword_rule',
        payload: {
          pattern: newKeywordPattern.trim(),
          matchType: 'contains',
          category: newKeywordCategory,
        },
      }),
    });
    if (res.ok) {
      setNewKeywordPattern('');
      setFeedback('Keyword pre-screen rule added and logged in audit_logs.');
      void loadQueueAndConfig();
    }
  };

  const handleAddAllowedDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDomain.trim()) return;
    const res = await fetch('/api/admin/config', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        section: 'allowed_domain',
        payload: { domain: newDomain.trim().toLowerCase() },
      }),
    });
    if (res.ok) {
      setNewDomain('');
      setFeedback('Allow-listed UPSA domain added and logged in audit_logs.');
      void loadQueueAndConfig();
    }
  };

  const handleUpdateZoneAccuracy = async () => {
    const res = await fetch('/api/admin/config', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        section: 'zone',
        payload: { maxAccuracyMeters: Number(maxAccuracyInput) },
      }),
    });
    if (res.ok) {
      setFeedback(`Campus zone max GPS accuracy updated to ${maxAccuracyInput}m.`);
      void loadQueueAndConfig();
    }
  };

  const handleTogglePlaceActive = async (zoneId: number, isActive: boolean) => {
    const res = await fetch('/api/admin/config', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        section: 'zone',
        payload: { id: zoneId, isActive },
      }),
    });
    if (res.ok) {
      setFeedback('Place boundary status updated and recorded in audit_logs.');
      void loadQueueAndConfig();
    }
  };

  const handleAddGeoJsonPlace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlaceName.trim() || !newPlaceGeoJson.trim()) return;
    const res = await fetch('/api/admin/config', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        section: 'zone',
        payload: {
          name: newPlaceName.trim(),
          maxAccuracyMeters: Number(newPlaceAccuracy) || 150,
          geojson: newPlaceGeoJson.trim(),
          isActive: true,
        },
      }),
    });
    if (res.ok) {
      setFeedback(`Place "${newPlaceName.trim()}" added with GeoJSON polygon boundary.`);
      setNewPlaceName('');
      setNewPlaceGeoJson('');
      void loadQueueAndConfig();
    } else {
      setFeedback('Could not parse GeoJSON polygon. Paste a valid Feature or Polygon from geojson.io.');
    }
  };

  const handleToggleChannel = async (
    channelId: number,
    patch: { isActive?: boolean; allowsAsk?: boolean; sortOrder?: number }
  ) => {
    const res = await fetch('/api/admin/config', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        section: 'channel',
        payload: { id: channelId, ...patch },
      }),
    });
    if (res.ok) {
      setFeedback('Channel configuration updated and recorded in audit_logs.');
      void loadQueueAndConfig();
    }
  };

  const handleCreateChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChannelName.trim()) return;
    const res = await fetch('/api/admin/config', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        section: 'channel',
        payload: {
          name: newChannelName.trim(),
          slug: newChannelSlug.trim() || undefined,
          description: newChannelDescription.trim(),
          icon: newChannelIcon,
          allowsAsk: newChannelAllowsAsk,
          isActive: newChannelIsActive,
        },
      }),
    });
    if (res.ok) {
      setNewChannelName('');
      setNewChannelSlug('');
      setNewChannelDescription('');
      setFeedback(`Campus channel "${newChannelName.trim()}" added and logged in audit_logs.`);
      void loadQueueAndConfig();
    }
  };

  const handleQuickAddPresetChannel = async (preset: {
    name: string;
    slug: string;
    description: string;
    icon: string;
    allowsAsk: boolean;
  }) => {
    const res = await fetch('/api/admin/config', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        section: 'channel',
        payload: {
          ...preset,
          isActive: true,
        },
      }),
    });
    if (res.ok) {
      setFeedback(`Added preset campus channel "${preset.name}".`);
      void loadQueueAndConfig();
    }
  };

  const handleCaseLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch(
      `/api/admin/lookup?postId=${encodeURIComponent(lookupPostId.trim())}&aliasNo=${lookupAliasNo}`
    );
    const json = await res.json();
    if (res.ok && json.success) {
      setLookupResult(json.data);
    } else {
      setFeedback(json.error?.message ?? 'Case lookup failed.');
    }
  };

  const handleDecideAppeal = async (decision: 'upheld' | 'rejected') => {
    const appealId = Number(appealIdInput);
    if (!appealId || appealNoteInput.trim().length < 5) {
      setFeedback('Enter a valid Appeal ID and a decision note of at least 5 characters.');
      return;
    }
    const res = await fetch('/api/appeals', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        appealId,
        decision,
        note: appealNoteInput.trim(),
      }),
    });
    const json = await res.json();
    if (res.ok && json.success) {
      setFeedback(`Appeal #${appealId} marked as ${decision}.`);
      setAppealIdInput('');
      setAppealNoteInput('');
      void loadQueueAndConfig();
    } else {
      setFeedback(json.error?.message ?? 'Could not decide appeal.');
    }
  };

  const handleRequestUnmask = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/admin/unmask', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'request',
        postId: unmaskPostId.trim(),
        basis: unmaskBasis,
        reference: unmaskReference.trim(),
        reason: unmaskReason.trim(),
      }),
    });
    const json = await res.json();
    if (res.ok && json.success) {
      setUnmaskOutcome(`Unmask request #${json.data.requestId} created (status: pending second holder).`);
      void loadQueueAndConfig();
    } else {
      setUnmaskOutcome(json.error?.message ?? 'Unmask request blocked by policy.');
    }
  };

  const handleApproveUnmask = async () => {
    const reqId = Number(unmaskApproveId);
    if (!reqId) return;
    const res = await fetch('/api/admin/unmask', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'approve',
        requestId: reqId,
      }),
    });
    const json = await res.json();
    if (res.ok && json.success) {
      setUnmaskOutcome(
        `Approved request #${reqId}. Disclosed identity: ${JSON.stringify(json.data.disclosedIdentity)}`
      );
      void loadQueueAndConfig();
    } else {
      setUnmaskOutcome(json.error?.message ?? 'Two-person approval failed.');
    }
  };

  return (
    <div className="min-h-screen bg-[var(--surface-app)] text-[var(--text-primary)]">
      <header className="bg-[#0B2A5B] text-white border-b border-[#1C4A8F]">
        <div className="max-w-5xl mx-auto px-4 py-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Shield className="w-5 h-5 text-[#D9A21B]" aria-hidden="true" />
            <div>
              <h1 className="font-bold text-[18px]">UPSA Pulse · Moderation &amp; Admin Console</h1>
              <p className="text-[12px] text-[#DCE6F5]">
                Aliases only · Author identity is never exposed in moderation views
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-[6px] bg-[#133875] text-[#DCE6F5] text-[12px] font-semibold border border-[#2C599D]">
              <Shield className="w-3.5 h-3.5 text-[#D9A21B]" aria-hidden="true" />
              <span>
                @{currentUser?.username ?? 'staff'} ({currentUser?.isAdmin ? 'Administrator' : 'Moderator'})
              </span>
            </div>
            <Link
              href="/"
              className="min-h-[44px] px-3 inline-flex items-center font-semibold text-[14px] text-[#D9A21B] hover:underline"
            >
              Back to Campus Feed
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {feedback && (
          <div
            role="status"
            className="bg-[#EEF2F8] border border-[#1C4A8F] text-[#0B2A5B] px-4 py-3 rounded-[8px] flex items-center justify-between text-[14px] font-semibold"
          >
            <span>{feedback}</span>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="min-h-[36px] px-2 text-[#1C4A8F] underline cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Moderation Queue Section — MOD-1 & F10 */}
        <section className="bg-[var(--surface-card)] border border-[var(--border-color)] rounded-[8px] p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 className="text-[18px] font-bold text-[var(--text-heading)]">
                Moderation Queue (Priority P1 first, then oldest)
              </h2>
              <p className="text-[13px] text-[var(--text-secondary)]">
                P1 target: 2 hours (07:00–23:00) · P2 target: 24 hours. Every action requires a
                mandatory reason and writes an append-only audit record.
              </p>
            </div>
            <span className="px-3 py-1 rounded-full bg-[#DCE6F5] text-[#0B2A5B] text-[13px] font-bold">
              {queue.length} {queue.length === 1 ? 'item' : 'items'} in queue
            </span>
          </div>

          {loading ? (
            <p className="text-[15px] text-[var(--text-secondary)] py-4">Loading queue…</p>
          ) : queue.length === 0 ? (
            <div className="p-6 rounded-[8px] bg-[var(--surface-subtle)] text-center space-y-1">
              <CheckCircle2 className="w-6 h-6 text-[#1F7A4D] mx-auto" aria-hidden="true" />
              <p className="font-semibold text-[15px] text-[var(--text-heading)]">
                Queue is clear
              </p>
              <p className="text-[13px] text-[var(--text-secondary)]">
                No held, auto-hidden, or open reported items awaiting review.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {queue.map((item) => (
                <div
                  key={item.targetId}
                  className="border border-[var(--border-color)] rounded-[8px] p-4 space-y-3 bg-[var(--surface-app)]"
                >
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[12px] font-bold ${
                          item.priority === 'P1'
                            ? 'bg-[#A32121] text-white'
                            : 'bg-[#D9A21B] text-[#0B2A5B]'
                        }`}
                      >
                        {item.priority}
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-[#DCE6F5] text-[#0B2A5B] text-[12px] font-semibold">
                        Alias: {item.aliasLabel}
                      </span>
                      <span className="text-[13px] text-[var(--text-secondary)]">
                        Status: <strong>{item.status}</strong>
                        {item.hiddenReason ? ` (${item.hiddenReason})` : ''} · Reports:{' '}
                        <strong>{item.reportCount}</strong>
                      </span>
                    </div>
                    {item.conflictOfInterest && (
                      <span className="inline-flex items-center gap-1 text-[12px] font-bold text-[#A32121]">
                        <AlertCircle className="w-4 h-4" aria-hidden="true" />
                        <span>Conflict of interest: you participated in this thread</span>
                      </span>
                    )}
                  </div>

                  <p className="text-[15px] leading-[22px] bg-[var(--surface-card)] p-3 rounded-[8px] border border-[var(--border-color)]">
                    {item.body}
                  </p>

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <input
                      type="text"
                      placeholder="Mandatory reason (min 5 chars, e.g. Doxxing phone number removed)"
                      value={reasonMap[item.targetId] ?? ''}
                      onChange={(e) =>
                        setReasonMap((prev) => ({ ...prev, [item.targetId]: e.target.value }))
                      }
                      className="flex-1 min-h-[44px] px-3 rounded-[8px] border border-[var(--border-color)] bg-[var(--surface-card)] text-[14px]"
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={item.conflictOfInterest}
                        onClick={() => void handleAction(item, 'restore')}
                        className="min-h-[44px] px-3 rounded-[8px] bg-[#1F7A4D] text-white text-[13px] font-semibold disabled:opacity-40 cursor-pointer"
                      >
                        Restore
                      </button>
                      <button
                        type="button"
                        disabled={item.conflictOfInterest}
                        onClick={() => void handleAction(item, 'remove')}
                        className="min-h-[44px] px-3 rounded-[8px] bg-[#A32121] text-white text-[13px] font-semibold disabled:opacity-40 cursor-pointer"
                      >
                        Remove
                      </button>
                      <button
                        type="button"
                        disabled={item.conflictOfInterest}
                        onClick={() => void handleAction(item, 'suspend')}
                        className="min-h-[44px] px-3 rounded-[8px] bg-[#0B2A5B] text-white text-[13px] font-semibold disabled:opacity-40 cursor-pointer"
                      >
                        Suspend 7d
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* User Case Lookup by Post ID / Thread Alias (No Email Exposed) — ADMIN-1 */}
        <section className="bg-[var(--surface-card)] border border-[var(--border-color)] rounded-[8px] p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Search className="w-5 h-5 text-[#0B2A5B]" aria-hidden="true" />
            <div>
              <h2 className="text-[18px] font-bold text-[var(--text-heading)]">
                Case Lookup by Post ID &amp; Thread Alias (ADMIN-1)
              </h2>
              <p className="text-[13px] text-[var(--text-secondary)]">
                Inspect account standing and prior moderation actions for a post or thread alias without exposing the student&apos;s email address.
              </p>
            </div>
          </div>

          <form onSubmit={handleCaseLookup} className="flex flex-wrap gap-2">
            <input
              type="text"
              value={lookupPostId}
              onChange={(e) => setLookupPostId(e.target.value)}
              placeholder="Post UUID"
              className="flex-1 min-w-[240px] min-h-[44px] px-3 rounded-[8px] border border-[var(--border-color)] bg-[var(--surface-app)] text-[14px]"
            />
            <input
              type="number"
              min={0}
              max={500}
              value={lookupAliasNo}
              onChange={(e) => setLookupAliasNo(Number(e.target.value))}
              placeholder="Alias # (0 = OP)"
              className="w-32 min-h-[44px] px-3 rounded-[8px] border border-[var(--border-color)] bg-[var(--surface-app)] text-[14px]"
            />
            <button
              type="submit"
              className="min-h-[44px] px-4 rounded-[8px] bg-[#0B2A5B] text-white text-[14px] font-semibold cursor-pointer"
            >
              Lookup Case
            </button>
          </form>

          {lookupResult && (
            <pre className="p-3 rounded-[8px] bg-[var(--surface-subtle)] text-[12px] overflow-x-auto border border-[var(--border-color)]">
              {JSON.stringify(lookupResult, null, 2)}
            </pre>
          )}
        </section>

        {/* Appeals Review Queue (Two-Moderator Rule) — F15 */}
        <section className="bg-[var(--surface-card)] border border-[var(--border-color)] rounded-[8px] p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Scale className="w-5 h-5 text-[#0B2A5B]" aria-hidden="true" />
            <div>
              <h2 className="text-[18px] font-bold text-[var(--text-heading)]">
                Appeals Queue (F15 · Different Moderator Required)
              </h2>
              <p className="text-[13px] text-[var(--text-secondary)]">
                PostgreSQL enforces <code>same_moderator_cannot_review_appeal</code>: the moderator who issued the original action cannot decide its appeal.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <input
              type="number"
              min={1}
              placeholder="Appeal ID (e.g. 1)"
              value={appealIdInput}
              onChange={(e) => setAppealIdInput(e.target.value)}
              className="w-40 min-h-[44px] px-3 rounded-[8px] border border-[var(--border-color)] bg-[var(--surface-app)] text-[14px]"
            />
            <input
              type="text"
              placeholder="Decision note (min 5 chars)"
              value={appealNoteInput}
              onChange={(e) => setAppealNoteInput(e.target.value)}
              className="flex-1 min-w-[220px] min-h-[44px] px-3 rounded-[8px] border border-[var(--border-color)] bg-[var(--surface-app)] text-[14px]"
            />
            <button
              type="button"
              onClick={() => void handleDecideAppeal('upheld')}
              className="min-h-[44px] px-3 rounded-[8px] bg-[#1F7A4D] text-white text-[13px] font-semibold cursor-pointer"
            >
              Uphold Appeal (Restore)
            </button>
            <button
              type="button"
              onClick={() => void handleDecideAppeal('rejected')}
              className="min-h-[44px] px-3 rounded-[8px] bg-[#A32121] text-white text-[13px] font-semibold cursor-pointer"
            >
              Reject Appeal
            </button>
          </div>
        </section>

        {/* Zone, Channel & Domain Management — ADMIN-1 */}
        <section className="bg-[var(--surface-card)] border border-[var(--border-color)] rounded-[8px] p-5 space-y-5">
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-[#0B2A5B]" aria-hidden="true" />
            <h2 className="text-[18px] font-bold text-[var(--text-heading)]">
              Campus Zone, Channels, Keyword Rules &amp; Domains (ADMIN-1)
            </h2>
          </div>

          {/* Zone max accuracy control & Configured GeoJSON Places */}
          <div className="space-y-4">
            <div className="p-3.5 rounded-[8px] bg-[var(--surface-subtle)] flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-[14px]">
                  UPSA Campus &amp; Hostels — Max GPS Accuracy Gate (+ 25m Indoor Drift Buffer)
                </p>
                <p className="text-[12px] text-[var(--text-secondary)]">
                  Positions with accuracy worse than this threshold return <code>poor_accuracy</code>.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={25}
                  max={500}
                  value={maxAccuracyInput}
                  onChange={(e) => setMaxAccuracyInput(Number(e.target.value))}
                  className="w-24 min-h-[40px] px-2.5 rounded-[8px] border border-[var(--border-color)] bg-[var(--surface-card)] text-[14px]"
                />
                <span className="text-[13px]">meters</span>
                <button
                  type="button"
                  onClick={() => void handleUpdateZoneAccuracy()}
                  className="min-h-[40px] px-3 rounded-[8px] bg-[#0B2A5B] text-white text-[13px] font-semibold cursor-pointer"
                >
                  Save Zone Gate
                </button>
              </div>
            </div>

            {configSummary?.zones && (
              <div className="space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h3 className="text-[15px] font-bold text-[var(--text-heading)]">
                      Campus &amp; Hostel Places (GeoJSON Polygon Feeds)
                    </h3>
                    <p className="text-[12px] text-[var(--text-secondary)]">
                      Active places appear in the top Place Switcher bar alongside &ldquo;All {configSummary.zones.length} Feeds&rdquo;.
                    </p>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-[#DCE6F5] text-[#0B2A5B] text-[12px] font-bold">
                    {configSummary.zones.length} places configured
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {configSummary.zones.map((z) => (
                    <div
                      key={z.id}
                      className="p-3 rounded-[8px] border border-[var(--border-color)] bg-[var(--surface-app)] flex items-center justify-between gap-2 text-[13px]"
                    >
                      <div>
                        <div className="font-bold text-[var(--text-heading)]">
                          #{z.id} · {z.name}
                        </div>
                        <div className="text-[12px] text-[var(--text-secondary)]">
                          Max GPS accuracy: {z.maxAccuracyMeters}m · 25m buffer active
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleTogglePlaceActive(z.id, !z.isActive)}
                        className={`px-2.5 py-1 rounded font-semibold text-[12px] cursor-pointer ${
                          z.isActive ? 'bg-[#1F7A4D] text-white' : 'bg-[#A32121] text-white'
                        }`}
                      >
                        {z.isActive ? 'Active' : 'Disabled'}
                      </button>
                    </div>
                  ))}
                </div>

                {/* Add New Place via GeoJSON Polygon */}
                <form
                  onSubmit={handleAddGeoJsonPlace}
                  className="p-4 rounded-[8px] border border-[var(--border-color)] bg-[var(--surface-app)] space-y-3"
                >
                  <div className="text-[13px] font-bold text-[var(--text-heading)]">
                    Add New Campus / Hostel Place (Paste GeoJSON Polygon from geojson.io)
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <input
                      type="text"
                      required
                      placeholder="Place Name (e.g. Hostel D / Graduate Block)"
                      value={newPlaceName}
                      onChange={(e) => setNewPlaceName(e.target.value)}
                      className="sm:col-span-2 min-h-[42px] px-3 rounded-[8px] border border-[var(--border-color)] bg-[var(--surface-card)] text-[13px]"
                    />
                    <input
                      type="number"
                      min={25}
                      max={500}
                      value={newPlaceAccuracy}
                      onChange={(e) => setNewPlaceAccuracy(Number(e.target.value))}
                      placeholder="Max Accuracy (150m)"
                      className="min-h-[42px] px-3 rounded-[8px] border border-[var(--border-color)] bg-[var(--surface-card)] text-[13px]"
                    />
                  </div>
                  <textarea
                    rows={4}
                    required
                    placeholder='Paste GeoJSON Feature or Polygon here, e.g. {"type":"Feature","geometry":{"type":"Polygon","coordinates":[[[-0.168,5.658],...]]}}'
                    value={newPlaceGeoJson}
                    onChange={(e) => setNewPlaceGeoJson(e.target.value)}
                    className="w-full p-3 rounded-[8px] border border-[var(--border-color)] bg-[var(--surface-card)] font-mono text-[12px]"
                  />
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      className="min-h-[42px] px-4 rounded-[8px] bg-[#0B2A5B] text-white text-[13px] font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Plus className="w-4 h-4" aria-hidden="true" />
                      <span>Add Place Boundary &amp; Feed</span>
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>

          {/* Channels list & Add New Channel Options */}
          {configSummary?.channels && (
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h3 className="text-[15px] font-bold text-[var(--text-heading)]">
                    Campus Channels (Toggle Active / Ask Enabled / Add New Options)
                  </h3>
                  <p className="text-[12px] text-[var(--text-secondary)]">
                    Create custom campus channels, add one-click UPSA presets, reorder channels, or toggle Active and Ask support.
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-[#DCE6F5] text-[#0B2A5B] text-[12px] font-bold">
                  {configSummary.channels.length} channels configured
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {configSummary.channels.map((ch, idx) => (
                  <div
                    key={ch.id}
                    className="p-3.5 rounded-[8px] border border-[var(--border-color)] bg-[var(--surface-app)] flex flex-col justify-between gap-2.5 text-[13px]"
                  >
                    <div className="flex items-start gap-2.5">
                      <div className="w-8 h-8 rounded-[6px] bg-[#DCE6F5] text-[#0B2A5B] flex items-center justify-center shrink-0 mt-0.5">
                        <ChannelIcon icon={ch.icon ?? 'chat'} className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-[14px] text-[var(--text-heading)]">
                            {ch.name}
                          </span>
                          <span className="text-[12px] text-[var(--text-secondary)]">
                            ({ch.slug})
                          </span>
                        </div>
                        {ch.description && (
                          <p className="text-[12px] text-[var(--text-secondary)] mt-0.5 line-clamp-2">
                            {ch.description}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-[var(--border-color)]">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          title="Move channel earlier"
                          disabled={idx === 0}
                          onClick={() =>
                            void handleToggleChannel(ch.id, {
                              sortOrder: Math.max(1, (ch.sortOrder ?? idx + 1) - 1),
                            })
                          }
                          className="px-2 py-1 rounded border border-[var(--border-color)] bg-[var(--surface-card)] text-[11px] font-bold disabled:opacity-40 cursor-pointer"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          title="Move channel later"
                          disabled={idx === configSummary.channels.length - 1}
                          onClick={() =>
                            void handleToggleChannel(ch.id, {
                              sortOrder: (ch.sortOrder ?? idx + 1) + 1,
                            })
                          }
                          className="px-2 py-1 rounded border border-[var(--border-color)] bg-[var(--surface-card)] text-[11px] font-bold disabled:opacity-40 cursor-pointer"
                        >
                          ↓
                        </button>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            void handleToggleChannel(ch.id, { allowsAsk: !ch.allowsAsk })
                          }
                          className="px-2.5 py-1 rounded bg-[#DCE6F5] text-[#0B2A5B] font-semibold text-[12px] cursor-pointer"
                        >
                          Ask: {ch.allowsAsk ? 'On' : 'Off'}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void handleToggleChannel(ch.id, { isActive: !ch.isActive })
                          }
                          className={`px-2.5 py-1 rounded font-semibold text-[12px] cursor-pointer ${
                            ch.isActive
                              ? 'bg-[#1F7A4D] text-white'
                              : 'bg-[#A32121] text-white'
                          }`}
                        >
                          {ch.isActive ? 'Active' : 'Disabled'}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Quick-Add UPSA Campus Channel Presets */}
              <div className="p-3.5 rounded-[8px] bg-[var(--surface-subtle)] border border-[var(--border-color)] space-y-2">
                <div className="text-[12px] font-bold text-[var(--text-heading)]">
                  Quick-Add Campus Channel Presets (1-Click)
                </div>
                <div className="flex flex-wrap gap-2">
                  {[
                    {
                      name: 'Internships & Careers',
                      slug: 'careers',
                      description: 'Internship openings, CV tips, NSS postings, and graduate jobs',
                      icon: 'briefcase',
                      allowsAsk: true,
                    },
                    {
                      name: 'Clubs & SRC Notices',
                      slug: 'clubs-src',
                      description: 'Departmental associations, SRC updates, and student society announcements',
                      icon: 'megaphone',
                      allowsAsk: true,
                    },
                    {
                      name: 'Study Groups & Tutorials',
                      slug: 'study-groups',
                      description: 'Peer study partners, evening revision sessions, and library rooms',
                      icon: 'book',
                      allowsAsk: true,
                    },
                    {
                      name: 'Sports & Hostels Cup',
                      slug: 'sports',
                      description: 'Astroturf fixtures, inter-faculty games, and fitness groups',
                      icon: 'trophy',
                      allowsAsk: false,
                    },
                    {
                      name: 'Tech & Innovation',
                      slug: 'tech',
                      description: 'Coding clubs, hackathons, laptop repairs, and campus Wi-Fi tips',
                      icon: 'laptop',
                      allowsAsk: true,
                    },
                  ].map((preset) => {
                    const alreadyExists = configSummary.channels.some(
                      (c) => c.slug.toLowerCase() === preset.slug.toLowerCase()
                    );
                    return (
                      <button
                        key={preset.slug}
                        type="button"
                        disabled={alreadyExists}
                        onClick={() => void handleQuickAddPresetChannel(preset)}
                        className="min-h-[36px] px-3 rounded-full bg-[var(--surface-card)] border border-[#1C4A8F] text-[#0B2A5B] text-[12px] font-semibold inline-flex items-center gap-1.5 hover:bg-[#DCE6F5] disabled:opacity-45 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>{alreadyExists ? `${preset.name} (Added)` : preset.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Custom Channel Creation Form */}
              <form
                onSubmit={handleCreateChannel}
                className="p-4 rounded-[8px] border border-[var(--border-color)] bg-[var(--surface-app)] space-y-3"
              >
                <div className="text-[13px] font-bold text-[var(--text-heading)]">
                  Add Custom Campus Channel Option
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <input
                    type="text"
                    required
                    placeholder="Channel Name (e.g. Campus Shuttle)"
                    value={newChannelName}
                    onChange={(e) => setNewChannelName(e.target.value)}
                    className="min-h-[42px] px-3 rounded-[8px] border border-[var(--border-color)] bg-[var(--surface-card)] text-[13px]"
                  />
                  <input
                    type="text"
                    placeholder="Optional Slug (e.g. shuttle)"
                    value={newChannelSlug}
                    onChange={(e) => setNewChannelSlug(e.target.value)}
                    className="min-h-[42px] px-3 rounded-[8px] border border-[var(--border-color)] bg-[var(--surface-card)] text-[13px]"
                  />
                  <select
                    value={newChannelIcon}
                    onChange={(e) => setNewChannelIcon(e.target.value)}
                    aria-label="Channel icon"
                    className="min-h-[42px] px-3 rounded-[8px] border border-[var(--border-color)] bg-[var(--surface-card)] text-[13px]"
                  >
                    <option value="briefcase">Icon: Briefcase (Careers)</option>
                    <option value="megaphone">Icon: Megaphone (Notices)</option>
                    <option value="book">Icon: Book (Academics)</option>
                    <option value="home">Icon: Home (Hostels)</option>
                    <option value="utensils">Icon: Utensils (Food)</option>
                    <option value="calendar">Icon: Calendar (Events)</option>
                    <option value="search">Icon: Search (Lost &amp; Found)</option>
                    <option value="laptop">Icon: Laptop (Tech)</option>
                    <option value="trophy">Icon: Trophy (Sports)</option>
                    <option value="heart">Icon: Heart (Wellness)</option>
                    <option value="shield">Icon: Shield (Safety)</option>
                    <option value="chat">Icon: Chat (General)</option>
                  </select>
                </div>

                <input
                  type="text"
                  placeholder="Short channel description shown in the Channels tab..."
                  value={newChannelDescription}
                  onChange={(e) => setNewChannelDescription(e.target.value)}
                  className="w-full min-h-[42px] px-3 rounded-[8px] border border-[var(--border-color)] bg-[var(--surface-card)] text-[13px]"
                />

                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <div className="flex flex-wrap items-center gap-4 text-[13px]">
                    <label className="inline-flex items-center gap-2 font-semibold cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newChannelAllowsAsk}
                        onChange={(e) => setNewChannelAllowsAsk(e.target.checked)}
                        className="w-4 h-4 accent-[#0B2A5B]"
                      />
                      <span>Supports Asks (Q&amp;A with Accepted Answer)</span>
                    </label>
                    <label className="inline-flex items-center gap-2 font-semibold cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newChannelIsActive}
                        onChange={(e) => setNewChannelIsActive(e.target.checked)}
                        className="w-4 h-4 accent-[#0B2A5B]"
                      />
                      <span>Active Immediately</span>
                    </label>
                  </div>

                  <button
                    type="submit"
                    className="min-h-[42px] px-4 rounded-[8px] bg-[#0B2A5B] text-white text-[13px] font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" aria-hidden="true" />
                    <span>Add Channel Option</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Allowed Domains */}
          <div className="space-y-2">
            <div className="text-[14px] text-[var(--text-secondary)]">
              Active allow-listed email domains:{' '}
              <strong>
                {configSummary?.allowedDomains.join(', ') ?? 'upsa.edu.gh, st.upsa.edu.gh'}
              </strong>
            </div>
            <form onSubmit={handleAddAllowedDomain} className="flex flex-wrap gap-2">
              <input
                type="text"
                placeholder="Add UPSA subdomain (e.g. alumni.upsa.edu.gh)"
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                className="flex-1 min-w-[220px] min-h-[44px] px-3 rounded-[8px] border border-[var(--border-color)] bg-[var(--surface-app)] text-[14px]"
              />
              <button
                type="submit"
                className="min-h-[44px] px-4 rounded-[8px] bg-[#0B2A5B] text-white text-[14px] font-semibold cursor-pointer"
              >
                Add Domain
              </button>
            </form>
          </div>

          {/* Keyword Pre-screen Rules */}
          <div className="space-y-2">
            <h3 className="text-[14px] font-bold text-[var(--text-heading)]">
              Keyword &amp; Regex Hold Rules
            </h3>
            <ul className="space-y-1.5 text-[14px]">
              {configSummary?.keywordRules.map((rule) => (
                <li
                  key={rule.id}
                  className="px-3 py-2 rounded-[8px] bg-[var(--surface-subtle)] flex items-center justify-between"
                >
                  <span>
                    <code>{rule.pattern}</code> ({rule.matchType})
                  </span>
                  <span className="text-[12px] font-bold text-[#0B2A5B]">{rule.category}</span>
                </li>
              ))}
            </ul>

            <form onSubmit={handleAddKeywordRule} className="flex flex-wrap gap-2 pt-2">
              <input
                type="text"
                placeholder="New held keyword or phrase..."
                value={newKeywordPattern}
                onChange={(e) => setNewKeywordPattern(e.target.value)}
                className="flex-1 min-w-[200px] min-h-[44px] px-3 rounded-[8px] border border-[var(--border-color)] bg-[var(--surface-app)] text-[14px]"
              />
              <select
                value={newKeywordCategory}
                onChange={(e) => setNewKeywordCategory(e.target.value)}
                className="min-h-[44px] px-3 rounded-[8px] border border-[var(--border-color)] bg-[var(--surface-app)] text-[14px]"
              >
                <option value="exam_leak">exam_leak</option>
                <option value="phone_number_doxxing">phone_number_doxxing</option>
                <option value="self_harm">self_harm</option>
                <option value="spam">spam</option>
              </select>
              <button
                type="submit"
                className="min-h-[44px] px-4 rounded-[8px] bg-[#0B2A5B] text-white text-[14px] font-semibold cursor-pointer"
              >
                Add Hold Rule
              </button>
            </form>
          </div>
        </section>

        {/* Restricted Two-Person Unmask Gate — MOD-3 & F16 */}
        <section className="bg-[var(--surface-card)] border border-[var(--border-color)] rounded-[8px] p-5 space-y-4">
          <div className="flex items-center gap-2 text-[#8A6200] font-bold text-[15px]">
            <Lock className="w-4 h-4" aria-hidden="true" />
            <h2>Restricted Two-Person Author Unmask</h2>
          </div>
          <p className="text-[14px] text-[var(--text-secondary)]">
            Disabled by default until formal written policy approval [DECISION D6]. When enabled via{' '}
            <code>UNMASK_ENABLED=true</code>, Holder A submits a written basis (
            <code>legal_request</code>, <code>credible_threat</code>, or{' '}
            <code>upsa_disciplinary_referral</code>) and Holder B (a distinct account with{' '}
            <code>can_unmask</code>) must independently approve.
          </p>

          <form onSubmit={handleRequestUnmask} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="text"
              value={unmaskPostId}
              onChange={(e) => setUnmaskPostId(e.target.value)}
              placeholder="Target Post UUID"
              className="min-h-[44px] px-3 rounded-[8px] border border-[var(--border-color)] bg-[var(--surface-app)] text-[14px]"
            />
            <select
              value={unmaskBasis}
              onChange={(e) =>
                setUnmaskBasis(
                  e.target.value as
                    | 'legal_request'
                    | 'credible_threat'
                    | 'upsa_disciplinary_referral'
                )
              }
              className="min-h-[44px] px-3 rounded-[8px] border border-[var(--border-color)] bg-[var(--surface-app)] text-[14px]"
            >
              <option value="credible_threat">credible_threat</option>
              <option value="legal_request">legal_request</option>
              <option value="upsa_disciplinary_referral">upsa_disciplinary_referral</option>
            </select>
            <input
              type="text"
              value={unmaskReference}
              onChange={(e) => setUnmaskReference(e.target.value)}
              placeholder="Case / Warrant Reference"
              className="min-h-[44px] px-3 rounded-[8px] border border-[var(--border-color)] bg-[var(--surface-app)] text-[14px]"
            />
            <input
              type="text"
              value={unmaskReason}
              onChange={(e) => setUnmaskReason(e.target.value)}
              placeholder="Written reason (min 10 chars)"
              className="min-h-[44px] px-3 rounded-[8px] border border-[var(--border-color)] bg-[var(--surface-app)] text-[14px]"
            />
            <button
              type="submit"
              className="min-h-[44px] px-4 rounded-[8px] bg-[#8A6200] text-white text-[13px] font-semibold cursor-pointer"
            >
              1. Submit Unmask Request (Holder A)
            </button>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                value={unmaskApproveId}
                onChange={(e) => setUnmaskApproveId(e.target.value)}
                placeholder="Request ID"
                className="w-28 min-h-[44px] px-3 rounded-[8px] border border-[var(--border-color)] bg-[var(--surface-app)] text-[14px]"
              />
              <button
                type="button"
                onClick={() => void handleApproveUnmask()}
                className="flex-1 min-h-[44px] px-3 rounded-[8px] bg-[#0B2A5B] text-white text-[13px] font-semibold cursor-pointer"
              >
                2. Approve Unmask (Holder B)
              </button>
            </div>
          </form>

          {unmaskOutcome && (
            <div className="p-3 rounded-[8px] bg-[var(--surface-subtle)] text-[13px] font-semibold text-[#0B2A5B]">
              {unmaskOutcome}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
