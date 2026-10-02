-- Already applied to the Monopoly project as monopoly_private_game_storage.
-- Bootstrap reference for a new empty Supabase project; not a startup script.
create schema monopoly;
revoke all on schema monopoly from public, anon, authenticated;
create table monopoly.users(id text primary key,username text not null,key text unique not null,salt text not null,password text not null);
create table monopoly.sessions(token text primary key,"user" text not null references monopoly.users(id),expires bigint not null);
create index sessions_expiry on monopoly.sessions(expires);
create index sessions_user on monopoly.sessions("user");
create table monopoly.rooms(code text primary key,payload text not null);
create table monopoly.completed(code text primary key,payload text not null,expires bigint not null);
create index completed_expiry on monopoly.completed(expires);
alter table monopoly.users enable row level security;
alter table monopoly.sessions enable row level security;
alter table monopoly.rooms enable row level security;
alter table monopoly.completed enable row level security;
revoke all on all tables in schema monopoly from public, anon, authenticated;
comment on schema monopoly is 'Private game backend storage; never expose through the Data API.';
