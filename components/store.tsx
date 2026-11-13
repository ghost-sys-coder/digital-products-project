import Image from "next/image";
import Link from "next/link";

// The studio's homepage and product pages use components/site; this mark serves the admin and thank-you pages.
export function Brand({ name = "VeilCode Studio" }: { name?: string }) {
  return <Link href="/" className="brand"><Image className="brand-mark" src="/brand/veilcode-mark.svg" alt="" width={34} height={34} /><span>{name}</span></Link>;
}
