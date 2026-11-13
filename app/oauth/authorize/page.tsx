import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ShieldCheck, TriangleAlert } from "lucide-react";
import { ownerUser } from "@/lib/auth";
import { OAuthError, readAuthorizeRequest, SCOPE_LABELS, SCOPES } from "@/lib/mcp/oauth";
import { monaSans } from "@/app/studio-fonts";
import "./authorize.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Connect an assistant", robots: { index: false, follow: false } };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const PASSED = ["client_id", "redirect_uri", "response_type", "state", "code_challenge", "code_challenge_method", "scope"] as const;

/** OAuth consent: the owner approves an assistant app (claude.ai, ChatGPT) and picks what it may do. */
export default async function AuthorizePage({ searchParams }: Props) {
  const raw = await searchParams;
  const params: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(raw)) params[key] = Array.isArray(value) ? value[0] : value;
  if (!(await ownerUser())) {
    const query = new URLSearchParams();
    for (const key of PASSED) if (params[key] !== undefined) query.set(key, params[key]!);
    redirect(`/admin/login?next=${encodeURIComponent(`/oauth/authorize?${query}`)}`);
  }
  let request: Awaited<ReturnType<typeof readAuthorizeRequest>> | null = null;
  let problem = "";
  try { request = await readAuthorizeRequest(params); } catch (error) { problem = error instanceof OAuthError ? error.message : "This request couldn't be read."; }

  return <main className={`oauth ${monaSans.variable}`}>
    <div className="oauth-card">
      <div className="oauth-brand"><span className="oauth-mark">VC</span><span>VeilCode Studio</span></div>
      {!request ? <>
        <div className="oauth-icon warn"><TriangleAlert size={22} /></div>
        <h1>This connection can&apos;t continue</h1>
        <p className="oauth-lede">{problem}</p>
      </> : <form method="post" action="/api/oauth/authorize">
        <div className="oauth-icon"><ShieldCheck size={22} /></div>
        <h1>Connect <strong>{request.client.name}</strong> to your studio?</h1>
        <p className="oauth-lede">It will work through <b>{new URL(request.redirectUri).host}</b>. Choose what it may do. You can change this or switch it off at any time under Connections.</p>
        {PASSED.map((key) => params[key] !== undefined ? <input key={key} type="hidden" name={key} value={params[key]} /> : null)}
        <fieldset className="oauth-scopes">
          <legend>Access</legend>
          {SCOPES.map((scope) => <label key={scope}>
            <input type="checkbox" name="grant" value={scope} defaultChecked={request.scopes.includes(scope)} />
            <span><b>{SCOPE_LABELS[scope].title}</b><small>{SCOPE_LABELS[scope].text}</small></span>
          </label>)}
        </fieldset>
        <p className="oauth-note">Assistants never publish, refund, or change payments or settings. Every action they take is logged.</p>
        <div className="oauth-actions">
          <button className="oauth-button secondary" name="decision" value="deny">Cancel</button>
          <button className="oauth-button primary" name="decision" value="approve">Connect</button>
        </div>
      </form>}
    </div>
  </main>;
}
