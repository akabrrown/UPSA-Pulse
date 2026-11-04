-- 002 enums
create type private.post_kind as enum ('post','ask');
create type private.content_status as enum ('published','held','hidden','removed','archived');
create type private.user_status as enum ('active','suspended','banned','deleted');
create type private.target_type as enum ('post','reply');
create type private.report_reason as enum (
  'self_harm',
  'threat_of_violence',
  'doxxing',
  'harassment',
  'hate',
  'sexual',
  'exam_leak',
  'false_claim',
  'spam',
  'other'
);
create type private.report_status as enum ('open','actioned','dismissed');
create type private.device_status as enum ('trusted','pending','revoked');

