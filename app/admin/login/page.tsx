import { redirect } from "next/navigation";
import { ownerUser } from "@/lib/auth";
import { Brand } from "@/components/store";
import { LoginForm } from "@/components/login-form";

export const dynamic = "force-dynamic";
/** Only the studio's own pages may follow a sign-in: the admin, or an assistant asking to connect. */
function safeNext(value: string | string[] | undefined) {
  const next = Array.isArray(value) ? value[0] : value;
  return next && /^\/(admin|oauth\/authorize)(?:[/?#]|$)/.test(next) && !next.startsWith("//") ? next : "/admin";
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const next = safeNext((await searchParams).next);
  if (await ownerUser()) redirect(next);
  return <main className="login-page"><div className="login-panel"><Brand /><div className="login-heading"><span className="eyebrow">THE SPACE BEHIND YOUR STORE</span><h1>Welcome<br />to your studio.</h1><p>Your products, your customers, your next good idea.</p></div><LoginForm next={next} /><p className="login-footnote">This workspace is for the store owner. Need help? <a href="mailto:support@veilcode.studio">Contact support</a>.</p></div><aside className="login-art" aria-hidden="true"><span>VEILCODE / WORKSPACE</span><div><p>Make something<br />worth sharing.</p><span>We&apos;ll take care of the handoff.</span></div><span>GOOD SYSTEMS. BETTER WORK.</span></aside></main>;
}
