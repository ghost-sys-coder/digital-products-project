import { redirect } from "next/navigation";
import { ownerUser } from "@/lib/auth";
import { Brand } from "@/components/store";
import { LoginForm } from "@/components/login-form";

export const dynamic = "force-dynamic";
export default async function LoginPage() {
  if (await ownerUser()) redirect("/admin");
  return <main className="login-page"><div className="login-panel"><Brand /><div className="login-heading"><span className="eyebrow">THE SPACE BEHIND YOUR STORE</span><h1>Welcome<br />to your studio.</h1><p>Your products, your customers, your next good idea.</p></div><LoginForm /><p className="login-footnote">This workspace is for the store owner. Need help? <a href="mailto:support@veilcode.studio">Contact support</a>.</p></div><aside className="login-art" aria-hidden="true"><span>VEILCODE / WORKSPACE</span><div><p>Make something<br />worth sharing.</p><span>We&apos;ll take care of the handoff.</span></div><span>GOOD SYSTEMS. BETTER WORK.</span></aside></main>;
}
