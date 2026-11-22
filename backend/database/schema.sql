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
  semester text not null,
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
    coalesce(new.raw_user_meta_data->>'semester', 'Semester 1'),
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
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete set null,
  title text not null,
  description text not null, -- Maximum 25 words verified by constraint & API
  department text not null,
  semester text not null,
  subject text not null,
  file_path text not null,
  file_type text not null, -- PDF, PPTX, DOCX
  file_size text,
  file_hash text, -- SHA-256 hash to detect exact duplicate uploads
  page_count integer default 1 check (page_count <= 150),
  verification_status text default 'PENDING' check (verification_status in ('PENDING', 'APPROVED', 'REJECTED', 'NEEDS_REVIEW')),
  verification_reason text,
  downloads integer default 0,
  rating numeric(3, 1) default 5.0,
  rating_count integer default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Indexing for fast search and filtering
create index if not exists idx_materials_status on public.materials(verification_status);
create index if not exists idx_materials_dept_sub on public.materials(department, semester, subject);
create index if not exists idx_materials_user on public.materials(user_id);
create index if not exists idx_materials_created on public.materials(created_at desc);

-- 4. Material Chunks & Embeddings (RAG with pgvector)
create table if not exists public.material_chunks (
  id uuid default uuid_generate_v4() primary key,
  material_id uuid references public.materials(id) on delete cascade not null,
  chunk_text text not null,
  page_number integer not null default 1,
  chunk_index integer not null default 0,
  embedding vector(1536), -- 1536-dim vector for standard embeddings
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_chunks_material on public.material_chunks(material_id);
-- HNSW Vector Index for fast cosine similarity search
create index if not exists idx_chunks_embedding on public.material_chunks using hnsw (embedding vector_cosine_ops);

-- 5. Conversations Table (AI Study Assistant & Ask This Material)
create table if not exists public.conversations (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  title text not null default 'New Conversation',
  material_id uuid references public.materials(id) on delete set null, -- Non-null for 'Ask This Material'
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_conversations_user on public.conversations(user_id);

-- 6. Messages Table
create table if not exists public.messages (
  id uuid default uuid_generate_v4() primary key,
  conversation_id uuid references public.conversations(id) on delete cascade not null,
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
  filter_material_id uuid default null
)
returns table (
  id uuid,
  material_id uuid,
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

-- Profiles: Authenticated users can view profiles; only self or admin can update
create policy "Profiles viewable by authenticated users"
  on public.profiles for select
  to authenticated
  using (true);

create policy "Users can update own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id);

-- Materials:
-- Publicly visible if APPROVED; uploader or admin can see any status
create policy "Anyone authenticated can view APPROVED materials"
  on public.materials for select
  to authenticated
  using (
    verification_status = 'APPROVED'
    or auth.uid() = user_id
    or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

create policy "Authenticated users can upload materials"
  on public.materials for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update own materials or admins"
  on public.materials for update
  to authenticated
  using (
    auth.uid() = user_id
    or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

create policy "Users can delete own materials or admins"
  on public.materials for delete
  to authenticated
  using (
    auth.uid() = user_id
    or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- Chunks: Readable if associated material is APPROVED or owned
create policy "Chunks viewable for approved materials or owner"
  on public.material_chunks for select
  to authenticated
  using (
    exists (
      select 1 from public.materials m
      where m.id = material_chunks.material_id
        and (m.verification_status = 'APPROVED' or m.user_id = auth.uid())
    )
  );

-- Conversations: Only owner can view, insert, update, delete
create policy "Conversations owner only"
  on public.conversations for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Messages: Only conversation owner can view, insert, delete
create policy "Messages conversation owner only"
  on public.messages for all
  to authenticated
  using (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id and c.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id and c.user_id = auth.uid()
    )
  );

-- 9. Storage Bucket: materials
-- Run in Supabase SQL editor or create in Supabase dashboard
insert into storage.buckets (id, name, public)
values ('materials', 'materials', false)
on conflict (id) do nothing;

create policy "Authenticated users can upload study files"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'materials');

create policy "Authenticated users can read approved study files"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'materials');
