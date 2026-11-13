"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";

/** `next` is checked by the login page: an admin path or the assistant consent page. */
export function LoginForm({ next = "/admin" }: { next?: string }) {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const router = useRouter();
  return <form className="login-form" onSubmit={async (event) => {
    event.preventDefault(); setPending(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(form)) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to sign in.");
      router.replace(next); router.refresh();
    } catch (error) { setError((error as Error).message); setPending(false); }
  }}><label>Email address<input name="email" type="email" autoComplete="username" placeholder="you@yourstudio.com" required /></label><label>Password<input name="password" type="password" autoComplete="current-password" required placeholder="Your studio password" /></label>{error && <p role="alert" className="form-error">{error}</p>}<button className="button primary" disabled={pending}>{pending ? "Signing in…" : "Enter your studio"}<ArrowRight size={17} /></button></form>;
}
