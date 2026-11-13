-- Client ID Metadata Documents (lib/mcp/oauth.ts): an assistant can identify itself with an https URL
-- as its client_id (Claude publishes one), instead of registering. Those ids are URLs, so allow them.
begin;

alter table public.mcp_clients drop constraint mcp_clients_client_id_check;
alter table public.mcp_clients add constraint mcp_clients_client_id_check check (length(client_id) between 8 and 500);

commit;
