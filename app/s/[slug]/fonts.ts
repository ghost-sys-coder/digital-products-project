import { Bricolage_Grotesque, Fraunces, Inter, Manrope, Plus_Jakarta_Sans, Space_Grotesk } from "next/font/google";

// Every theme font is declared as a CSS variable (see lib/store-themes.ts). Browsers only download
// the faces a page actually uses, so preloading is off to avoid fetching fonts other themes need.
// next/font needs literal options in each call: shared objects or spreads fail to compile.
const inter = Inter({ subsets: ["latin"], display: "swap", preload: false, variable: "--font-inter" });
const space = Space_Grotesk({ subsets: ["latin"], display: "swap", preload: false, variable: "--font-space" });
const fraunces = Fraunces({ subsets: ["latin"], display: "swap", preload: false, variable: "--font-fraunces", axes: ["SOFT", "opsz"] });
const bricolage = Bricolage_Grotesque({ subsets: ["latin"], display: "swap", preload: false, variable: "--font-bricolage" });
const manrope = Manrope({ subsets: ["latin"], display: "swap", preload: false, variable: "--font-manrope" });
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], display: "swap", preload: false, variable: "--font-jakarta" });

export const storeFontVariables = [inter, space, fraunces, bricolage, manrope, jakarta].map((font) => font.variable).join(" ");
