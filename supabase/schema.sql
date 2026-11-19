-- Transitory Things database setup.
-- Paste this whole file into Supabase: SQL Editor > New query > Run.

-- Things you want, bought, or let go.
create table if not exists public.things (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name        text not null,
  url         text,
  store       text,
  price       numeric(12,2),
  currency    text default 'USD',
  board       text,
  note        text,
  image_url   text,
  image_path  text,
  status      text not null default 'want' check (status in ('want','bought','gone')),
  is_public   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists things_user_created on public.things (user_id, created_at desc);

alter table public.things enable row level security;

-- Newer Supabase projects don't grant table access automatically. Signed-in people
-- need it; the policies below still limit each person to their own things.
grant select, insert, update, delete on public.things to authenticated;

-- You can only see and change your own things.
-- (Public profiles in the next stage will add a read policy for is_public = true.)
drop policy if exists "own things: read" on public.things;
create policy "own things: read"   on public.things for select using (auth.uid() = user_id);
drop policy if exists "own things: add" on public.things;
create policy "own things: add"    on public.things for insert with check (auth.uid() = user_id);
drop policy if exists "own things: change" on public.things;
create policy "own things: change" on public.things for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own things: delete" on public.things;
create policy "own things: delete" on public.things for delete using (auth.uid() = user_id);

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists things_touch on public.things;
create trigger things_touch before update on public.things for each row execute function public.touch_updated_at();

-- Photo storage. Files are readable by link (needed to show them), and each person
-- can only add or remove files inside their own folder.
insert into storage.buckets (id, name, public)
values ('things', 'things', true)
on conflict (id) do nothing;

drop policy if exists "things photos: upload own" on storage.objects;
create policy "things photos: upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'things' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "things photos: delete own" on storage.objects;
create policy "things photos: delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'things' and (storage.foldername(name))[1] = auth.uid()::text);

-- Photo framing in the grid: focal point (0-100%) and zoom (1 = fit).
alter table public.things add column if not exists image_x real;
alter table public.things add column if not exists image_y real;
alter table public.things add column if not exists image_zoom real;

-- Your own order on the grid (smaller comes first). New things go to the top.
alter table public.things add column if not exists position double precision;
update public.things set position = -extract(epoch from created_at) where position is null;
alter table public.things alter column position set default (-extract(epoch from now()));
create index if not exists things_user_position on public.things (user_id, position);

-- More about each thing, read from the shop's page: brand, plus color, size, description,
-- availability, the price before a sale, SKU, and category.
alter table public.things add column if not exists brand text;
alter table public.things add column if not exists details jsonb;

-- Sharing: one private link per person (transitorythings.com/s/<code>) that lets anyone
-- with it see your things, read-only. Making a new link turns the old one off.
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.shares (
  user_id    uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  token      text not null unique,
  created_at timestamptz not null default now()
);
alter table public.shares enable row level security;
grant select, insert, update, delete on public.shares to authenticated;
drop policy if exists "own share: read" on public.shares;
create policy "own share: read"   on public.shares for select using (auth.uid() = user_id);
drop policy if exists "own share: delete" on public.shares;
create policy "own share: delete" on public.shares for delete using (auth.uid() = user_id);

-- A short random code: 12 letters and numbers, without look-alikes (0/o, 1/l/i).
create or replace function public.new_share_token() returns text
language plpgsql volatile set search_path = public, extensions as $$
declare
  abc constant text := 'abcdefghjkmnpqrstuvwxyz23456789';
  b bytea := gen_random_bytes(12);
  t text := '';
begin
  for i in 0..11 loop
    t := t || substr(abc, 1 + (get_byte(b, i) % length(abc)), 1);
  end loop;
  return t;
end $$;

-- Your share link's code, made the first time you ask. fresh = true replaces it.
create or replace function public.my_share_token(fresh boolean default false) returns text
language plpgsql volatile security definer set search_path = public as $$
declare me uuid := auth.uid(); t text;
begin
  if me is null then raise exception 'Please sign in.'; end if;
  if not fresh then
    select token into t from shares where user_id = me;
    if t is not null then return t; end if;
  end if;
  insert into shares (user_id, token) values (me, new_share_token())
  on conflict (user_id) do update set token = excluded.token, created_at = now()
  returning token into t;
  return t;
end $$;
revoke all on function public.my_share_token(boolean) from public, anon;
grant execute on function public.my_share_token(boolean) to authenticated;

-- What a share page shows. Your private notes and account details are left out.
-- (Only the two functions below can call this one.)
drop function if exists public.shared_things(text);
drop function if exists public.public_things(uuid);
create or replace function public.public_things(owner uuid)
returns table (
  id uuid, name text, url text, store text, price numeric, currency text, board text,
  image_url text, image_x real, image_y real, image_zoom real, status text,
  created_at timestamptz, "position" double precision, brand text, details jsonb
)
language sql stable security definer set search_path = public as $$
  select t.id, t.name, t.url, t.store, t.price, t.currency, t.board,
         t.image_url, t.image_x, t.image_y, t.image_zoom, t.status,
         t.created_at, t.position, t.brand, t.details
  from things t
  where t.user_id = owner
  order by t.position nulls last, t.created_at desc
$$;
revoke all on function public.public_things(uuid) from public, anon, authenticated;

-- Things behind a private link (/s/<code>).
create function public.shared_things(share_token text)
returns table (
  id uuid, name text, url text, store text, price numeric, currency text, board text,
  image_url text, image_x real, image_y real, image_zoom real, status text,
  created_at timestamptz, "position" double precision, brand text, details jsonb
)
language sql stable security definer set search_path = public as $$
  select p.* from shares s, public_things(s.user_id) p where s.token = share_token
$$;
revoke all on function public.shared_things(text) from public;
grant execute on function public.shared_things(text) to anon, authenticated;

-- Names: your public page at <name>.transitorythings.com.
create table if not exists public.profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  handle     text unique check (handle ~ '^[a-z0-9]([a-z0-9-]{1,28}[a-z0-9])$' and handle !~ '--'),
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
grant select on public.profiles to authenticated;
drop policy if exists "own profile: read" on public.profiles;
create policy "own profile: read" on public.profiles for select using (auth.uid() = user_id);

-- Choose, change, or remove (empty) your name. Returns the name, or an error people can read.
create or replace function public.set_my_handle(new_handle text) returns text
language plpgsql volatile security definer set search_path = public as $$
declare me uuid := auth.uid(); h text := lower(trim(coalesce(new_handle, '')));
begin
  if me is null then raise exception 'Please sign in.'; end if;
  if h = '' then
    delete from profiles where user_id = me;
    return null;
  end if;
  if h !~ '^[a-z0-9]([a-z0-9-]{1,28}[a-z0-9])$' or h ~ '--' then
    raise exception 'Use 3 to 30 letters, numbers, or single hyphens (not at the start or end).';
  end if;
  if h = any (array['www','app','api','admin','login','signup','auth','mail','email','help','support',
                    'blog','about','s','u','static','assets','cdn','img','images','dev','staging','test',
                    'preview','status','docs','shop','store','account','settings','root','transitory',
                    'transitorythings','things','save','clip','share']) then
    raise exception 'That name is reserved. Try another.';
  end if;
  if exists (select 1 from profiles where handle = h and user_id <> me) then
    raise exception 'That name is taken. Try another.';
  end if;
  insert into profiles (user_id, handle) values (me, h)
  on conflict (user_id) do update set handle = excluded.handle;
  return h;
end $$;
revoke all on function public.set_my_handle(text) from public, anon;
grant execute on function public.set_my_handle(text) to authenticated;

-- Things on someone's name page.
drop function if exists public.handle_things(text);
create function public.handle_things(page_handle text)
returns table (
  id uuid, name text, url text, store text, price numeric, currency text, board text,
  image_url text, image_x real, image_y real, image_zoom real, status text,
  created_at timestamptz, "position" double precision, brand text, details jsonb
)
language sql stable security definer set search_path = public as $$
  select p.* from profiles f, public_things(f.user_id) p where f.handle = lower(page_handle)
$$;
revoke all on function public.handle_things(text) from public;
grant execute on function public.handle_things(text) to anon, authenticated;
