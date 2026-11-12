"use client";
import { ArrowDown, ArrowUp, Info, Plus, Truck, X } from "lucide-react";
import { MAX_ACTIVE_RATES, MAX_RATES, parseMoney } from "@/lib/store-input";
import { formatMoney } from "@/lib/store-config";
import { Switch, TextField } from "./fields";
import { blankRate, type Draft, type ProfileDraft, type RateDraft } from "./draft";

type Props = { draft: Draft; update: (update: (draft: Draft) => Draft) => void };

function rateLine(rate: RateDraft) {
  const amount = parseMoney(rate.amount);
  const days = rate.minDays === rate.maxDays ? `${rate.minDays} business days` : `${rate.minDays}–${rate.maxDays} business days`;
  return `${rate.name || "Unnamed rate"} · ${days} · ${amount === 0 ? "Free" : Number.isNaN(amount) ? "—" : formatMoney(amount, "usd")}`;
}

export function ShippingTab({ draft, update }: Props) {
  const profile = draft.profiles.find((entry) => entry.id === draft.shippingProfileId) ?? null;
  const setProfile = (change: (profile: ProfileDraft) => ProfileDraft) => update((current) => ({
    ...current, profiles: current.profiles.map((entry) => entry.id === current.shippingProfileId ? change(entry) : entry),
  }));
  const setRate = (id: string, patch: Partial<RateDraft>) => setProfile((current) => ({ ...current, rates: current.rates.map((rate) => rate.id === id ? { ...rate, ...patch } : rate) }));
  const usRates = profile?.rates.filter((rate) => rate.market === "US") ?? [];
  const activeCount = usRates.filter((rate) => rate.active).length;
  const move = (index: number, delta: number) => setProfile((current) => {
    const us = current.rates.filter((rate) => rate.market === "US");
    const other = current.rates.filter((rate) => rate.market !== "US");
    const [rate] = us.splice(index, 1); us.splice(index + delta, 0, rate);
    return { ...current, rates: [...us, ...other] };
  });
  const create = () => {
    const id = crypto.randomUUID();
    update((current) => ({
      ...current, shippingProfileId: id,
      profiles: [...current.profiles, { id, name: `${current.name || "Store"} shipping`.slice(0, 80), usedBy: [], rates: [{ ...blankRate(), name: "Free tracked shipping" }] }],
    }));
  };

  return <section className="workspace-panel form-panel">
    <div className="form-section-heading"><span className="step-number"><Truck size={15} aria-hidden /></span><div><h2>Shipping to the United States</h2><p>The options and delivery times buyers choose from at checkout. Your shipping policy is written from these.</p></div></div>
    <div className="se-field">
      <span className="se-label"><label className="se-label-text" htmlFor="se-profile">Shipping profile</label></span>
      <div className="se-inline">
        <select id="se-profile" value={draft.shippingProfileId ?? ""} onChange={(event) => update((current) => ({ ...current, shippingProfileId: event.target.value || null }))}>
          <option value="">Choose a profile…</option>
          {draft.profiles.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}{entry.usedBy.length ? ` (also used by ${entry.usedBy.length})` : ""}</option>)}
        </select>
        <button type="button" className="button secondary small" onClick={create}><Plus size={15} aria-hidden />New profile</button>
      </div>
      <span className="field-help">Profiles can be shared, so stores that ship from the same supplier stay in step.</span>
    </div>

    {!profile ? <div className="se-empty"><Truck size={24} aria-hidden /><p>Choose a profile or create one. A store needs at least one active US rate before it can be published.</p></div> : <>
      {profile.usedBy.length > 0 && <p className="se-note"><Info size={15} aria-hidden /><span>Changes here also apply to {profile.usedBy.map((user) => user.name).join(", ")}.</span></p>}
      <TextField label="Profile name" required max={80} value={profile.name} onChange={(name) => setProfile((current) => ({ ...current, name }))} />
      <div className="se-field">
        <span className="se-label"><span className="se-label-text">Rates</span><span className="optional">{activeCount} of {MAX_ACTIVE_RATES} offered at checkout</span></span>
        <ol className="se-rates">
          {usRates.map((rate, index) => <li key={rate.id} className={rate.active ? "" : "is-off"}>
            <div className="se-rate-grid">
              <TextField label="Name" required max={80} value={rate.name} placeholder="Free tracked shipping" onChange={(name) => setRate(rate.id, { name })} />
              <TextField label="Price" prefix="$" inputMode="decimal" value={rate.amount} placeholder="0" help="0 for free" onChange={(amount) => setRate(rate.id, { amount })} />
              <TextField label="Fastest" type="number" inputMode="numeric" value={rate.minDays} onChange={(minDays) => setRate(rate.id, { minDays })} />
              <TextField label="Slowest" type="number" inputMode="numeric" value={rate.maxDays} help="business days" onChange={(maxDays) => setRate(rate.id, { maxDays })} />
            </div>
            <div className="se-rate-foot">
              <span className="muted">{rateLine(rate)}</span>
              <span className="se-item-actions">
                <Switch compact label={`Offer ${rate.name || "this rate"}`} checked={rate.active} onChange={(active) => setRate(rate.id, { active })} />
                <button type="button" className="se-icon-button" disabled={index === 0} aria-label="Move rate up" onClick={() => move(index, -1)}><ArrowUp size={14} aria-hidden /></button>
                <button type="button" className="se-icon-button" disabled={index === usRates.length - 1} aria-label="Move rate down" onClick={() => move(index, 1)}><ArrowDown size={14} aria-hidden /></button>
                <button type="button" className="se-icon-button danger" aria-label={`Remove ${rate.name || "rate"}`} onClick={() => setProfile((current) => ({ ...current, rates: current.rates.filter((entry) => entry.id !== rate.id) }))}><X size={14} aria-hidden /></button>
              </span>
            </div>
          </li>)}
        </ol>
        {profile.rates.length < MAX_RATES && <button type="button" className="se-add" onClick={() => setProfile((current) => ({ ...current, rates: [...current.rates, { ...blankRate(), name: usRates.length ? "Express" : "Free tracked shipping", amount: usRates.length ? "9.95" : "0", minDays: usRates.length ? "4" : "7", maxDays: usRates.length ? "6" : "12" }] }))}><Plus size={14} aria-hidden />Add a rate</button>}
        {activeCount > MAX_ACTIVE_RATES && <p className="form-error" role="alert">Checkout can offer at most {MAX_ACTIVE_RATES} options. Switch some off.</p>}
      </div>
      <p className="field-help">Delivery times are counted from when an order ships. Your processing time (Policies tab) is added on top in the shipping policy and on the order confirmation. Be honest: buyers can see these before they pay.</p>
    </>}
  </section>;
}
