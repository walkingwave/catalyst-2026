-- auth.users.phone has no leading "+"; keep public.users.phone in E.164 so Twilio can text it.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, name, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', ''),
    case when new.phone is null then null else '+' || ltrim(new.phone, '+') end
  )
  on conflict (id) do update
    set phone = excluded.phone,
        name = case when public.users.name = '' then excluded.name else public.users.name end;
  return new;
end;
$$;

update public.users set phone = '+' || phone where phone is not null and phone not like '+%';
