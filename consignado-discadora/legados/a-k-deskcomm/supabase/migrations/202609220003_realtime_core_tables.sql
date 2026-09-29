-- Enable Supabase Realtime for collaborative Deskcomm screens.
do $$ begin
  begin alter publication supabase_realtime add table public.conversations; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.messages; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.leads; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.followups; exception when duplicate_object then null; end;
end $$;
