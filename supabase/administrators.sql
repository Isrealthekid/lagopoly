create table if not exists monopoly.administrators(user_id text primary key references monopoly.users(id));
alter table monopoly.administrators enable row level security;
revoke all on monopoly.administrators from public, anon, authenticated;
