import type { Metadata } from "next";
import "../admin-ui.css";
import { Toaster } from "@/components/ui/sonner";
export const metadata: Metadata = { title: "Studio workspace", robots: { index: false, follow: false } };
export default function AdminLayout({ children }: { children: React.ReactNode }) { return <>{children}<Toaster theme="light" position="top-right" duration={4000} closeButton /></>; }
