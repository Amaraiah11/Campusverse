-- ====================================================================
-- CAMPUSVERSE SUPABASE DATABASE SCHEMA
-- Extensions: uuid-ossp, pgvector
-- Tables: profiles, materials, material_chunks, conversations, messages
-- Storage: materials bucket
-- ====================================================================

-- 1. Enable Required Extensions
create extension if not exists "uuid-ossp";
create extension if not exists "vector";

-- 2. User Profiles Table
-- Linked to Supabase Auth auth.users
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  full_name text not null,
  email text unique not null,
  department text not null,
  semester text default 'General',
  role text not null default 'student' check (role in ('student', 'admin')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Automatic Profile Creation Trigger for Supabase Auth
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, email, department, semester, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', 'Student Contributor'),
    new.email,
    coalesce(new.raw_user_meta_data->>'department', 'Computer Science & Engineering'),
    coalesce(new.raw_user_meta_data->>'semester', 'General'),
    coalesce(new.raw_user_meta_data->>'role', 'student')
  )
  on conflict (id) do update set
    full_name = excluded.full_name,
    department = excluded.department,
    semester = excluded.semester;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 3. Study Materials Table
create table if not exists public.materials (
  id text primary key default gen_random_uuid()::text,
  user_id text,
  uploader_name text default 'Student Scholar',
  uploader_email text default 'student@campusverse.edu',
  title text not null,
  description text not null,
  category text default 'Study Material',
  document_type text default 'Study Material',
  department text not null,
  semester text default 'General',
  subject text not null,
  file_path text not null,
  file_type text not null, -- PDF, PPTX, DOCX
  file_size text,
  file_hash text,
  page_count integer default 1 check (page_count <= 150),
  verification_status text default 'APPROVED',
  verification_reason text default 'Document content verified.',
  downloads integer default 0,
  rating numeric(3, 1) default 5.0,
  rating_count integer default 0,
  ratings jsonb default '[]'::jsonb,
  extracted_text text,
  summary text,
  chunks jsonb default '[]'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Indexing for fast search and filtering
create index if not exists idx_materials_status on public.materials(verification_status);
create index if not exists idx_materials_dept_sub on public.materials(department, subject);
create index if not exists idx_materials_category on public.materials(category);
create index if not exists idx_materials_user on public.materials(user_id);
create index if not exists idx_materials_created on public.materials(created_at desc);

-- 4. Material Chunks & Embeddings (RAG with pgvector)
create table if not exists public.material_chunks (
  id uuid default gen_random_uuid() primary key,
  material_id text references public.materials(id) on delete cascade not null,
  chunk_text text not null,
  page_number integer not null default 1,
  chunk_index integer not null default 0,
  embedding vector(1536), -- 1536-dim vector for embeddings
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_chunks_material on public.material_chunks(material_id);
create index if not exists idx_chunks_embedding on public.material_chunks using hnsw (embedding vector_cosine_ops);

-- 5. Conversations Table (AI Study Assistant & Ask This Material)
create table if not exists public.conversations (
  id text primary key default gen_random_uuid()::text,
  user_id text not null,
  title text not null default 'New Conversation',
  material_id text references public.materials(id) on delete set null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_conversations_user on public.conversations(user_id);

-- 6. Messages Table
create table if not exists public.messages (
  id text primary key default gen_random_uuid()::text,
  conversation_id text references public.conversations(id) on delete cascade not null,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  sources jsonb default '[]'::jsonb, -- Array of { materialId, title, pageNumber, snippet }
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_messages_conversation on public.messages(conversation_id, created_at asc);

-- 7. Supabase RPC Function: Vector Similarity Search
create or replace function match_material_chunks (
  query_embedding vector(1536),
  match_threshold float default 0.65,
  match_count int default 6,
  filter_material_id text default null
)
returns table (
  id uuid,
  material_id text,
  chunk_text text,
  page_number int,
  material_title text,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    mc.id,
    mc.material_id,
    mc.chunk_text,
    mc.page_number,
    m.title as material_title,
    1 - (mc.embedding <=> query_embedding) as similarity
  from public.material_chunks mc
  inner join public.materials m on m.id = mc.material_id
  where m.verification_status = 'APPROVED'
    and (filter_material_id is null or mc.material_id = filter_material_id)
    and 1 - (mc.embedding <=> query_embedding) > match_threshold
  order by similarity desc
  limit match_count;
end;
$$;

-- 8. Row Level Security (RLS) Policies
alter table public.profiles enable row level security;
alter table public.materials enable row level security;
alter table public.material_chunks enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

-- Profiles Policies
drop policy if exists "Allow select profiles" on public.profiles;
create policy "Allow select profiles" on public.profiles for select to anon, authenticated using (true);
drop policy if exists "Allow insert profiles" on public.profiles;
create policy "Allow insert profiles" on public.profiles for insert to anon, authenticated with check (true);
drop policy if exists "Allow update profiles" on public.profiles;
create policy "Allow update profiles" on public.profiles for update to anon, authenticated using (true);

-- Materials Policies
drop policy if exists "Allow select materials" on public.materials;
create policy "Allow select materials" on public.materials for select to anon, authenticated using (true);
drop policy if exists "Allow insert materials" on public.materials;
create policy "Allow insert materials" on public.materials for insert to anon, authenticated with check (true);
drop policy if exists "Allow update materials" on public.materials;
create policy "Allow update materials" on public.materials for update to anon, authenticated using (true);
drop policy if exists "Allow delete materials" on public.materials;
create policy "Allow delete materials" on public.materials for delete to anon, authenticated using (true);

-- Material Chunks Policies
drop policy if exists "Allow select chunks" on public.material_chunks;
create policy "Allow select chunks" on public.material_chunks for select to anon, authenticated using (true);
drop policy if exists "Allow insert chunks" on public.material_chunks;
create policy "Allow insert chunks" on public.material_chunks for insert to anon, authenticated with check (true);
drop policy if exists "Allow update chunks" on public.material_chunks;
create policy "Allow update chunks" on public.material_chunks for update to anon, authenticated using (true);
drop policy if exists "Allow delete chunks" on public.material_chunks;
create policy "Allow delete chunks" on public.material_chunks for delete to anon, authenticated using (true);

-- Conversations Policies
drop policy if exists "Allow all conversations" on public.conversations;
create policy "Allow all conversations" on public.conversations for all to anon, authenticated using (true) with check (true);

-- Messages Policies
drop policy if exists "Allow all messages" on public.messages;
create policy "Allow all messages" on public.messages for all to anon, authenticated using (true) with check (true);

-- 9. Storage Bucket: materials
insert into storage.buckets (id, name, public)
values ('materials', 'materials', true)
on conflict (id) do update set public = true;

drop policy if exists "Allow public read materials bucket" on storage.objects;
create policy "Allow public read materials bucket"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'materials');

drop policy if exists "Allow upload materials bucket" on storage.objects;
create policy "Allow upload materials bucket"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'materials');

drop policy if exists "Allow update materials bucket" on storage.objects;
create policy "Allow update materials bucket"
  on storage.objects for update
  to anon, authenticated
  using (bucket_id = 'materials');

drop policy if exists "Allow delete materials bucket" on storage.objects;
create policy "Allow delete materials bucket"
  on storage.objects for delete
  to anon, authenticated
  using (bucket_id = 'materials');
