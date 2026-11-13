import { LegalPage, legalMetadata } from "@/components/site/legal-page";
import "../studio.css";

export const dynamic = "force-dynamic";
export const metadata = legalMetadata("privacy");
export default function Page() { return <LegalPage kind="privacy" />; }
