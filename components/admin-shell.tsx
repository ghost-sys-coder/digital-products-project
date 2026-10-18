import Link from "next/link";
import { LayoutDashboard, Package, Receipt, Settings, ArrowUpRight, LogOut } from "lucide-react";
import { Brand } from "./store";

const links = [{ href: "/admin", label: "Overview", Icon: LayoutDashboard }, { href: "/admin/products", label: "Products", Icon: Package }, { href: "/admin/orders", label: "Orders", Icon: Receipt }, { href: "/admin/settings", label: "Store settings", Icon: Settings }];
export function AdminShell({ children, active, storeName = "VeilCode Studio" }: { children: React.ReactNode; active: string; storeName?: string }) {
  return <div className="admin-shell"><aside className="admin-sidebar"><Brand name={storeName} /><span className="sidebar-label">YOUR WORKSPACE</span><nav aria-label="Studio navigation">{links.map(({ href, label, Icon }) => <Link key={href} href={href} className={active === href ? "active" : ""} aria-current={active === href ? "page" : undefined}><Icon size={18} />{label}</Link>)}</nav><div className="sidebar-bottom"><Link href="/" target="_blank" rel="noopener noreferrer">View your store <ArrowUpRight size={17} /></Link><form method="post" action="/api/admin/logout"><button><LogOut size={16} /> Sign out</button></form><span className="sidebar-footnote">A little structure. More good work.</span></div></aside><div className="admin-main"><header className="admin-topbar"><span>Studio workspace</span><Link href="/" target="_blank" rel="noopener noreferrer">Your storefront <ArrowUpRight size={14} /></Link></header><main className="admin-content">{children}</main></div></div>;
}
