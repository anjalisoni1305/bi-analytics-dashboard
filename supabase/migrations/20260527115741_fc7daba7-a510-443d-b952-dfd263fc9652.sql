
-- ============ ENUMS ============
create type public.app_role as enum ('admin', 'user');
create type public.datasource_type as enum ('csv', 'api', 'manual');
create type public.widget_type as enum ('chart_bar', 'chart_line', 'chart_pie', 'kpi', 'table');

-- ============ PROFILES ============
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "Profiles are viewable by authenticated"
  on public.profiles for select to authenticated using (true);
create policy "Users update own profile"
  on public.profiles for update to authenticated using (auth.uid() = id);
create policy "Users insert own profile"
  on public.profiles for insert to authenticated with check (auth.uid() = id);

-- ============ ORGANIZATIONS ============
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.organizations to authenticated;
grant all on public.organizations to service_role;
alter table public.organizations enable row level security;

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(organization_id, user_id)
);
grant select, insert, update, delete on public.organization_members to authenticated;
grant all on public.organization_members to service_role;
alter table public.organization_members enable row level security;

-- security definer helper to avoid RLS recursion
create or replace function public.is_org_member(_user_id uuid, _org_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.organization_members where user_id = _user_id and organization_id = _org_id)
$$;

create policy "Members view their orgs"
  on public.organizations for select to authenticated
  using (public.is_org_member(auth.uid(), id));
create policy "Owners update orgs"
  on public.organizations for update to authenticated using (owner_id = auth.uid());
create policy "Users create orgs"
  on public.organizations for insert to authenticated with check (owner_id = auth.uid());

create policy "Members view memberships"
  on public.organization_members for select to authenticated
  using (public.is_org_member(auth.uid(), organization_id));
create policy "Users join via owner"
  on public.organization_members for insert to authenticated with check (user_id = auth.uid());

-- ============ USER ROLES ============
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  role public.app_role not null default 'user',
  created_at timestamptz not null default now(),
  unique(user_id, organization_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _org_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles
    where user_id = _user_id and organization_id = _org_id and role = _role)
$$;

create policy "Members read roles in org"
  on public.user_roles for select to authenticated
  using (public.is_org_member(auth.uid(), organization_id));

-- ============ DATASOURCES ============
create table public.datasources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  type public.datasource_type not null default 'csv',
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index on public.datasources(organization_id);
grant select, insert, update, delete on public.datasources to authenticated;
grant all on public.datasources to service_role;
alter table public.datasources enable row level security;
create policy "Members manage datasources"
  on public.datasources for all to authenticated
  using (public.is_org_member(auth.uid(), organization_id))
  with check (public.is_org_member(auth.uid(), organization_id));

-- ============ DATASETS ============
create table public.datasets (
  id uuid primary key default gen_random_uuid(),
  datasource_id uuid not null references public.datasources(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  schema jsonb not null default '{}'::jsonb,
  row_count integer not null default 0,
  created_at timestamptz not null default now()
);
create index on public.datasets(organization_id);
create index on public.datasets(datasource_id);
grant select, insert, update, delete on public.datasets to authenticated;
grant all on public.datasets to service_role;
alter table public.datasets enable row level security;
create policy "Members manage datasets"
  on public.datasets for all to authenticated
  using (public.is_org_member(auth.uid(), organization_id))
  with check (public.is_org_member(auth.uid(), organization_id));

-- ============ RECORDS ============
create table public.records (
  id uuid primary key default gen_random_uuid(),
  dataset_id uuid not null references public.datasets(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  data jsonb not null,
  created_at timestamptz not null default now()
);
create index on public.records(dataset_id);
create index on public.records(organization_id);
create index on public.records using gin (data);
grant select, insert, update, delete on public.records to authenticated;
grant all on public.records to service_role;
alter table public.records enable row level security;
create policy "Members manage records"
  on public.records for all to authenticated
  using (public.is_org_member(auth.uid(), organization_id))
  with check (public.is_org_member(auth.uid(), organization_id));

-- ============ DASHBOARDS ============
create table public.dashboards (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index on public.dashboards(organization_id);
grant select, insert, update, delete on public.dashboards to authenticated;
grant all on public.dashboards to service_role;
alter table public.dashboards enable row level security;
create policy "Members manage dashboards"
  on public.dashboards for all to authenticated
  using (public.is_org_member(auth.uid(), organization_id))
  with check (public.is_org_member(auth.uid(), organization_id));

-- ============ WIDGETS ============
create table public.widgets (
  id uuid primary key default gen_random_uuid(),
  dashboard_id uuid not null references public.dashboards(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  type public.widget_type not null,
  config jsonb not null default '{}'::jsonb,
  position jsonb not null default '{"x":0,"y":0,"w":4,"h":2}'::jsonb,
  created_at timestamptz not null default now()
);
create index on public.widgets(dashboard_id);
grant select, insert, update, delete on public.widgets to authenticated;
grant all on public.widgets to service_role;
alter table public.widgets enable row level security;
create policy "Members manage widgets"
  on public.widgets for all to authenticated
  using (public.is_org_member(auth.uid(), organization_id))
  with check (public.is_org_member(auth.uid(), organization_id));

-- ============ REPORTS ============
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  dashboard_id uuid references public.dashboards(id) on delete set null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  generated_by uuid not null references auth.users(id) on delete cascade,
  name text not null,
  format text not null,
  file_url text,
  created_at timestamptz not null default now()
);
create index on public.reports(organization_id);
grant select, insert, update, delete on public.reports to authenticated;
grant all on public.reports to service_role;
alter table public.reports enable row level security;
create policy "Members manage reports"
  on public.reports for all to authenticated
  using (public.is_org_member(auth.uid(), organization_id))
  with check (public.is_org_member(auth.uid(), organization_id));

-- ============ TRIGGERS ============
-- new user: create profile + personal org + membership + admin role
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  new_org_id uuid;
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)));

  insert into public.organizations (name, owner_id)
  values (coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)) || '''s Workspace', new.id)
  returning id into new_org_id;

  insert into public.organization_members (organization_id, user_id)
  values (new_org_id, new.id);

  insert into public.user_roles (user_id, organization_id, role)
  values (new.id, new_org_id, 'admin');

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
