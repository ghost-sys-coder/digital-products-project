"use client";
import { ArrowUpRight, Scale } from "lucide-react";
import { POLICY_KINDS, POLICY_TITLES } from "@/lib/store-policies";
import { Segmented, TextArea, TextField } from "./fields";
import type { Draft, PoliciesDraft } from "./draft";

type Props = { draft: Draft; update: (update: (draft: Draft) => Draft) => void; previewBase: string | null };

export function PoliciesTab({ draft, update, previewBase }: Props) {
  const policies = draft.policies;
  const set = (patch: Partial<PoliciesDraft>) => update((current) => ({ ...current, policies: { ...current.policies, ...patch } }));
  const number = (label: string, key: keyof PoliciesDraft, help?: string, suffix?: string) =>
    <TextField label={label} type="number" inputMode="numeric" value={policies[key] as string} help={help} prefix={suffix} onChange={(value) => set({ [key]: value })} />;

  return <section className="workspace-panel form-panel">
    <div className="form-section-heading"><span className="step-number"><Scale size={15} aria-hidden /></span><div><h2>Store policies</h2><p>Shipping, returns, terms, privacy and contact pages, written from your answers and your shipping rates.</p></div></div>
    <p className="se-note"><span>These pages are a careful starting point, not legal advice. Read them on your store, and have them reviewed before you sell at volume.</span></p>

    <h3 className="se-subhead">Who sells</h3>
    <TextField label="Seller name" required max={120} value={policies.sellerName} placeholder="Lumora Ltd, or your full name" help="The person or registered business that sells. Named in the terms and privacy policy." onChange={(sellerName) => set({ sellerName })} />
    <TextField label="Business address" optional max={300} value={policies.sellerAddress} help="Needed for UK and EU sales. You can add it later." onChange={(sellerAddress) => set({ sellerAddress })} />
    <TextField label="Governing law" required max={120} value={policies.governingLaw} list="se-law" placeholder="England and Wales" help="Where disputes are decided. Usually where you or your business are based." onChange={(governingLaw) => set({ governingLaw })} />
    <datalist id="se-law"><option value="England and Wales" /><option value="Scotland" /><option value="the State of Delaware, USA" /><option value="the State of New York, USA" /><option value="Uganda" /></datalist>

    <h3 className="se-subhead">Orders and delivery</h3>
    <div className="se-grid-2">
      {number("Processing from", "processingMin", undefined)}
      {number("Processing to", "processingMax", "Business days to prepare an order before it ships.")}
    </div>
    {number("Missing parcel window", "lostParcelDays", "Days after the estimated delivery date to report a parcel that hasn't arrived.")}

    <h3 className="se-subhead">Returns and refunds</h3>
    {number("Return window", "returnWindowDays", "Days after delivery for change-of-mind returns. 0 means only damaged, faulty or wrong items.")}
    {policies.returnWindowDays.trim() !== "0" && <Segmented label="Change-of-mind return postage is paid by" value={policies.returnShippingPaidBy}
      options={[{ value: "customer", label: "The customer" }, { value: "store", label: "The store" }]} onChange={(returnShippingPaidBy) => set({ returnShippingPaidBy })} />}
    {number("Refund time", "refundDays", "Business days to refund once a return arrives or a claim is approved.")}

    <h3 className="se-subhead">Support</h3>
    <TextField label="Reply time" max={80} value={policies.responseTime} placeholder="within 1–2 business days" help={'Completes the sentence "We\'ll reply …"'} onChange={(responseTime) => set({ responseTime })} />

    <details className="se-details">
      <summary>Add your own paragraphs</summary>
      <p className="field-help">Optional. Each is added at the end of its page. Leave a blank line between paragraphs.</p>
      {POLICY_KINDS.map((kind) => <TextArea key={kind} label={POLICY_TITLES[kind]} optional max={3000} rows={3} value={policies.extra[kind]}
        onChange={(paragraph) => set({ extra: { ...policies.extra, [kind]: paragraph } })} />)}
    </details>

    {previewBase && <div className="se-policy-links">
      <span className="se-label-text">Read them on your store <span className="optional">Last saved version</span></span>
      <ul>{POLICY_KINDS.map((kind) => <li key={kind}><a href={`${previewBase}/policies/${kind}?preview=1`} target="_blank" rel="noopener noreferrer">{POLICY_TITLES[kind]}<ArrowUpRight size={13} aria-hidden /></a></li>)}</ul>
    </div>}
  </section>;
}
