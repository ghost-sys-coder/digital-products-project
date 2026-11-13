import { Mona_Sans } from "next/font/google";

// The studio typeface (homepage and product pages). The width axis lets headlines run wide while body text stays normal.
export const monaSans = Mona_Sans({ subsets: ["latin"], display: "swap", axes: ["wdth"], variable: "--font-mona" });
