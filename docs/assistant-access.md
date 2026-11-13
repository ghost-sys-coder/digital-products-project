# Assistant access (MCP)

The studio runs its own MCP server at `https://pod.veilcode.studio/api/mcp`. Claude, ChatGPT, Codex and Claude Code all connect to it and get the same tools. Set up and manage connections in the admin under **Connections**.

## Connecting

| Assistant | How it signs in | Steps |
|---|---|---|
| Claude (web, desktop, mobile) | App sign-in (OAuth) | Settings → Connectors → Add custom connector → paste the address → Connect, then approve on the studio's consent page. |
| ChatGPT | App sign-in (OAuth) | Settings → Apps & Connectors → Advanced → turn on Developer mode (needed for anything beyond reading). Then Create → paste the address → OAuth → approve. |
| Claude Code | Personal token | Create a token under Connections, then `claude mcp add --transport http veilcode <address> --header "Authorization: Bearer <token>"`. |
| Codex | Personal token | Create a token, add `[mcp_servers.veilcode]` with `url = "<address>"` and `bearer_token_env_var = "VEILCODE_MCP_TOKEN"` to `~/.codex/config.toml`, and set that variable. |

Staging is behind Vercel's login, so outside assistants can only reach production.

## What each access level allows

- **See the store** (`read`): performance, orders, products, stores, research. Order lists leave out customer names, emails and addresses; `get_order` shows them for one order you ask about.
- **Research products** (`research`): CJ search and costs, Meta ads (UK/EU), and saving or updating ideas on the research board, including research done elsewhere.
- **Build drafts** (`build`): create and edit draft stores and digital products, and add images and files (from a link, a ChatGPT attachment, or uploaded in pieces).

Assistants never publish, refund, or change payments or settings. Live stores and products are read-only to them. Every tool call is logged under Connections → Activity, and any connection can be narrowed or switched off there.

## Tools

Read: `get_store_overview`, `list_orders`, `get_order`, `list_products`, `get_store`, `get_digital_product`, `list_research_ideas`, `get_research_idea`.
Research: `search_meta_ads`, `search_cj_products`, `get_cj_product_costs`, `save_research_idea`, `update_research_idea`.
Build: `create_store`, `save_store_draft`, `create_digital_product_draft`, `update_digital_product_draft`, `import_file`, `start_file_upload`, `upload_file_part`.

## How it's built

- `lib/mcp/server.ts`: the tools, registered per connection's access, each call logged (`lib/mcp/activity.ts`).
- `lib/mcp/oauth.ts`: OAuth 2.1 with PKCE (S256), dynamic client registration (RFC 7591), metadata (RFC 8414, RFC 9728), rotating refresh tokens with reuse detection, personal tokens. Every secret is stored as a SHA-256 hash.
- `app/oauth/authorize`: the owner's consent page. `app/api/oauth/*`: register, token, revoke, approve.
- `lib/mcp/files.ts`: downloads only from public https addresses (private and internal addresses are refused, redirects are re-checked) and joins uploads sent in pieces.
- Tables: `supabase/migrations/20261113180000_assistant_access.sql`.
