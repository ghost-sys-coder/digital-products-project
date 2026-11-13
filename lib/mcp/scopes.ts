// What an assistant connection may do. Shared by the server (lib/mcp/oauth.ts) and the admin screens.
import type { McpScope } from "../database.types";

export const SCOPES = ["read", "research", "build"] as const satisfies readonly McpScope[];
export const SCOPE_LABELS: Record<McpScope, { title: string; text: string }> = {
  read: { title: "See the store", text: "Sales, orders, products, stores and research. Customer names and addresses only when asking about one order." },
  research: { title: "Research products", text: "Search CJ and Meta ads, and save or update ideas on the research board." },
  build: { title: "Build drafts", text: "Create and edit draft stores and digital products, and add images. Never publishes, refunds or changes settings." },
};
