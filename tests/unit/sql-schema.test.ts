import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Backend Schema DDL & Security Invariants (UPSA-Pulse-5-Backend-Schema Section 9)', () => {
  const migrationsDir = path.resolve(__dirname, '../../supabase/migrations');
  const files = fs.readdirSync(migrationsDir).sort();
  const fullSql = files
    .map((file) => fs.readFileSync(path.join(migrationsDir, file), 'utf8'))
    .join('\n');

  it('includes all numbered migrations 001 through 015', () => {
    expect(files.length).toBeGreaterThanOrEqual(15);
    expect(files[0]).toMatch(/^001_/);
    expect(files[13]).toMatch(/^014_/);
  });

  it('revokes all privileges on schema private from public, anon, and authenticated', () => {
    expect(fullSql).toContain('revoke all on schema private from public, anon, authenticated;');
    expect(fullSql).toContain('revoke all on all tables in schema private from anon, authenticated;');
    expect(fullSql).toContain('revoke all on all functions in schema private from public, anon, authenticated;');
  });

  it('enables Row Level Security on every table in schema private', () => {
    expect(fullSql).toContain("alter table private.%I enable row level security");
  });

  it('never exposes author_id, user_id, email, or device_hash in any feed.* function return table', () => {
    const feedFunctionMatches = fullSql.match(/create function feed\.[a-z0-9_]+\([\s\S]*?\$\$/gi) ?? [];
    expect(feedFunctionMatches.length).toBeGreaterThanOrEqual(10);

    for (const fnSql of feedFunctionMatches) {
      const returnsMatch = fnSql.match(/returns\s+table\s*\(([\s\S]*?)\)\s*language/i);
      if (returnsMatch?.[1]) {
        const returnCols = returnsMatch[1].toLowerCase();
        expect(returnCols).not.toContain('author_id');
        expect(returnCols).not.toContain('user_id');
        expect(returnCols).not.toContain('email');
        expect(returnCols).not.toContain('device_hash');
      }
    }
  });

  it('enforces append-only triggers on moderation_actions, audit_logs, and deleted security archives', () => {
    expect(fullSql).toContain('create trigger moderation_actions_append_only before update or delete on private.moderation_actions');
    expect(fullSql).toContain('create trigger audit_logs_append_only before update or delete on private.audit_logs');
    expect(fullSql).toContain('create trigger deleted_messages_audit_append_only\n  before update or delete on private.deleted_messages_audit');
    expect(fullSql).toContain('create trigger deleted_users_audit_append_only\n  before update or delete on private.deleted_users_audit');
  });

  it('enforces one trusted device per user and per device_hash via partial unique indexes', () => {
    expect(fullSql).toContain('create unique index one_trusted_account_per_device on private.devices (device_hash) where status = \'trusted\'');
    expect(fullSql).toContain('create unique index one_trusted_device_per_user on private.devices (user_id) where status = \'trusted\'');
  });

  it('enforces two-person unmask constraint where approved_by <> requested_by', () => {
    expect(fullSql).toContain('check (approved_by is null or approved_by <> requested_by)');
  });
});

