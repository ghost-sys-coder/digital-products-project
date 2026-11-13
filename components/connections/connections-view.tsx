"use client";

import { useRef, useState } from "react";
import { Bot, Check, CircleAlert, Copy, KeyRound, Plug, Power, Terminal } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { SCOPE_LABELS, SCOPES } from "@/lib/mcp/scopes";
import type { McpActivity, McpConnection, McpScope } from "@/lib/database.types";

type Client = "claude" | "chatgpt" | "claude-code" | "codex";
const CLIENTS: { id: Client; label: string }[] = [
  { id: "claude", label: "Claude" }, { id: "chatgpt", label: "ChatGPT" }, { id: "claude-code", label: "Claude Code" }, { id: "codex", label: "Codex" },
];

const when = (value: string | null) => value ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "Never";

async function call<T>(body: Record<string, unknown>): Promise<T> {
  let response: Response;
  try { response = await fetch("/api/admin/connections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); }
  catch { throw new Error("You seem to be offline. Check your connection and try again."); }
  const result = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(result.error ?? "Something went wrong. Please try again.");
  return result;
}

function CopyField({ value, label, multiline = false }: { value: string; label: string; multiline?: boolean }) {
  const [copied, setCopied] = useState(false);
  return <div className={`conn-copy${multiline ? " multiline" : ""}`}>
    {multiline ? <pre aria-label={label}>{value}</pre> : <code aria-label={label}>{value}</code>}
    <button type="button" onClick={() => { void navigator.clipboard.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1600); }); }} aria-label={`Copy ${label}`}>
      {copied ? <Check size={15} /> : <Copy size={15} />}
    </button>
  </div>;
}

export function ConnectionsView({ endpoint, initialConnections, activity }: { endpoint: string; initialConnections: McpConnection[]; activity: McpActivity[] }) {
  const [connections, setConnections] = useState(initialConnections);
  const [client, setClient] = useState<Client>("claude");
  const [tokenName, setTokenName] = useState("Claude Code");
  const [tokenScopes, setTokenScopes] = useState<McpScope[]>(["read", "research", "build"]);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [revoking, setRevoking] = useState<McpConnection | null>(null);
  const keepRef = useRef<HTMLButtonElement>(null);

  const live = connections.filter((connection) => !connection.revoked_at);
  const names = new Map(connections.map((connection) => [connection.id, connection.name]));
  const token = newToken ?? "<your token>";

  async function run(key: string, task: () => Promise<void>) {
    setPending(key); setError("");
    try { await task(); } catch (failure) { setError(failure instanceof Error ? failure.message : "Something went wrong."); } finally { setPending(null); }
  }
  const createToken = (event: React.FormEvent) => {
    event.preventDefault();
    void run("token", async () => {
      const result = await call<{ connection: McpConnection; token: string }>({ action: "create-token", name: tokenName, scopes: tokenScopes });
      setConnections((current) => [result.connection, ...current]);
      setNewToken(result.token);
    });
  };
  const toggleScope = (connection: McpConnection, scope: McpScope) => {
    const next = connection.scopes.includes(scope) ? connection.scopes.filter((entry) => entry !== scope) : SCOPES.filter((entry) => entry === scope || connection.scopes.includes(entry));
    if (!next.length) { setError("A connection needs at least one kind of access. Switch it off instead."); return; }
    void run(`scope:${connection.id}`, async () => {
      const result = await call<{ connection: McpConnection }>({ action: "scopes", id: connection.id, scopes: next });
      setConnections((current) => current.map((entry) => (entry.id === connection.id ? result.connection : entry)));
    });
  };
  const revoke = () => {
    if (!revoking) return;
    const target = revoking;
    void run("revoke", async () => {
      await call({ action: "revoke", id: target.id });
      setConnections((current) => current.map((entry) => (entry.id === target.id ? { ...entry, revoked_at: new Date().toISOString() } : entry)));
      setRevoking(null);
    });
  };

  const needsToken = client === "claude-code" || client === "codex";

  return <div className="conn">
    <section className="workspace-panel conn-setup" aria-labelledby="setup-title">
      <div className="panel-heading"><div><h2 id="setup-title">Connect an assistant</h2><p>Every assistant uses the same address and gets the same tools.</p></div></div>
      <div className="conn-body">
        <span className="conn-label">Server address</span>
        <CopyField value={endpoint} label="server address" />

        <div className="conn-tabs" role="tablist" aria-label="Assistant">
          {CLIENTS.map((entry) => <button key={entry.id} type="button" role="tab" aria-selected={client === entry.id} className={client === entry.id ? "active" : ""} onClick={() => setClient(entry.id)}>{entry.label}</button>)}
        </div>

        {client === "claude" && <ol className="conn-steps">
          <li>In Claude (web or desktop), open <b>Settings → Connectors</b> and choose <b>Add custom connector</b>.</li>
          <li>Name it <b>VeilCode Studio</b> and paste the server address above.</li>
          <li>Click <b>Connect</b>. You&apos;ll sign in here and choose what Claude may do.</li>
          <li>In a chat, turn the connector on from the tools menu. It works on Claude for mobile once connected.</li>
        </ol>}
        {client === "chatgpt" && <ol className="conn-steps">
          <li>In ChatGPT, open <b>Settings → Apps &amp; Connectors → Advanced</b> and turn on <b>Developer mode</b> (paid plans). Without it ChatGPT can only read.</li>
          <li>Back in <b>Apps &amp; Connectors</b>, choose <b>Create</b>. Name it <b>VeilCode Studio</b>, paste the server address, and pick <b>OAuth</b> for authentication.</li>
          <li>Click <b>Create</b>, then sign in here and choose what ChatGPT may do.</li>
          <li>In a chat, add VeilCode Studio from the <b>+</b> menu. Attached images can go straight into a draft store.</li>
        </ol>}
        {needsToken && <>
          <ol className="conn-steps">
            <li>Create a personal token below and copy it. It&apos;s shown once.</li>
            <li>{client === "claude-code" ? "Run this in a terminal:" : <>Add this to <code>~/.codex/config.toml</code>, then set <code>VEILCODE_MCP_TOKEN</code> to the token in your shell profile:</>}</li>
          </ol>
          {client === "claude-code"
            ? <CopyField multiline label="Claude Code command" value={`claude mcp add --transport http veilcode ${endpoint} --header "Authorization: Bearer ${token}"`} />
            : <CopyField multiline label="Codex config" value={`[mcp_servers.veilcode]\nurl = "${endpoint}"\nbearer_token_env_var = "VEILCODE_MCP_TOKEN"`} />}

          <form className="conn-token" onSubmit={createToken}>
            <label>Token name<input value={tokenName} onChange={(event) => setTokenName(event.target.value)} maxLength={120} required /></label>
            <fieldset><legend>Access</legend>
              {SCOPES.map((scope) => <label key={scope} className="conn-check">
                <input type="checkbox" checked={tokenScopes.includes(scope)} onChange={() => setTokenScopes((current) => current.includes(scope) ? current.filter((entry) => entry !== scope) : SCOPES.filter((entry) => entry === scope || current.includes(entry)))} />
                {SCOPE_LABELS[scope].title}
              </label>)}
            </fieldset>
            <button className="button primary" disabled={pending === "token" || !tokenName.trim() || !tokenScopes.length}><KeyRound size={16} /> {pending === "token" ? "Creating…" : "Create token"}</button>
          </form>
          {newToken && <div className="conn-new-token" role="status">
            <p><b>Copy this token now.</b> It won&apos;t be shown again. Anyone with it can use the access you chose, so keep it out of chats and code.</p>
            <CopyField value={newToken} label="personal token" />
          </div>}
        </>}
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
    </section>

    <section className="workspace-panel" aria-labelledby="list-title">
      <div className="panel-heading"><div><h2 id="list-title">Connected</h2><p>{live.length ? `${live.length} active. Change access or switch one off at any time.` : "Nothing connected yet."}</p></div></div>
      {live.length > 0 && <ul className="conn-list">{live.map((connection) => <li key={connection.id}>
        <span className="conn-icon" aria-hidden="true">{connection.kind === "oauth" ? <Bot size={18} /> : <Terminal size={18} />}</span>
        <div className="conn-main">
          <strong>{connection.name}</strong>
          <span>{connection.kind === "oauth" ? "App sign-in" : "Personal token"} · added {when(connection.created_at)} · last used {when(connection.last_used_at)}</span>
          <div className="conn-scopes" role="group" aria-label={`Access for ${connection.name}`}>
            {SCOPES.map((scope) => <button key={scope} type="button" aria-pressed={connection.scopes.includes(scope)} disabled={pending === `scope:${connection.id}`}
              className={connection.scopes.includes(scope) ? "on" : ""} onClick={() => toggleScope(connection, scope)} title={SCOPE_LABELS[scope].text}>
              {connection.scopes.includes(scope) && <Check size={12} />} {SCOPE_LABELS[scope].title}
            </button>)}
          </div>
        </div>
        <button type="button" className="button secondary small conn-off" onClick={() => setRevoking(connection)}><Power size={14} /> Switch off</button>
      </li>)}</ul>}
    </section>

    <section className="workspace-panel" aria-labelledby="log-title">
      <div className="panel-heading"><div><h2 id="log-title">Activity</h2><p>The latest things assistants did in the studio.</p></div></div>
      {activity.length === 0 ? <p className="conn-empty"><Plug size={16} /> Once an assistant uses the studio, each action appears here.</p>
        : <ul className="conn-log">{activity.map((entry) => <li key={entry.id} className={entry.ok ? "" : "failed"}>
          <time dateTime={entry.created_at}>{when(entry.created_at)}</time>
          <span className="conn-log-who">{names.get(entry.connection_id) ?? "Assistant"}</span>
          <code>{entry.tool}</code>
          <span className="conn-log-what">{entry.ok ? null : <CircleAlert size={13} />}{entry.summary || "—"}</span>
        </li>)}</ul>}
    </section>

    <AlertDialog open={!!revoking} onOpenChange={(open) => { if (!open && pending !== "revoke") setRevoking(null); }}>
      <AlertDialogContent className="confirm-dialog" initialFocus={keepRef}>
        <div className="confirm-dialog-icon danger" aria-hidden="true"><Power size={22} /></div>
        <AlertDialogHeader>
          <AlertDialogTitle>Switch off {revoking?.name}?</AlertDialogTitle>
          <AlertDialogDescription>It loses access straight away, and its tokens stop working. To use it again, connect it afresh.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel ref={keepRef} className="button secondary" disabled={pending === "revoke"}>Keep it</AlertDialogCancel>
          <AlertDialogAction type="button" className="button danger" disabled={pending === "revoke"} onClick={revoke}><Power size={15} />{pending === "revoke" ? "Switching off…" : "Switch off"}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}
