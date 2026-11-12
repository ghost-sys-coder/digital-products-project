"use client";
import { useId } from "react";
import { Plus, X } from "lucide-react";
import { ICONS, type IconName } from "@/lib/store-page";
import { StoreIcon } from "@/components/storefront/icons";

type Common = { label: string; help?: string; required?: boolean; optional?: boolean };

function Label({ label, required, optional, count, max, htmlFor }: Common & { count?: number; max?: number; htmlFor?: string }) {
  const near = max !== undefined && count !== undefined && count > max * 0.8;
  return <span className="se-label">
    <label htmlFor={htmlFor} className="se-label-text">{label}{required && <span className="se-required" aria-hidden> *</span>}{optional && <span className="optional">Optional</span>}</label>
    {near && <span className={`se-count${count! > max! ? " is-over" : ""}`} aria-live="polite">{count}/{max}</span>}
  </span>;
}

export function TextField({ label, help, required, optional, value, onChange, max, placeholder, type = "text", inputMode, prefix, autoComplete, list, invalid }: Common & {
  value: string; onChange: (value: string) => void; max?: number; placeholder?: string; type?: "text" | "email" | "url" | "number";
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"]; prefix?: string; autoComplete?: string; list?: string; invalid?: boolean;
}) {
  const id = useId();
  const input = <input id={id} type={type} value={value} maxLength={max} placeholder={placeholder} inputMode={inputMode} autoComplete={autoComplete ?? "off"} list={list}
    required={required} aria-invalid={invalid || undefined} aria-describedby={help ? `${id}-help` : undefined} onChange={(event) => onChange(event.target.value)} />;
  return <div className="se-field">
    <Label label={label} required={required} optional={optional} count={value.length} max={max} htmlFor={id} />
    {prefix ? <div className="input-prefix"><span>{prefix}</span>{input}</div> : input}
    {help && <span className="field-help" id={`${id}-help`}>{help}</span>}
  </div>;
}

export function TextArea({ label, help, required, optional, value, onChange, max, rows = 3, placeholder }: Common & {
  value: string; onChange: (value: string) => void; max: number; rows?: number; placeholder?: string;
}) {
  const id = useId();
  return <div className="se-field">
    <Label label={label} required={required} optional={optional} count={value.length} max={max} htmlFor={id} />
    <textarea id={id} value={value} maxLength={max} rows={rows} placeholder={placeholder} required={required}
      aria-describedby={help ? `${id}-help` : undefined} onChange={(event) => onChange(event.target.value)} />
    {help && <span className="field-help" id={`${id}-help`}>{help}</span>}
  </div>;
}

/** A row of mutually exclusive options; reads as a radio group. */
export function Segmented<T extends string>({ label, help, value, options, onChange }: Common & {
  value: T; options: readonly { value: T; label: string }[]; onChange: (value: T) => void;
}) {
  const id = useId();
  return <div className="se-field" role="radiogroup" aria-labelledby={id}>
    <span className="se-label"><span className="se-label-text" id={id}>{label}</span></span>
    <div className="se-segmented">
      {options.map((option) => <button key={option.value} type="button" role="radio" aria-checked={value === option.value}
        className={value === option.value ? "is-active" : ""} onClick={() => onChange(option.value)}>{option.label}</button>)}
    </div>
    {help && <span className="field-help">{help}</span>}
  </div>;
}

export function Switch({ label, description, checked, onChange, compact }: { label: string; description?: string; checked: boolean; onChange: (checked: boolean) => void; compact?: boolean }) {
  const id = useId();
  return <div className={`se-switch${compact ? " compact" : ""}`}>
    <button id={id} type="button" role="switch" aria-checked={checked} aria-label={compact ? label : undefined} aria-labelledby={compact ? undefined : `${id}-label`}
      onClick={() => onChange(!checked)}><span aria-hidden /></button>
    {!compact && <span><span id={`${id}-label`} className="se-switch-label">{label}</span>{description && <span className="field-help">{description}</span>}</span>}
  </div>;
}

/** A short list of one-line entries, such as highlights or badges. */
export function StringList({ label, help, values, onChange, max, itemMax, placeholder }: Common & {
  values: string[]; onChange: (values: string[]) => void; max: number; itemMax: number; placeholder?: string;
}) {
  return <div className="se-field">
    <span className="se-label"><span className="se-label-text">{label}</span><span className="optional">{values.length} of {max}</span></span>
    {help && <span className="field-help se-help-top">{help}</span>}
    <ul className="se-string-list">
      {values.map((value, index) => <li key={index}>
        <input aria-label={`${label} ${index + 1}`} value={value} maxLength={itemMax} placeholder={placeholder}
          onChange={(event) => onChange(values.map((entry, position) => position === index ? event.target.value : entry))} />
        <button type="button" className="se-icon-button danger" aria-label={`Remove ${label.toLowerCase()} ${index + 1}`} onClick={() => onChange(values.filter((_, position) => position !== index))}><X size={14} aria-hidden /></button>
      </li>)}
    </ul>
    {values.length < max && <button type="button" className="se-add" onClick={() => onChange([...values, ""])}><Plus size={14} aria-hidden />Add</button>}
  </div>;
}

const iconLabel = (name: string) => name.replace(/-/g, " ").replace(/^./, (letter) => letter.toUpperCase());

/** Thirty storefront icons in a grid; optional icons can be cleared. */
export function IconPicker({ label, value, optional, onChange }: { label: string; value: IconName | null; optional?: boolean; onChange: (icon: IconName | null) => void }) {
  const id = useId();
  return <div className="se-field" role="radiogroup" aria-labelledby={id}>
    <span className="se-label"><span className="se-label-text" id={id}>{label}</span>{optional && <span className="optional">Optional</span>}</span>
    <div className="se-icon-grid">
      {optional && <button type="button" role="radio" aria-checked={value === null} className={value === null ? "is-active" : ""} onClick={() => onChange(null)} title="No icon"><X size={16} aria-hidden /><span className="sr-only">No icon</span></button>}
      {ICONS.map((icon) => <button key={icon} type="button" role="radio" aria-checked={value === icon} className={value === icon ? "is-active" : ""} title={iconLabel(icon)} onClick={() => onChange(icon)}>
        <StoreIcon name={icon} size={17} /><span className="sr-only">{iconLabel(icon)}</span>
      </button>)}
    </div>
  </div>;
}
