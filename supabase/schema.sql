-- Execute no SQL Editor do Supabase. É idempotente e não apaga dados.
create table if not exists public.nexora_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.nexora_state enable row level security;

-- O backend usa a secret key e valida o usuário antes de consultar esta tabela.
-- Nenhum acesso direto do navegador às linhas financeiras é necessário.
revoke all on table public.nexora_state from anon, authenticated;
