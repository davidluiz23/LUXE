-- Keep both signup verification methods on the same 15-minute lifetime.

begin;

alter table public.pending_signups
  add column if not exists code_expires_at timestamptz;

update public.pending_signups
set expires_at = least(expires_at, created_at + interval '15 minutes');

update public.pending_signups
set code_expires_at = least(expires_at, created_at + interval '15 minutes')
where code_hash is not null;

commit;
