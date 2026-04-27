create table if not exists chat_sessions (
  id text primary key,
  provider text not null,
  channel text,
  user_id text,
  status text not null,
  summary text,
  started_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  message_count integer not null default 0
);

create table if not exists chat_messages (
  id text primary key,
  session_id text not null references chat_sessions(id) on delete cascade,
  seq integer not null default 0,
  role text not null,
  content text not null,
  provider text not null,
  latency_ms integer,
  finish_reason text,
  error_code text,
  metadata_json jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists chat_messages_session_seq_idx
  on chat_messages(session_id, seq);

create index if not exists chat_messages_session_created_at_idx
  on chat_messages(session_id, created_at);
