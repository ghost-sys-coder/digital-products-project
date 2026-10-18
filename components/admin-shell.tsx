import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { LayoutDashboard, Package, Receipt, Settings, ArrowUpRight } from "lucide-react";
import { Brand } from "./store";
import { AdminProfileMenu, SignOutButton } from "./admin-account-menu";
import { ownerProfile } from "@/lib/owner-profile";

const links = [{ href: "/admin", label: "Overview", Icon: LayoutDashboard }, { href: "/admin/products", label: "Products", Icon: Package }, { href: "/admin/orders", label: "Orders", Icon: Receipt }, { href: "/admin/settings", label: "Store settings", Icon: Settings }];
export function AdminShell({ children, active, storeName = "VeilCode Studio", owner }: {
  children: React.ReactNode;
  active: string;
  storeName?: string;
  owner?: Pick<User, "email" | "user_metadata">;
}) {
  const profile = ownerProfile(owner);
  return <div className="admin-shell">
    <aside className="admin-sidebar">
      <Brand name={storeName} />
      <span className="sidebar-label">YOUR WORKSPACE</span>
      <nav aria-label="Studio navigation">{links.map(({ href, label, Icon }) => <Link key={href} href={href} className={active === href ? "active" : ""} aria-current={active === href ? "page" : undefined}><Icon size={18} />{label}</Link>)}</nav>
      <div className="sidebar-bottom">
        <Link href="/" target="_blank" rel="noopener noreferrer">View your store <ArrowUpRight size={17} /></Link>
        <SignOutButton />
        <span className="sidebar-footnote">A little structure. More good work.</span>
      </div>
    </aside>
    <div className="admin-main">
      <header className="admin-topbar">
        <span>Studio workspace</span>
        <div className="admin-topbar-actions">
          <Link href="/" target="_blank" rel="noopener noreferrer">Your storefront <ArrowUpRight size={14} /></Link>
          <AdminProfileMenu profile={profile} storeName={storeName} />
        </div>
      </header>
      <main className="admin-content">{children}</main>
    </div>
  </div>;
}
