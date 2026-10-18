import type { Metadata } from "next";
import "../admin-ui.css";
export const metadata: Metadata = { title: "Studio workspace", robots: { index: false, follow: false } };
export default function AdminLayout({ children }: { children: React.ReactNode }) { return children; }
