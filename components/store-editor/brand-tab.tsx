"use client";
import { Check, CreditCard, Palette, RotateCcw } from "lucide-react";
import { contrastRatio, statementSuffix, THEME_TOKENS, THEMES, type ThemeId } from "@/lib/store-themes";
import { ImagePathField } from "./media";
import { TextField } from "./fields";
import type { Draft } from "./draft";

type Props = { draft: Draft; update: (update: (draft: Draft) => Draft) => void };

/** Four theme cards drawn from the theme's own tokens, so each looks like the store it makes. */
export function ThemePicker({ value, onChange, accent }: { value: ThemeId; onChange: (theme: ThemeId) => void; accent?: string | null }) {
  return <div className="se-themes" role="radiogroup" aria-label="Theme">
    {THEMES.map((theme) => {
      const tokens = THEME_TOKENS[theme];
      const colour = (theme === value && accent) || tokens.accent;
      return <button key={theme} type="button" role="radio" aria-checked={value === theme} className={`se-theme${value === theme ? " is-active" : ""}`} onClick={() => onChange(theme)}>
        <span className="se-theme-sample" style={{ background: tokens.bg, color: tokens.text, borderColor: tokens.border, borderRadius: tokens.radius }} aria-hidden>
          <span className="se-theme-title" style={{ fontWeight: tokens.headingWeight, letterSpacing: tokens.headingTracking }}>Aa</span>
          <span className="se-theme-card" style={{ background: tokens.surface, borderRadius: tokens.radius }} />
          <span className="se-theme-button" style={{ background: colour, borderRadius: tokens.buttonRadius }} />
        </span>
        <span className="se-theme-name">{tokens.label}{value === theme && <Check size={14} aria-hidden />}</span>
        <span className="se-theme-description">{tokens.description}</span>
      </button>;
    })}
  </div>;
}

export function BrandTab({ draft, update }: Props) {
  const tokens = THEME_TOKENS[draft.theme];
  const accent = draft.brand.accent ?? tokens.accent;
  const validAccent = /^#[0-9a-f]{6}$/i.test(accent);
  const contrast = validAccent ? contrastRatio(accent, tokens.bg) : 21;
  const suffix = statementSuffix(draft.brand.name || draft.name);
  const setBrand = (patch: Partial<Draft["brand"]>) => update((current) => ({ ...current, brand: { ...current.brand, ...patch } }));

  return <>
    <section className="workspace-panel form-panel">
      <div className="form-section-heading"><span className="step-number"><Palette size={15} aria-hidden /></span><div><h2>Theme</h2><p>The overall look: type, colour, corners and spacing. Switch any time; your content stays.</p></div></div>
      <ThemePicker value={draft.theme} accent={draft.brand.accent} onChange={(theme) => update((current) => ({ ...current, theme }))} />
    </section>
    <section className="workspace-panel form-panel">
      <div className="form-section-heading"><span className="step-number">Aa</span><div><h2>Brand</h2><p>How the store introduces itself, in the header, emails and on card statements.</p></div></div>
      <TextField label="Brand name" max={40} value={draft.brand.name} placeholder={draft.name.slice(0, 40)} help="Leave empty to use the product name." onChange={(name) => setBrand({ name })} />
      <ImagePathField label="Logo" value={draft.brand.logoPath} onChange={(logoPath) => setBrand({ logoPath })} help="Optional. A PNG or WebP with a transparent background, at least 320 px wide. Without one, the brand name is shown." />
      <div className="se-field">
        <span className="se-label"><label className="se-label-text" htmlFor="se-accent">Accent colour</label></span>
        <div className="se-inline">
          <input className="se-colour" type="color" aria-label="Pick accent colour" value={validAccent ? accent : tokens.accent} onChange={(event) => setBrand({ accent: event.target.value.toLowerCase() })} />
          <input id="se-accent" className="se-hex" value={draft.brand.accent ?? ""} placeholder={tokens.accent} maxLength={7} onChange={(event) => setBrand({ accent: event.target.value.trim().toLowerCase() || null })} />
          {draft.brand.accent && <button type="button" className="se-text-button" onClick={() => setBrand({ accent: null })}><RotateCcw size={13} aria-hidden />Use the theme&apos;s colour</button>}
        </div>
        <span className="field-help">Buttons, prices and highlights. Text on buttons switches between black and white automatically.</span>
        {validAccent && contrast < 3 && <span className="se-warning">This colour is hard to see on the {tokens.label} background ({contrast.toFixed(1)}:1). Pick a {tokens.dark ? "lighter" : "darker or stronger"} shade so buttons and prices stand out.</span>}
      </div>
      <TextField label="Support email" type="email" required max={254} value={draft.brand.supportEmail} placeholder="hello@yourbrand.com" autoComplete="email"
        help="Shown in the footer, policies and order emails. Required before you publish." onChange={(supportEmail) => setBrand({ supportEmail })} />
      <p className="se-note"><CreditCard size={15} aria-hidden /><span>{suffix ? <>Card statements end in <strong>{suffix}</strong>, after your Stripe account&apos;s prefix.</> : "Add a brand name with letters to show it on card statements."}</span></p>
    </section>
  </>;
}
