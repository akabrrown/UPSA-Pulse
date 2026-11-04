-- 001 extensions and schemas
create extension if not exists postgis;
create extension if not exists pgcrypto;
create extension if not exists pg_cron;
create extension if not exists citext;

create schema if not exists private; -- tables; never exposed through the API
create schema if not exists feed;    -- views and RPC functions; the only exposed schema
revoke all on schema private from public, anon, authenticated;

