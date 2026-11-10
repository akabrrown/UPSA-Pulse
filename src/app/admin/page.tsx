'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Shield,
  Lock,
  AlertCircle,
  CheckCircle2,
  Search,
  Scale,
  Plus,
  Trash2,
  UserX,
  History,
  Download,
  RefreshCw,
  FileText,
  MapPin,
  Layers,
  ChevronRight,
} from 'lucide-react';
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

interface AuditLogItem {
  id: number;
  actorId: string | null;
  event: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

interface DeletedMessageItem {
  id: number;
  messageType: 'post' | 'reply';
  originalId: string;
  postId: string;
  channelId?: number | null;
  zoneId?: number | null;
  authorId?: string | null;
  body: string;
  originalCreatedAt: string;
  deletedBy?: string | null;
  deletionReason: string;
  deletedAt: string;
  metadata: Record<string, unknown>;
}

interface DeletedUserItem {
  id: number;
  userId: string;
  username: string;
  indexNumberHash?: string | null;
  emailHash?: string | null;
  role: string;
  reputation: number;
  accountCreatedAt?: string | null;
  deletedBy?: string | null;
  deletionReason: string;
  deletedAt: string;
  metadata: Record<string, unknown>;
}

interface SecurityAuditData {
  systemAuditLogs: AuditLogItem[];
  deletedMessages: DeletedMessageItem[];
  deletedUsers: DeletedUserItem[];
  totalAuditCount: number;
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

export type AdminSection =
  | 'queue'
  | 'appeals'
  | 'audit'
  | 'channels'
  | 'places'
  | 'policies'
  | 'unmask';

export default function AdminQueuePage() {
  const [currentUser, setCurrentUser] = useState<{
    id?: string;
    username?: string | null;
    isAdmin: boolean;
    canModerate: boolean;
  } | null>(null);
  const [authChecked, setAuthChecked] = useState<boolean>(false);
  const [activeSection, setActiveSection] = useState<AdminSection>('queue');

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

  // Security & Forensics Audit Trail state (DPA Act 843)
  const [auditData, setAuditData] = useState<SecurityAuditData | null>(null);
  const [auditTab, setAuditTab] = useState<'messages' | 'users' | 'system'>('messages');
  const [auditSearch, setAuditSearch] = useState<string>('');
  const [auditLoading, setAuditLoading] = useState<boolean>(false);

  // URL Hash synchronization for intuitive deep-linking
  useEffect(() => {
    const validSections: AdminSection[] = [
      'queue',
      'appeals',
      'audit',
      'channels',
      'places',
      'policies',
      'unmask',
    ];

    const applyHash = () => {
      const hash = window.location.hash.replace('#', '') as AdminSection;
      if (validSections.includes(hash)) {
        setActiveSection(hash);
      }
    };

    applyHash();
    window.addEventListener('hashchange', applyHash);
    return () => window.removeEventListener('hashchange', applyHash);
  }, []);

  const switchSection = (section: AdminSection) => {
    setActiveSection(section);
    if (typeof window !== 'undefined') {
      window.location.hash = section;
    }
  };

  const loadAuditData = useCallback(async () => {
    setAuditLoading(true);
    try {
      const res = await fetch('/api/admin/audit?type=all');
      const json = await res.json();
      if (res.ok && json.success) {
        setAuditData(json.data);
      }
    } catch {
      // Non-fatal audit log fetch error
    } finally {
      setAuditLoading(false);
    }
  }, []);

  const handleExportAudit = () => {
    if (!auditData) return;
    const blob = new Blob([JSON.stringify(auditData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `upsa_pulse_security_audit_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setFeedback('Full security audit package exported successfully (JSON format).');
  };

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
      void loadAuditData();
    } finally {
      setLoading(false);
    }
  }, [loadAuditData]);

  useEffect(() => {
    if (authChecked && currentUser && (currentUser.isAdmin || currentUser.canModerate)) {
      void loadQueueAndConfig();
    }
  }, [authChecked, currentUser, loadQueueAndConfig]);

  const handleAction = async (
    item: QueueItem,
    action: 'dismiss' | 'hide' | 'suspend'
  ) => {
    const reason = reasonMap[item.targetId] || 'Violates community guidelines';
    const res = await fetch('/api/admin/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetType: item.targetType,
        targetId: item.targetId,
        action,
        reason,
        suspensionDurationHours: action === 'suspend' ? 168 : undefined,
      }),
    });
    const json = await res.json();
    if (res.ok && json.success) {
      setFeedback(`Action "${action}" recorded on ${item.targetType} ${item.targetId.slice(0, 8)}...`);
      void loadQueueAndConfig();
    } else {
      setFeedback(json.error?.message ?? 'Failed to apply action.');
    }
  };

  const handleAddKeywordRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeywordPattern.trim()) return;
    const res = await fetch('/api/admin/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        addKeywordRule: {
          pattern: newKeywordPattern.trim(),
          category: newKeywordCategory,
          matchType: 'contains',
        },
      }),
    });
    const json = await res.json();
    if (res.ok && json.success) {
      setFeedback(`Rule added: "${newKeywordPattern}" (${newKeywordCategory})`);
      setNewKeywordPattern('');
      void loadQueueAndConfig();
    } else {
      setFeedback(json.error?.message ?? 'Failed to add rule.');
    }
  };

  const handleAddAllowedDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDomain.trim()) return;
    const res = await fetch('/api/admin/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        addAllowedDomain: newDomain.trim().toLowerCase(),
      }),
    });
    const json = await res.json();
    if (res.ok && json.success) {
      setFeedback(`Domain allow-listed: ${newDomain.trim()}`);
      setNewDomain('');
      void loadQueueAndConfig();
    } else {
      setFeedback(json.error?.message ?? 'Failed to add domain.');
    }
  };

  const handleUpdateZoneAccuracy = async () => {
    const res = await fetch('/api/admin/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        zoneAccuracyGate: {
          zoneId: configSummary?.zones?.[0]?.id ?? 1,
          maxAccuracyMeters: maxAccuracyInput,
        },
      }),
    });
    const json = await res.json();
    if (res.ok && json.success) {
      setFeedback(`Zone GPS accuracy threshold updated to ${maxAccuracyInput}m`);
      void loadQueueAndConfig();
    } else {
      setFeedback(json.error?.message ?? 'Failed to update zone accuracy.');
    }
  };

  const handleTogglePlaceActive = async (zoneId: number, isActive: boolean) => {
    const res = await fetch('/api/admin/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        toggleZoneActive: { zoneId, isActive },
      }),
    });
    const json = await res.json();
    if (res.ok && json.success) {
      setFeedback(`Place #${zoneId} is now ${isActive ? 'active' : 'disabled'}.`);
      void loadQueueAndConfig();
    } else {
      setFeedback(json.error?.message ?? 'Failed to toggle place status.');
    }
  };

  const handleAddGeoJsonPlace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlaceName.trim() || !newPlaceGeoJson.trim()) return;
    try {
      const parsed = JSON.parse(newPlaceGeoJson.trim());
      const res = await fetch('/api/admin/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          addZoneGeoJson: {
            name: newPlaceName.trim(),
            maxAccuracyMeters: newPlaceAccuracy,
            geoJson: parsed,
          },
        }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setFeedback(`Place "${newPlaceName}" added successfully.`);
        setNewPlaceName('');
        setNewPlaceGeoJson('');
        void loadQueueAndConfig();
      } else {
        setFeedback(json.error?.message ?? 'Failed to add place boundary.');
      }
    } catch {
      setFeedback('Invalid GeoJSON syntax. Please provide a valid Polygon or Feature JSON.');
    }
  };

  const handleToggleChannel = async (
    channelId: number,
    updates: { isActive?: boolean; allowsAsk?: boolean; sortOrder?: number }
  ) => {
    const res = await fetch('/api/admin/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        updateChannel: {
          channelId,
          ...updates,
        },
      }),
    });
    const json = await res.json();
    if (res.ok && json.success) {
      setFeedback(`Channel #${channelId} updated successfully.`);
      void loadQueueAndConfig();
    } else {
      setFeedback(json.error?.message ?? 'Failed to update channel.');
    }
  };

  const handleCreateChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChannelName.trim()) return;
    const res = await fetch('/api/admin/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        addChannel: {
          name: newChannelName.trim(),
          slug: newChannelSlug.trim() || newChannelName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          description: newChannelDescription.trim() || undefined,
          icon: newChannelIcon,
          allowsAsk: newChannelAllowsAsk,
          isActive: newChannelIsActive,
        },
      }),
    });
    const json = await res.json();
    if (res.ok && json.success) {
      setFeedback(`Channel "${newChannelName}" created successfully.`);
      setNewChannelName('');
      setNewChannelSlug('');
      setNewChannelDescription('');
      void loadQueueAndConfig();
    } else {
      setFeedback(json.error?.message ?? 'Failed to create channel.');
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
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        addChannel: {
          ...preset,
          isActive: true,
        },
      }),
    });
    const json = await res.json();
    if (res.ok && json.success) {
      setFeedback(`Preset channel "${preset.name}" added successfully.`);
      void loadQueueAndConfig();
    } else {
      setFeedback(json.error?.message ?? 'Failed to add preset channel.');
    }
  };

  const handleCaseLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLookupResult(null);
    const res = await fetch(
      `/api/admin/case-lookup?postId=${encodeURIComponent(lookupPostId)}&aliasNo=${lookupAliasNo}`
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
    if (!appealId || !appealNoteInput.trim() || appealNoteInput.trim().length < 5) {
      setFeedback('Provide a valid Appeal ID and a decision note (min 5 characters).');
      return;
    }
    const res = await fetch('/api/admin/appeals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        appealId,
        decision,
        decisionNote: appealNoteInput.trim(),
      }),
    });
    const json = await res.json();
    if (res.ok && json.success) {
      setFeedback(`Appeal #${appealId} decided: ${decision.toUpperCase()}`);
      setAppealIdInput('');
      setAppealNoteInput('');
      void loadQueueAndConfig();
    } else {
      setFeedback(
        json.error?.message ??
          'Failed to decide appeal. Ensure you are not the same moderator who issued the action (F15 enforcement).'
      );
    }
  };

  const handleRequestUnmask = async (e: React.FormEvent) => {
    e.preventDefault();
    setUnmaskOutcome(null);
    const res = await fetch('/api/admin/unmask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'request',
        postId: unmaskPostId,
        basis: unmaskBasis,
        reference: unmaskReference,
        reason: unmaskReason,
      }),
    });
    const json = await res.json();
    if (res.ok && json.success) {
      setUnmaskOutcome(
        `Holder A submitted unmask request #${json.data.requestId}. Status: ${json.data.status}. Awaiting Holder B independent approval.`
      );
      void loadQueueAndConfig();
    } else {
      setUnmaskOutcome(json.error?.message ?? 'Two-person request failed.');
    }
  };

  const handleApproveUnmask = async () => {
    const reqId = Number(unmaskApproveId);
    if (!reqId) {
      setFeedback('Provide a valid Request ID.');
      return;
    }
    setUnmaskOutcome(null);
    const res = await fetch('/api/admin/unmask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-[var(--surface-app)] text-[var(--text-primary)] flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-[#D9A21B] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-[14px] text-[var(--text-secondary)]">Verifying administrative access...</p>
        </div>
      </div>
    );
  }

  if (!currentUser || (!currentUser.isAdmin && !currentUser.canModerate)) {
    return (
      <div className="min-h-screen bg-[var(--surface-app)] text-[var(--text-primary)] flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-[var(--surface-card)] border border-[var(--border-color)] rounded-[12px] p-6 text-center space-y-4 shadow-lg">
          <div className="w-12 h-12 rounded-full bg-red-950/40 border border-red-500/30 text-red-400 flex items-center justify-center mx-auto">
            <Lock className="w-6 h-6" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <h1 className="text-[18px] font-bold text-[var(--text-heading)]">Access Restricted</h1>
            <p className="text-[13px] text-[var(--text-secondary)]">
              This console is strictly limited to authorized UPSA university administrators and student council moderators. All access attempts are logged.
            </p>
          </div>
          <div className="pt-2">
            <Link
              href="/"
              className="inline-flex items-center justify-center w-full min-h-[44px] px-4 rounded-[6px] bg-[#0B2A5B] hover:bg-[#133875] text-[#D9A21B] font-semibold text-[14px] transition-colors border border-[#1C4A8F]"
            >
              Return to Campus Feed
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Navigation Group Configuration
  const navGroups: Array<{
    title: string;
    items: Array<{
      id: AdminSection;
      label: string;
      description: string;
      icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>;
      badge?: number | string | null;
      badgeTone?: 'red' | 'amber' | 'blue' | 'neutral';
    }>;
  }> = [
    {
      title: 'OPERATIONS & REVIEW',
      items: [
        {
          id: 'queue',
          label: 'Moderation Queue',
          description: 'Reported posts & replies',
          icon: AlertCircle,
          badge: queue.length > 0 ? queue.length : null,
          badgeTone: queue.some((i) => i.priority === 'P1') ? 'red' : 'amber',
        },
        {
          id: 'appeals',
          label: 'Appeals & Case Lookup',
          description: 'Disciplinary review & history',
          icon: Scale,
          badge: configSummary?.openAppeals?.length ? configSummary.openAppeals.length : null,
          badgeTone: 'blue',
        },
        {
          id: 'audit',
          label: 'Security Audit Trail',
          description: 'Act 843 forensics & logs',
          icon: History,
          badge: auditData?.totalAuditCount ? auditData.totalAuditCount : null,
          badgeTone: 'neutral',
        },
      ],
    },
    {
      title: 'CAMPUS FEED & SPACES',
      items: [
        {
          id: 'channels',
          label: 'Channels & Feed',
          description: 'Categories, presets & order',
          icon: Layers,
          badge: configSummary?.channels?.length ? configSummary.channels.length : null,
          badgeTone: 'neutral',
        },
        {
          id: 'places',
          label: 'Places & Geofences',
          description: 'GPS accuracy & boundaries',
          icon: MapPin,
          badge: configSummary?.zones?.length ? configSummary.zones.length : null,
          badgeTone: 'neutral',
        },
      ],
    },
    {
      title: 'SAFETY & GOVERNANCE',
      items: [
        {
          id: 'policies',
          label: 'Policies & Hold Rules',
          description: 'Domains & keyword filters',
          icon: FileText,
          badge: configSummary?.keywordRules?.length ? configSummary.keywordRules.length : null,
          badgeTone: 'neutral',
        },
        {
          id: 'unmask',
          label: 'Two-Person Unmask',
          description: 'Statutory identity disclosure',
          icon: Lock,
          badge: configSummary?.unmaskRequests?.length ? configSummary.unmaskRequests.length : null,
          badgeTone: 'amber',
        },
      ],
    },
  ];

  const allNavItems = navGroups.flatMap((g) => g.items);
  const fallbackNav = {
    id: 'queue' as AdminSection,
    label: 'Moderation Queue',
    description: 'Reported posts & replies',
    icon: AlertCircle,
    badge: null,
    badgeTone: 'neutral' as const,
  };
  const currentNav = allNavItems.find((i) => i.id === activeSection) ?? fallbackNav;
  const CurrentNavIcon = currentNav.icon;

  return (
    <div className="min-h-screen bg-[var(--surface-app)] text-[var(--text-primary)]">
      {/* Top Console Navigation Bar */}
      <header className="bg-[#0B2A5B] text-white border-b border-[#1C4A8F] sticky top-0 z-30 shadow-md">
        <div className="max-w-7xl mx-auto px-4 py-3.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-[8px] bg-[#133875] border border-[#2C599D] flex items-center justify-center text-[#D9A21B] shadow-sm">
              <Shield className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-[17px] tracking-tight">UPSA Pulse · Admin Console</h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#D9A21B] text-[#0B2A5B]">
                  Admin OS
                </span>
              </div>
              <p className="text-[12px] text-[#DCE6F5]">
                Strict anonymity · Aliases only · Tamper-evident forensics
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              type="button"
              onClick={() => void loadQueueAndConfig()}
              disabled={loading}
              title="Refresh queue and platform configuration"
              className="min-h-[38px] px-3 rounded-[6px] bg-[#133875] hover:bg-[#1a478f] text-[#DCE6F5] text-[12px] font-semibold border border-[#2C599D] flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#D9A21B]' : ''}`} aria-hidden="true" />
              <span className="hidden sm:inline">Refresh Data</span>
            </button>

            <div className="flex items-center gap-2 px-3 py-1.5 rounded-[6px] bg-[#133875] text-[#DCE6F5] text-[12px] font-semibold border border-[#2C599D]">
              <Shield className="w-3.5 h-3.5 text-[#D9A21B]" aria-hidden="true" />
              <span>
                @{currentUser?.username ?? 'staff'} ({currentUser?.isAdmin ? 'Admin' : 'Moderator'})
              </span>
            </div>

            <Link
              href="/"
              className="min-h-[38px] px-3.5 rounded-[6px] bg-[#D9A21B] hover:bg-[#e5ae2e] text-[#0B2A5B] font-bold text-[13px] inline-flex items-center gap-1 transition-colors shadow-sm"
            >
              <span>Back to Campus Feed</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Console Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Feedback Alert Banner */}
        {feedback && (
          <div
            role="status"
            className="mb-6 bg-[#EEF2F8] border border-[#1C4A8F] text-[#0B2A5B] px-4 py-3 rounded-[8px] flex items-center justify-between text-[14px] font-semibold shadow-sm animate-in fade-in"
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#1F7A4D] shrink-0" aria-hidden="true" />
              <span>{feedback}</span>
            </div>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="min-h-[32px] px-2 text-[#1C4A8F] underline cursor-pointer text-[13px]"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Mobile / Tablet Horizontal Scrollable Pill Navigation (< 1024px) */}
        <div className="lg:hidden mb-6 -mx-4 px-4 overflow-x-auto pb-2 flex items-center gap-2 border-b border-[var(--border-color)]">
          {allNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => switchSection(item.id)}
                className={`min-h-[42px] px-3.5 rounded-[8px] text-[13px] font-semibold flex items-center gap-2 shrink-0 cursor-pointer transition-all ${
                  isActive
                    ? 'bg-[#0B2A5B] text-white shadow-sm ring-1 ring-[#1C4A8F]'
                    : 'bg-[var(--surface-card)] text-[var(--text-secondary)] border border-[var(--border-color)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-[#D9A21B]' : ''}`} aria-hidden="true" />
                <span>{item.label}</span>
                {item.badge !== null && item.badge !== undefined && (
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[11px] font-bold ${
                      isActive
                        ? 'bg-white/20 text-white'
                        : item.badgeTone === 'red'
                        ? 'bg-red-500/15 text-red-600'
                        : item.badgeTone === 'amber'
                        ? 'bg-amber-500/15 text-amber-700'
                        : 'bg-[#EEF2F8] text-[#0B2A5B]'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* 2-Column Responsive Layout for Desktop (>= 1024px) */}
        <div className="lg:grid lg:grid-cols-[280px_1fr] lg:gap-6 lg:items-start">
          {/* Left Column: Sidebar Navigation */}
          <aside className="hidden lg:block space-y-5 sticky top-20">
            {/* Nav Menu Groups */}
            <nav className="bg-[var(--surface-card)] border border-[var(--border-color)] rounded-[12px] p-3 space-y-4 shadow-sm" aria-label="Admin Navigation">
              {navGroups.map((group, gIdx) => (
                <div key={group.title} className={gIdx > 0 ? 'pt-3 border-t border-[var(--border-color)]' : ''}>
                  <div className="px-3 pb-2 text-[10px] font-bold tracking-wider text-[var(--text-secondary)] uppercase">
                    {group.title}
                  </div>
                  <div className="space-y-1">
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      const isActive = activeSection === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => switchSection(item.id)}
                          className={`w-full text-left px-3 py-2.5 rounded-[8px] flex items-center justify-between gap-2.5 transition-all cursor-pointer ${
                            isActive
                              ? 'bg-[#0B2A5B] text-white font-bold shadow-sm'
                              : 'text-[var(--text-primary)] hover:bg-[var(--surface-subtle)] font-medium'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Icon
                              className={`w-4 h-4 shrink-0 ${
                                isActive ? 'text-[#D9A21B]' : 'text-[var(--text-secondary)]'
                              }`}
                              aria-hidden="true"
                            />
                            <div className="truncate">
                              <div className="text-[13px] leading-tight truncate">{item.label}</div>
                              <div
                                className={`text-[11px] leading-tight truncate mt-0.5 ${
                                  isActive ? 'text-[#DCE6F5]' : 'text-[var(--text-secondary)]'
                                }`}
                              >
                                {item.description}
                              </div>
                            </div>
                          </div>

                          {item.badge !== null && item.badge !== undefined ? (
                            <span
                              className={`px-2 py-0.5 rounded-full text-[11px] font-bold shrink-0 ${
                                isActive
                                  ? 'bg-[#133875] text-[#D9A21B] border border-[#2C599D]'
                                  : item.badgeTone === 'red'
                                  ? 'bg-red-500/15 text-red-600'
                                  : item.badgeTone === 'amber'
                                  ? 'bg-amber-500/15 text-amber-700'
                                  : 'bg-[var(--surface-subtle)] text-[var(--text-secondary)]'
                              }`}
                            >
                              {item.badge}
                            </span>
                          ) : (
                            <ChevronRight
                              className={`w-3.5 h-3.5 shrink-0 ${
                                isActive ? 'text-[#D9A21B]' : 'text-[var(--text-secondary)] opacity-40'
                              }`}
                              aria-hidden="true"
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </nav>

            {/* Quick System Telemetry Card */}
            <div className="p-4 rounded-[12px] bg-[var(--surface-subtle)] border border-[var(--border-color)] space-y-2.5 text-[12px]">
              <div className="font-bold text-[var(--text-heading)] flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-[#1F7A4D]" aria-hidden="true" />
                <span>Console Security &amp; Standing</span>
              </div>
              <div className="space-y-1.5 text-[var(--text-secondary)]">
                <div className="flex justify-between">
                  <span>Geofences active:</span>
                  <strong className="text-[var(--text-primary)]">
                    {configSummary?.zones?.filter((z) => z.isActive).length ?? 0} places
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span>Channels configured:</span>
                  <strong className="text-[var(--text-primary)]">
                    {configSummary?.channels?.length ?? 0} channels
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span>Audit Archive records:</span>
                  <strong className="text-[var(--text-primary)]">
                    {auditData?.totalAuditCount ?? 0} logs
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span>Active GPS Gate:</span>
                  <strong className="text-[var(--text-primary)]">
                    {configSummary?.zones?.[0]?.maxAccuracyMeters ?? 150}m (+25m buffer)
                  </strong>
                </div>
              </div>
            </div>
          </aside>

          {/* Right Column: Active Module View */}
          <div className="space-y-6 min-w-0">
            {/* Section Header Banner */}
            <div className="p-4 rounded-[12px] bg-[var(--surface-card)] border border-[var(--border-color)] flex items-center justify-between flex-wrap gap-3 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-[8px] bg-[#EEF2F8] text-[#0B2A5B] border border-[#1C4A8F]/30 flex items-center justify-center shrink-0">
                  <CurrentNavIcon className="w-5 h-5 text-[#0B2A5B]" aria-hidden="true" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-[18px] font-bold text-[var(--text-heading)]">
                      {currentNav.label}
                    </h2>
                    {currentNav.badge !== null && currentNav.badge !== undefined && (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#DCE6F5] text-[#0B2A5B]">
                        {currentNav.badge} active
                      </span>
                    )}
                  </div>
                  <p className="text-[12px] text-[var(--text-secondary)]">
                    {currentNav.description} · Protected under UPSA administrative protocol
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 text-[12px] text-[var(--text-secondary)]">
                <span>View:</span>
                <span className="font-bold text-[#0B2A5B] bg-[#EEF2F8] px-2 py-0.5 rounded-[4px] border border-[#1C4A8F]/20">
                  {currentNav.label}
                </span>
              </div>
            </div>

            {/* SECTION 1: MODERATION QUEUE */}
            {activeSection === 'queue' && (
              <section className="bg-[var(--surface-card)] border border-[var(--border-color)] rounded-[12px] p-5 space-y-4 shadow-sm">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h3 className="text-[16px] font-bold text-[var(--text-heading)]">
                      Moderation Queue (Priority P1 first, then oldest)
                    </h3>
                    <p className="text-[12px] text-[var(--text-secondary)]">
                      Pending review items. Moderators can dismiss reports, hide content with a statutory reason, or issue 7-day student suspensions.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void loadQueueAndConfig()}
                    disabled={loading}
                    className="min-h-[36px] px-3 rounded-[6px] border border-[var(--border-color)] bg-[var(--surface-subtle)] text-[12px] font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
                    <span>Refresh Queue</span>
                  </button>
                </div>

                {loading ? (
                  <div className="p-8 text-center text-[13px] text-[var(--text-secondary)]">
                    <div className="w-6 h-6 border-2 border-[#0B2A5B] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    Loading reported items...
                  </div>
                ) : queue.length === 0 ? (
                  <div className="p-12 text-center border border-dashed border-[var(--border-color)] rounded-[8px] space-y-2">
                    <div className="w-10 h-10 rounded-full bg-[#1F7A4D]/10 text-[#1F7A4D] flex items-center justify-center mx-auto">
                      <CheckCircle2 className="w-6 h-6" aria-hidden="true" />
                    </div>
                    <div className="text-[15px] font-bold text-[var(--text-heading)]">
                      Moderation queue is clean
                    </div>
                    <p className="text-[13px] text-[var(--text-secondary)]">
                      All student flags, exam leak signals, and priority reports have been reviewed.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {queue.map((item) => (
                      <div
                        key={item.targetId}
                        className={`p-4 rounded-[10px] border space-y-3 transition-colors ${
                          item.priority === 'P1'
                            ? 'border-red-500/40 bg-red-500/5'
                            : 'border-[var(--border-color)] bg-[var(--surface-subtle)]'
                        }`}
                      >
                        <div className="flex items-center justify-between flex-wrap gap-2 text-[12px]">
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-2 py-0.5 rounded font-bold uppercase tracking-wider ${
                                item.priority === 'P1'
                                  ? 'bg-red-600 text-white'
                                  : 'bg-amber-600 text-white'
                              }`}
                            >
                              {item.priority}
                            </span>
                            <span className="font-semibold text-[var(--text-heading)]">
                              {item.targetType.toUpperCase()} · Channel #{item.channelId}
                            </span>
                            <span className="text-[var(--text-secondary)]">
                              Author: <strong>{item.aliasLabel}</strong>
                            </span>
                          </div>

                          <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                            <span>Reports: <strong>{item.reportCount}</strong></span>
                            <span>·</span>
                            <span>{new Date(item.createdAt).toLocaleTimeString()}</span>
                          </div>
                        </div>

                        <div className="p-3 rounded-[6px] bg-[var(--surface-card)] border border-[var(--border-color)] text-[14px] text-[var(--text-primary)] whitespace-pre-wrap break-words">
                          {item.body}
                        </div>

                        {item.reportReasons.length > 0 && (
                          <div className="text-[12px] text-[var(--text-secondary)]">
                            Report categories:{' '}
                            <span className="font-semibold text-[var(--text-primary)]">
                              {item.reportReasons.join(', ')}
                            </span>
                          </div>
                        )}

                        {item.conflictOfInterest && (
                          <div className="text-[12px] font-semibold text-amber-700 bg-amber-500/10 px-2.5 py-1.5 rounded-[6px] border border-amber-500/20">
                            Conflict of interest detected: You cannot moderate this item because you have participated in this discussion thread.
                          </div>
                        )}

                        <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-[var(--border-color)]">
                          <input
                            type="text"
                            placeholder="Action reason / policy reference..."
                            value={reasonMap[item.targetId] ?? ''}
                            onChange={(e) =>
                              setReasonMap({ ...reasonMap, [item.targetId]: e.target.value })
                            }
                            className="flex-1 min-w-[200px] min-h-[38px] px-3 rounded-[6px] border border-[var(--border-color)] bg-[var(--surface-card)] text-[13px]"
                          />

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              disabled={item.conflictOfInterest}
                              onClick={() => void handleAction(item, 'dismiss')}
                              className="min-h-[38px] px-3 rounded-[6px] border border-[var(--border-color)] bg-[var(--surface-card)] text-[12px] font-semibold disabled:opacity-40 cursor-pointer hover:bg-[var(--surface-subtle)]"
                            >
                              Dismiss Flag
                            </button>
                            <button
                              type="button"
                              disabled={item.conflictOfInterest}
                              onClick={() => void handleAction(item, 'hide')}
                              className="min-h-[38px] px-3 rounded-[6px] bg-[#A32121] text-white text-[12px] font-semibold disabled:opacity-40 cursor-pointer hover:bg-[#851818]"
                            >
                              Hide Content
                            </button>
                            <button
                              type="button"
                              disabled={item.conflictOfInterest}
                              onClick={() => void handleAction(item, 'suspend')}
                              className="min-h-[38px] px-3 rounded-[6px] bg-[#0B2A5B] text-white text-[12px] font-semibold disabled:opacity-40 cursor-pointer hover:bg-[#133875]"
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
            )}

            {/* SECTION 2: APPEALS & CASE LOOKUP */}
            {activeSection === 'appeals' && (
              <div className="space-y-6">
                {/* Appeals Review Queue */}
                <section className="bg-[var(--surface-card)] border border-[var(--border-color)] rounded-[12px] p-5 space-y-4 shadow-sm">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-[6px] bg-[#EEF2F8] text-[#0B2A5B] flex items-center justify-center">
                      <Scale className="w-4 h-4" aria-hidden="true" />
                    </div>
                    <div>
                      <h3 className="text-[16px] font-bold text-[var(--text-heading)]">
                        Appeals Queue (Two-Moderator Rule · F15 Compliance)
                      </h3>
                      <p className="text-[12px] text-[var(--text-secondary)]">
                        PostgreSQL rule <code>same_moderator_cannot_review_appeal</code> prevents the original moderator from deciding on an appeal.
                      </p>
                    </div>
                  </div>

                  <div className="p-4 rounded-[8px] bg-[var(--surface-subtle)] border border-[var(--border-color)] space-y-3">
                    <div className="text-[13px] font-semibold text-[var(--text-heading)]">
                      Decide Disciplinary Appeal
                    </div>
                    <div className="flex flex-wrap gap-2.5">
                      <input
                        type="number"
                        min={1}
                        placeholder="Appeal ID (e.g. 1)"
                        value={appealIdInput}
                        onChange={(e) => setAppealIdInput(e.target.value)}
                        className="w-36 min-h-[42px] px-3 rounded-[8px] border border-[var(--border-color)] bg-[var(--surface-card)] text-[13px]"
                      />
                      <input
                        type="text"
                        placeholder="Decision rationale & notes (min 5 chars)..."
                        value={appealNoteInput}
                        onChange={(e) => setAppealNoteInput(e.target.value)}
                        className="flex-1 min-w-[240px] min-h-[42px] px-3 rounded-[8px] border border-[var(--border-color)] bg-[var(--surface-card)] text-[13px]"
                      />
                      <button
                        type="button"
                        onClick={() => void handleDecideAppeal('upheld')}
                        className="min-h-[42px] px-4 rounded-[8px] bg-[#1F7A4D] hover:bg-[#18603c] text-white text-[13px] font-semibold cursor-pointer"
                      >
                        Uphold (Restore Post)
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDecideAppeal('rejected')}
                        className="min-h-[42px] px-4 rounded-[8px] bg-[#A32121] hover:bg-[#851818] text-white text-[13px] font-semibold cursor-pointer"
                      >
                        Reject Appeal
                      </button>
                    </div>
                  </div>

                  {configSummary?.openAppeals && configSummary.openAppeals.length > 0 ? (
                    <div className="space-y-2.5">
                      <div className="text-[13px] font-bold text-[var(--text-heading)]">
                        Open Student Appeals ({configSummary.openAppeals.length})
                      </div>
                      <div className="space-y-2">
                        {configSummary.openAppeals.map((app) => (
                          <div
                            key={app.id}
                            className="p-3.5 rounded-[8px] border border-[var(--border-color)] bg-[var(--surface-app)] flex items-center justify-between flex-wrap gap-3 text-[13px]"
                          >
                            <div>
                              <div className="font-bold text-[var(--text-heading)]">
                                Appeal #{app.id} · Original Action #{app.original_action_id}
                              </div>
                              <div className="text-[12px] text-[var(--text-secondary)] mt-0.5">
                                &ldquo;{app.message}&rdquo;
                              </div>
                            </div>
                            <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-500/15 text-amber-700">
                              {app.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="p-6 text-center border border-dashed border-[var(--border-color)] rounded-[8px] text-[13px] text-[var(--text-secondary)]">
                      No pending disciplinary appeals awaiting review.
                    </div>
                  )}
                </section>

                {/* Case Lookup by Post ID / Thread Alias */}
                <section className="bg-[var(--surface-card)] border border-[var(--border-color)] rounded-[12px] p-5 space-y-4 shadow-sm">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-[6px] bg-[#EEF2F8] text-[#0B2A5B] flex items-center justify-center">
                      <Search className="w-4 h-4" aria-hidden="true" />
                    </div>
                    <div>
                      <h3 className="text-[16px] font-bold text-[var(--text-heading)]">
                        Anonymous Case History Lookup
                      </h3>
                      <p className="text-[12px] text-[var(--text-secondary)]">
                        Inspect prior warnings, strikes, and actions for a thread alias without unmasking the student&apos;s identity or email.
                      </p>
                    </div>
                  </div>

                  <form onSubmit={handleCaseLookup} className="flex flex-wrap gap-2.5">
                    <input
                      type="text"
                      value={lookupPostId}
                      onChange={(e) => setLookupPostId(e.target.value)}
                      placeholder="Target Post UUID"
                      className="flex-1 min-w-[240px] min-h-[42px] px-3 rounded-[8px] border border-[var(--border-color)] bg-[var(--surface-card)] text-[13px]"
                    />
                    <input
                      type="number"
                      min={0}
                      max={500}
                      value={lookupAliasNo}
                      onChange={(e) => setLookupAliasNo(Number(e.target.value))}
                      placeholder="Alias # (0 = OP)"
                      className="w-32 min-h-[42px] px-3 rounded-[8px] border border-[var(--border-color)] bg-[var(--surface-card)] text-[13px]"
                    />
                    <button
                      type="submit"
                      className="min-h-[42px] px-5 rounded-[8px] bg-[#0B2A5B] hover:bg-[#133875] text-white text-[13px] font-semibold cursor-pointer"
                    >
                      Lookup Case History
                    </button>
                  </form>

                  {lookupResult && (
                    <div className="space-y-2">
                      <div className="text-[12px] font-bold text-[var(--text-heading)]">Case Record:</div>
                      <pre className="p-3.5 rounded-[8px] bg-[var(--surface-subtle)] text-[12px] font-mono overflow-x-auto border border-[var(--border-color)] text-[var(--text-primary)]">
                        {JSON.stringify(lookupResult, null, 2)}
                      </pre>
                    </div>
                  )}
                </section>
              </div>
            )}

            {/* SECTION 3: SECURITY AUDIT TRAIL & FORENSICS (ACT 843) */}
            {activeSection === 'audit' && (
              <section className="bg-[var(--surface-card)] border border-[var(--border-color)] rounded-[12px] p-5 space-y-4 shadow-sm">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-[6px] bg-[#EEF2F8] text-[#0B2A5B] flex items-center justify-center">
                      <History className="w-4 h-4" aria-hidden="true" />
                    </div>
                    <div>
                      <h3 className="font-bold text-[16px] text-[var(--text-heading)]">
                        Tamper-Evident Security &amp; Forensics Archive
                      </h3>
                      <p className="text-[12px] text-[var(--text-secondary)]">
                        Ghana Data Protection Act 2012 (Act 843) statutory compliance log. Append-only triggers prevent retroactive deletion.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void loadAuditData()}
                      disabled={auditLoading}
                      className="min-h-[38px] px-3 rounded-[6px] border border-[var(--border-color)] bg-[var(--surface-subtle)] hover:bg-[var(--surface-card)] text-[12px] font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${auditLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
                      <span>Refresh</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleExportAudit}
                      disabled={!auditData || auditData.totalAuditCount === 0}
                      className="min-h-[38px] px-3.5 rounded-[6px] bg-[#0B2A5B] hover:bg-[#133875] text-[#D9A21B] text-[12px] font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-sm"
                    >
                      <Download className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Export Audit Package</span>
                    </button>
                  </div>
                </div>

                {/* Sub-tabs for Audit types */}
                <div className="flex items-center gap-2 border-b border-[var(--border-color)] pb-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setAuditTab('messages')}
                    className={`px-3 py-1.5 rounded-[6px] text-[13px] font-semibold flex items-center gap-1.5 cursor-pointer transition-colors ${
                      auditTab === 'messages'
                        ? 'bg-[#0B2A5B] text-white'
                        : 'bg-[var(--surface-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Deleted Messages Archive</span>
                    <span className="px-1.5 py-0.2 rounded-full text-[11px] bg-white/20">
                      {auditData?.deletedMessages.length ?? 0}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAuditTab('users')}
                    className={`px-3 py-1.5 rounded-[6px] text-[13px] font-semibold flex items-center gap-1.5 cursor-pointer transition-colors ${
                      auditTab === 'users'
                        ? 'bg-[#0B2A5B] text-white'
                        : 'bg-[var(--surface-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <UserX className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Deleted Users Archive</span>
                    <span className="px-1.5 py-0.2 rounded-full text-[11px] bg-white/20">
                      {auditData?.deletedUsers.length ?? 0}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAuditTab('system')}
                    className={`px-3 py-1.5 rounded-[6px] text-[13px] font-semibold flex items-center gap-1.5 cursor-pointer transition-colors ${
                      auditTab === 'system'
                        ? 'bg-[#0B2A5B] text-white'
                        : 'bg-[var(--surface-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>System &amp; Access Log</span>
                    <span className="px-1.5 py-0.2 rounded-full text-[11px] bg-white/20">
                      {auditData?.systemAuditLogs.length ?? 0}
                    </span>
                  </button>
                </div>

                {/* Search Bar for Audit Records */}
                <div className="relative">
                  <Search
                    className="w-4 h-4 text-[var(--text-secondary)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                    aria-hidden="true"
                  />
                  <input
                    type="text"
                    placeholder="Search audit trail by keyword, ID, author, reason, or event..."
                    value={auditSearch}
                    onChange={(e) => setAuditSearch(e.target.value)}
                    className="w-full min-h-[40px] pl-9 pr-3 rounded-[8px] border border-[var(--border-color)] bg-[var(--surface-card)] text-[13px]"
                  />
                </div>

                {/* Tab 1: Deleted Messages */}
                {auditTab === 'messages' && (
                  <div className="space-y-3">
                    {auditData?.deletedMessages && auditData.deletedMessages.length > 0 ? (
                      auditData.deletedMessages
                        .filter((m) => {
                          if (!auditSearch.trim()) return true;
                          const q = auditSearch.toLowerCase();
                          return (
                            m.body.toLowerCase().includes(q) ||
                            m.deletionReason.toLowerCase().includes(q) ||
                            m.originalId.toLowerCase().includes(q) ||
                            (m.authorId && m.authorId.toLowerCase().includes(q))
                          );
                        })
                        .map((msg) => (
                          <div
                            key={msg.id}
                            className="p-4 rounded-[8px] border border-[var(--border-color)] bg-[var(--surface-subtle)] space-y-2.5 text-[13px]"
                          >
                            <div className="flex items-center justify-between flex-wrap gap-2 text-[12px]">
                              <div className="flex items-center gap-2">
                                <span
                                  className={`px-2 py-0.5 rounded font-bold uppercase tracking-wider ${
                                    msg.messageType === 'post'
                                      ? 'bg-[#0B2A5B] text-white'
                                      : 'bg-[#D9A21B] text-[#0B2A5B]'
                                  }`}
                                >
                                  {msg.messageType}
                                </span>
                                <span className="px-2 py-0.5 rounded bg-red-100 text-red-800 font-semibold border border-red-200">
                                  {msg.deletionReason}
                                </span>
                              </div>
                              <div className="text-[var(--text-secondary)]">
                                <span>Deleted: {new Date(msg.deletedAt).toLocaleString()}</span>
                                <span className="mx-1.5">·</span>
                                <span>Posted: {new Date(msg.originalCreatedAt).toLocaleString()}</span>
                              </div>
                            </div>

                            <div className="p-3 rounded-[6px] bg-[var(--surface-card)] border-l-4 border-red-500 font-mono text-[13px] text-[var(--text-primary)] whitespace-pre-wrap break-words">
                              {msg.body}
                            </div>

                            <div className="flex items-center justify-between flex-wrap gap-2 text-[11px] text-[var(--text-secondary)]">
                              <div>
                                <span>ID: <code>{msg.originalId}</code></span>
                                {msg.authorId && (
                                  <>
                                    <span className="mx-1.5">·</span>
                                    <span>Author UUID: <code>{msg.authorId}</code></span>
                                  </>
                                )}
                              </div>
                              {msg.deletedBy && (
                                <div>
                                  <span>Action By: <code>{msg.deletedBy}</code></span>
                                </div>
                              )}
                            </div>
                          </div>
                        ))
                    ) : (
                      <div className="p-8 rounded-[8px] border border-dashed border-[var(--border-color)] text-center text-[var(--text-secondary)] text-[13px]">
                        No deleted messages recorded in audit archive yet.
                      </div>
                    )}
                  </div>
                )}

                {/* Tab 2: Deleted Users */}
                {auditTab === 'users' && (
                  <div className="space-y-3">
                    {auditData?.deletedUsers && auditData.deletedUsers.length > 0 ? (
                      auditData.deletedUsers
                        .filter((u) => {
                          if (!auditSearch.trim()) return true;
                          const q = auditSearch.toLowerCase();
                          return (
                            u.username.toLowerCase().includes(q) ||
                            u.userId.toLowerCase().includes(q) ||
                            u.deletionReason.toLowerCase().includes(q)
                          );
                        })
                        .map((user) => (
                          <div
                            key={user.id}
                            className="p-4 rounded-[8px] border border-[var(--border-color)] bg-[var(--surface-subtle)] space-y-2 text-[13px]"
                          >
                            <div className="flex items-center justify-between flex-wrap gap-2">
                              <div className="flex items-center gap-2">
                                <UserX className="w-4 h-4 text-red-500" aria-hidden="true" />
                                <span className="font-bold text-[var(--text-heading)]">@{user.username}</span>
                                <span className="px-2 py-0.5 rounded bg-slate-200 text-slate-800 text-[11px] font-semibold">
                                  {user.role}
                                </span>
                              </div>
                              <span className="text-[12px] text-[var(--text-secondary)]">
                                Purged: {new Date(user.deletedAt).toLocaleString()}
                              </span>
                            </div>

                            <div className="flex items-center gap-3 text-[12px] text-[var(--text-secondary)] flex-wrap">
                              <span>User UUID: <code>{user.userId}</code></span>
                              <span>·</span>
                              <span>Reason: <strong className="text-[var(--text-primary)]">{user.deletionReason}</strong></span>
                              {user.accountCreatedAt && (
                                <>
                                  <span>·</span>
                                  <span>Created: {new Date(user.accountCreatedAt).toLocaleDateString()}</span>
                                </>
                              )}
                            </div>
                          </div>
                        ))
                    ) : (
                      <div className="p-8 rounded-[8px] border border-dashed border-[var(--border-color)] text-center text-[var(--text-secondary)] text-[13px]">
                        No deleted accounts recorded in audit archive yet.
                      </div>
                    )}
                  </div>
                )}

                {/* Tab 3: System Access & Activity Log */}
                {auditTab === 'system' && (
                  <div className="space-y-2">
                    {auditData?.systemAuditLogs && auditData.systemAuditLogs.length > 0 ? (
                      auditData.systemAuditLogs
                        .filter((l) => {
                          if (!auditSearch.trim()) return true;
                          const q = auditSearch.toLowerCase();
                          return (
                            l.event.toLowerCase().includes(q) ||
                            (l.actorId && l.actorId.toLowerCase().includes(q))
                          );
                        })
                        .map((log) => (
                          <div
                            key={log.id}
                            className="px-3 py-2.5 rounded-[6px] bg-[var(--surface-subtle)] border border-[var(--border-color)] flex items-center justify-between flex-wrap gap-2 text-[12px]"
                          >
                            <div className="flex items-center gap-2">
                              <FileText className="w-3.5 h-3.5 text-[#0B2A5B]" aria-hidden="true" />
                              <code className="font-semibold text-[#0B2A5B]">{log.event}</code>
                              {log.actorId && (
                                <span className="text-[var(--text-secondary)]">
                                  by <code>{log.actorId.slice(0, 8)}...</code>
                                </span>
                              )}
                            </div>
                            <span className="text-[var(--text-secondary)]">
                              {new Date(log.createdAt).toLocaleString()}
                            </span>
                          </div>
                        ))
                    ) : (
                      <div className="p-8 rounded-[8px] border border-dashed border-[var(--border-color)] text-center text-[var(--text-secondary)] text-[13px]">
                        No security events recorded in system log yet.
                      </div>
                    )}
                  </div>
                )}
              </section>
            )}

            {/* SECTION 4: CHANNELS & FEED */}
            {activeSection === 'channels' && (
              <section className="bg-[var(--surface-card)] border border-[var(--border-color)] rounded-[12px] p-5 space-y-5 shadow-sm">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h3 className="text-[16px] font-bold text-[var(--text-heading)]">
                      Campus Channels &amp; Categories
                    </h3>
                    <p className="text-[12px] text-[var(--text-secondary)]">
                      Manage campus channels, reorder feed tabs, toggle Q&amp;A Ask mode, or install 1-click UPSA presets.
                    </p>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-[#DCE6F5] text-[#0B2A5B] text-[12px] font-bold">
                    {configSummary?.channels?.length ?? 0} channels
                  </span>
                </div>

                {configSummary?.channels && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {configSummary.channels.map((ch, idx) => (
                      <div
                        key={ch.id}
                        className="p-3.5 rounded-[10px] border border-[var(--border-color)] bg-[var(--surface-app)] flex flex-col justify-between gap-3 text-[13px]"
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

                        <div className="flex items-center justify-between gap-2 pt-2 border-t border-[var(--border-color)]">
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
                                ch.isActive ? 'bg-[#1F7A4D] text-white' : 'bg-[#A32121] text-white'
                              }`}
                            >
                              {ch.isActive ? 'Active' : 'Disabled'}
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Quick-Add UPSA Campus Channel Presets */}
                <div className="p-4 rounded-[10px] bg-[var(--surface-subtle)] border border-[var(--border-color)] space-y-2.5">
                  <div className="text-[13px] font-bold text-[var(--text-heading)]">
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
                      const alreadyExists = configSummary?.channels.some(
                        (c) => c.slug.toLowerCase() === preset.slug.toLowerCase()
                      );
                      return (
                        <button
                          key={preset.slug}
                          type="button"
                          disabled={alreadyExists}
                          onClick={() => void handleQuickAddPresetChannel(preset)}
                          className="min-h-[36px] px-3.5 rounded-full bg-[var(--surface-card)] border border-[#1C4A8F] text-[#0B2A5B] text-[12px] font-semibold inline-flex items-center gap-1.5 hover:bg-[#DCE6F5] disabled:opacity-45 cursor-pointer shadow-2xs"
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
                  className="p-4 rounded-[10px] border border-[var(--border-color)] bg-[var(--surface-app)] space-y-3"
                >
                  <div className="text-[13px] font-bold text-[var(--text-heading)]">
                    Create Custom Channel
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <input
                      type="text"
                      required
                      placeholder="Channel Name (e.g. Shuttle Service)"
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
                    placeholder="Short description shown in channel headers..."
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
                        <span>Supports Q&amp;A / Asks (Accepted Answer mode)</span>
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
                      className="min-h-[42px] px-5 rounded-[8px] bg-[#0B2A5B] hover:bg-[#133875] text-white text-[13px] font-semibold inline-flex items-center gap-1.5 cursor-pointer shadow-sm"
                    >
                      <Plus className="w-4 h-4" aria-hidden="true" />
                      <span>Add Campus Channel</span>
                    </button>
                  </div>
                </form>
              </section>
            )}

            {/* SECTION 5: PLACES & GEOFENCES */}
            {activeSection === 'places' && (
              <section className="bg-[var(--surface-card)] border border-[var(--border-color)] rounded-[12px] p-5 space-y-5 shadow-sm">
                <div>
                  <h3 className="text-[16px] font-bold text-[var(--text-heading)]">
                    Campus Places &amp; Spatial Geofences
                  </h3>
                  <p className="text-[12px] text-[var(--text-secondary)]">
                    GPS accuracy enforcement and spatial Polygon boundaries for UPSA Main Campus, Hostels, and Academic Blocks.
                  </p>
                </div>

                {/* GPS Accuracy Gate Slider/Input */}
                <div className="p-4 rounded-[10px] bg-[var(--surface-subtle)] border border-[var(--border-color)] flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-[14px] text-[var(--text-heading)]">
                      GPS Accuracy Threshold Gate (+25m Indoor Drift Buffer)
                    </p>
                    <p className="text-[12px] text-[var(--text-secondary)]">
                      Positions with estimated accuracy radius worse than this return <code>poor_accuracy</code> to prevent spoofing.
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
                      className="min-h-[40px] px-4 rounded-[8px] bg-[#0B2A5B] hover:bg-[#133875] text-white text-[13px] font-semibold cursor-pointer"
                    >
                      Save Threshold
                    </button>
                  </div>
                </div>

                {/* Configured Places Grid */}
                {configSummary?.zones && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="text-[13px] font-bold text-[var(--text-heading)]">
                        Active Campus &amp; Hostel Boundaries ({configSummary.zones.length})
                      </div>
                      <span className="text-[12px] text-[var(--text-secondary)]">
                        Polygons configured in private.zones
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {configSummary.zones.map((z) => (
                        <div
                          key={z.id}
                          className="p-3.5 rounded-[10px] border border-[var(--border-color)] bg-[var(--surface-app)] flex items-center justify-between gap-2.5 text-[13px]"
                        >
                          <div>
                            <div className="font-bold text-[var(--text-heading)]">
                              #{z.id} · {z.name}
                            </div>
                            <div className="text-[12px] text-[var(--text-secondary)]">
                              Max accuracy: {z.maxAccuracyMeters}m · 25m drift buffer
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => void handleTogglePlaceActive(z.id, !z.isActive)}
                            className={`px-3 py-1.5 rounded-[6px] font-semibold text-[12px] cursor-pointer transition-colors ${
                              z.isActive ? 'bg-[#1F7A4D] text-white' : 'bg-[#A32121] text-white'
                            }`}
                          >
                            {z.isActive ? 'Active' : 'Disabled'}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Add New Place via GeoJSON Polygon */}
                <form
                  onSubmit={handleAddGeoJsonPlace}
                  className="p-4 rounded-[10px] border border-[var(--border-color)] bg-[var(--surface-app)] space-y-3"
                >
                  <div className="text-[13px] font-bold text-[var(--text-heading)]">
                    Add Campus Place Boundary (GeoJSON Polygon)
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
                    placeholder='Paste GeoJSON Feature or Polygon coordinates, e.g. {"type":"Feature","geometry":{"type":"Polygon","coordinates":[[[-0.168,5.658],...]]}}'
                    value={newPlaceGeoJson}
                    onChange={(e) => setNewPlaceGeoJson(e.target.value)}
                    className="w-full p-3 rounded-[8px] border border-[var(--border-color)] bg-[var(--surface-card)] font-mono text-[12px]"
                  />
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      className="min-h-[42px] px-4 rounded-[8px] bg-[#0B2A5B] hover:bg-[#133875] text-white text-[13px] font-semibold inline-flex items-center gap-1.5 cursor-pointer shadow-sm"
                    >
                      <Plus className="w-4 h-4" aria-hidden="true" />
                      <span>Save Place &amp; Boundary</span>
                    </button>
                  </div>
                </form>
              </section>
            )}

            {/* SECTION 6: POLICIES & HOLD RULES */}
            {activeSection === 'policies' && (
              <div className="space-y-6">
                {/* Allowed Domains */}
                <section className="bg-[var(--surface-card)] border border-[var(--border-color)] rounded-[12px] p-5 space-y-4 shadow-sm">
                  <div>
                    <h3 className="text-[16px] font-bold text-[var(--text-heading)]">
                      Allow-Listed Student &amp; Staff Email Domains
                    </h3>
                    <p className="text-[12px] text-[var(--text-secondary)]">
                      Only institutional domains can register or post confessions and comments on UPSA Pulse.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-[8px] bg-[var(--surface-subtle)] text-[13px]">
                    <span className="text-[var(--text-secondary)]">Currently Active Domains: </span>
                    <strong className="text-[var(--text-heading)]">
                      {configSummary?.allowedDomains.join(', ') ?? 'upsa.edu.gh, st.upsa.edu.gh'}
                    </strong>
                  </div>

                  <form onSubmit={handleAddAllowedDomain} className="flex flex-wrap gap-2.5">
                    <input
                      type="text"
                      placeholder="Add UPSA subdomain (e.g. alumni.upsa.edu.gh)"
                      value={newDomain}
                      onChange={(e) => setNewDomain(e.target.value)}
                      className="flex-1 min-w-[240px] min-h-[42px] px-3 rounded-[8px] border border-[var(--border-color)] bg-[var(--surface-card)] text-[13px]"
                    />
                    <button
                      type="submit"
                      className="min-h-[42px] px-5 rounded-[8px] bg-[#0B2A5B] hover:bg-[#133875] text-white text-[13px] font-semibold cursor-pointer"
                    >
                      Add Domain
                    </button>
                  </form>
                </section>

                {/* Keyword Pre-screen Hold Rules */}
                <section className="bg-[var(--surface-card)] border border-[var(--border-color)] rounded-[12px] p-5 space-y-4 shadow-sm">
                  <div>
                    <h3 className="text-[16px] font-bold text-[var(--text-heading)]">
                      Keyword &amp; Regex Pre-Screen Hold Rules
                    </h3>
                    <p className="text-[12px] text-[var(--text-secondary)]">
                      Submissions matching these patterns are quarantined automatically for moderator pre-review before appearing in public feeds.
                    </p>
                  </div>

                  <ul className="space-y-2 text-[13px]">
                    {configSummary?.keywordRules.map((rule) => (
                      <li
                        key={rule.id}
                        className="px-3.5 py-2.5 rounded-[8px] bg-[var(--surface-subtle)] border border-[var(--border-color)] flex items-center justify-between"
                      >
                        <div className="flex items-center gap-2">
                          <code className="text-[#0B2A5B] font-bold">{rule.pattern}</code>
                          <span className="text-[12px] text-[var(--text-secondary)]">({rule.matchType})</span>
                        </div>
                        <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[#EEF2F8] text-[#0B2A5B] border border-[#1C4A8F]/20">
                          {rule.category}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <form onSubmit={handleAddKeywordRule} className="flex flex-wrap gap-2.5 pt-2">
                    <input
                      type="text"
                      placeholder="New held keyword or phrase..."
                      value={newKeywordPattern}
                      onChange={(e) => setNewKeywordPattern(e.target.value)}
                      className="flex-1 min-w-[200px] min-h-[42px] px-3 rounded-[8px] border border-[var(--border-color)] bg-[var(--surface-card)] text-[13px]"
                    />
                    <select
                      value={newKeywordCategory}
                      onChange={(e) => setNewKeywordCategory(e.target.value)}
                      className="min-h-[42px] px-3 rounded-[8px] border border-[var(--border-color)] bg-[var(--surface-card)] text-[13px]"
                    >
                      <option value="exam_leak">exam_leak</option>
                      <option value="phone_number_doxxing">phone_number_doxxing</option>
                      <option value="self_harm">self_harm</option>
                      <option value="spam">spam</option>
                    </select>
                    <button
                      type="submit"
                      className="min-h-[42px] px-5 rounded-[8px] bg-[#0B2A5B] hover:bg-[#133875] text-white text-[13px] font-semibold cursor-pointer"
                    >
                      Add Hold Rule
                    </button>
                  </form>
                </section>
              </div>
            )}

            {/* SECTION 7: TWO-PERSON UNMASK GATE */}
            {activeSection === 'unmask' && (
              <section className="bg-[var(--surface-card)] border border-[var(--border-color)] rounded-[12px] p-5 space-y-4 shadow-sm">
                <div className="flex items-center gap-2.5 text-[#8A6200]">
                  <div className="w-8 h-8 rounded-[6px] bg-amber-500/10 flex items-center justify-center">
                    <Lock className="w-4 h-4" aria-hidden="true" />
                  </div>
                  <div>
                    <h3 className="font-bold text-[16px] text-[var(--text-heading)]">
                      Restricted Two-Person Author Unmask Protocol
                    </h3>
                    <p className="text-[12px] text-[var(--text-secondary)]">
                      Statutory disclosure requires two distinct key-holders: Holder A initiates a verified request; Holder B independently inspects and confirms.
                    </p>
                  </div>
                </div>

                <div className="p-3.5 rounded-[8px] bg-amber-500/10 border border-amber-500/20 text-[12px] text-amber-900 leading-relaxed">
                  Disabled by default. When <code>UNMASK_ENABLED=true</code> is set in production environment variables, disclosures are strictly governed under Section 60 of the Ghana Data Protection Act 2012 for credible emergency threats or court orders.
                </div>

                <form onSubmit={handleRequestUnmask} className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <input
                    type="text"
                    value={unmaskPostId}
                    onChange={(e) => setUnmaskPostId(e.target.value)}
                    placeholder="Target Post UUID"
                    className="min-h-[42px] px-3 rounded-[8px] border border-[var(--border-color)] bg-[var(--surface-card)] text-[13px]"
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
                    className="min-h-[42px] px-3 rounded-[8px] border border-[var(--border-color)] bg-[var(--surface-card)] text-[13px]"
                  >
                    <option value="credible_threat">credible_threat</option>
                    <option value="legal_request">legal_request</option>
                    <option value="upsa_disciplinary_referral">upsa_disciplinary_referral</option>
                  </select>
                  <input
                    type="text"
                    value={unmaskReference}
                    onChange={(e) => setUnmaskReference(e.target.value)}
                    placeholder="Case / Warrant Reference Number"
                    className="min-h-[42px] px-3 rounded-[8px] border border-[var(--border-color)] bg-[var(--surface-card)] text-[13px]"
                  />
                  <input
                    type="text"
                    value={unmaskReason}
                    onChange={(e) => setUnmaskReason(e.target.value)}
                    placeholder="Written reason (min 10 chars)..."
                    className="min-h-[42px] px-3 rounded-[8px] border border-[var(--border-color)] bg-[var(--surface-card)] text-[13px]"
                  />

                  <button
                    type="submit"
                    className="min-h-[42px] px-4 rounded-[8px] bg-[#8A6200] hover:bg-[#735200] text-white text-[13px] font-semibold cursor-pointer shadow-sm"
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
                      className="w-28 min-h-[42px] px-3 rounded-[8px] border border-[var(--border-color)] bg-[var(--surface-card)] text-[13px]"
                    />
                    <button
                      type="button"
                      onClick={() => void handleApproveUnmask()}
                      className="flex-1 min-h-[42px] px-3 rounded-[8px] bg-[#0B2A5B] hover:bg-[#133875] text-white text-[13px] font-semibold cursor-pointer shadow-sm"
                    >
                      2. Approve Unmask (Holder B)
                    </button>
                  </div>
                </form>

                {unmaskOutcome && (
                  <div className="p-3.5 rounded-[8px] bg-[var(--surface-subtle)] text-[13px] font-semibold text-[#0B2A5B] border border-[#1C4A8F]/30">
                    {unmaskOutcome}
                  </div>
                )}
              </section>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
