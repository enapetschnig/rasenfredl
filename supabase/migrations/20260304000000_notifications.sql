-- Notifications table for real-time push notifications
create table if not exists public.notifications (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  type text not null check (type in ('krankmeldung', 'lohnzettel')),
  message text not null,
  data jsonb,
  read boolean default false,
  created_at timestamptz default now()
);

alter table public.notifications enable row level security;

-- Users can read their own notifications
create policy "Users can read own notifications"
  on public.notifications for select
  using (auth.uid() = user_id);

-- Authenticated users can insert notifications (needed to notify admins/employees)
create policy "Authenticated users can insert notifications"
  on public.notifications for insert
  with check (auth.role() = 'authenticated');

-- Users can mark their own notifications as read
create policy "Users can update own notifications"
  on public.notifications for update
  using (auth.uid() = user_id);

-- Enable realtime for this table
alter publication supabase_realtime add table public.notifications;
