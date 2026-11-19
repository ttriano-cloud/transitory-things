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
