-- Banca de Palha: banco no Supabase, protegido por um código de acesso.
-- Cole tudo no SQL Editor do Supabase e clique em Run. Pode rodar de novo sem estragar nada.
--
-- Como funciona: todos os dados da banca ficam em UMA linha (jsonb), igual ao arquivo banco.json do servidor local.
-- As tabelas ficam fechadas (RLS ligado, sem regras): o app só consegue chamar as duas funções abaixo,
-- e elas só respondem a quem informa o código de acesso. Sem o código, a chave pública do Supabase não serve para nada.
-- O código nunca é guardado: só o hash (SHA-256). Sem hash cadastrado, tudo fica bloqueado.
-- "rev" impede que dois aparelhos sobrescrevam um ao outro: quem salva com uma versão velha recebe "conflito".

create table if not exists public.banco (
  id int primary key default 1 check (id = 1),
  dados jsonb not null,
  rev int not null default 0,
  atualizado_em timestamptz not null default now()
);

-- uma cópia por dia, como a pasta dados/copias do servidor local
create table if not exists public.banco_copias (
  dia date primary key,
  dados jsonb not null,
  rev int not null
);

create table if not exists public.acesso (
  id int primary key default 1 check (id = 1),
  hash text not null
);

alter table public.banco enable row level security;
alter table public.banco_copias enable row level security;
alter table public.acesso enable row level security;
revoke all on public.banco, public.banco_copias, public.acesso from anon, authenticated;

-- versões antigas, sem código: removidas para não deixar porta aberta
drop function if exists public.ler_banco();
drop function if exists public.salvar_banco(int, jsonb);

create or replace function public.codigo_ok(codigo text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  h text;
begin
  select hash into h from public.acesso where id = 1;
  if h is not null and codigo is not null and h = encode(sha256(convert_to(codigo, 'UTF8')), 'hex') then
    return true;
  end if;
  perform pg_sleep(1); -- atrapalha quem tenta adivinhar
  return false;
end;
$$;

create or replace function public.ler_banco(codigo text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb;
begin
  if not public.codigo_ok(codigo) then
    return jsonb_build_object('negado', true);
  end if;
  select jsonb_build_object('rev', rev, 'dados', dados) into r from public.banco where id = 1;
  return coalesce(r, jsonb_build_object('vazio', true));
end;
$$;

create or replace function public.salvar_banco(codigo text, base_rev int, novo jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  atual int;
  antigo jsonb;
begin
  if not public.codigo_ok(codigo) then
    return jsonb_build_object('negado', true);
  end if;
  if novo is null or jsonb_typeof(novo) <> 'object' then
    raise exception 'dados inválidos';
  end if;

  select rev, dados into atual, antigo from public.banco where id = 1 for update;

  if not found then
    if coalesce(base_rev, 0) <> 0 then
      return jsonb_build_object('conflito', true, 'rev', 0);
    end if;
    insert into public.banco (id, dados, rev) values (1, novo, 1);
    return jsonb_build_object('rev', 1);
  end if;

  if atual <> coalesce(base_rev, 0) then
    return jsonb_build_object('conflito', true, 'rev', atual);
  end if;

  -- guarda o estado de antes do primeiro salvamento de cada dia
  insert into public.banco_copias (dia, dados, rev)
  values (current_date, antigo, atual)
  on conflict (dia) do nothing;

  update public.banco set dados = novo, rev = atual + 1, atualizado_em = now() where id = 1;
  return jsonb_build_object('rev', atual + 1);
end;
$$;

revoke all on function public.codigo_ok(text) from public, anon, authenticated;
revoke all on function public.ler_banco(text) from public;
revoke all on function public.salvar_banco(text, int, jsonb) from public;
grant execute on function public.ler_banco(text) to anon, authenticated;
grant execute on function public.salvar_banco(text, int, jsonb) to anon, authenticated;

-- Para definir ou trocar o código (rode à parte, com o hash SHA-256 do código em MAIÚSCULAS, sem traços ou espaços):
--   insert into public.acesso (id, hash) values (1, 'COLE_O_HASH_AQUI')
--   on conflict (id) do update set hash = excluded.hash;
