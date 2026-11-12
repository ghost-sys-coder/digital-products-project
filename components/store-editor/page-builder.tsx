"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, ChevronDown, Plus, Trash2, X } from "lucide-react";
import { SECTION_LABELS, type IconName, type Media, type Section, type SectionType, type StorePage } from "@/lib/store-page";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { IconPicker, Segmented, StringList, Switch, TextArea, TextField } from "./fields";
import { MediaField, MediaListField } from "./media";
import { newSectionData, SECTION_SPECS, SINGLE_SECTIONS, type FieldSpec } from "./section-specs";

type Data = Record<string, unknown>;
type Update<T> = (update: (value: T) => T) => void;

const str = (value: unknown) => typeof value === "string" ? value : "";
const arr = <T,>(value: unknown) => Array.isArray(value) ? value as T[] : [];

function SizeTable({ data, onChange }: { data: Data; onChange: Update<Data> }) {
  const columns = arr<string>(data.columns);
  const rows = arr<string[]>(data.rows);
  const set = (nextColumns: string[], nextRows: string[][]) => onChange((value) => ({ ...value, columns: nextColumns, rows: nextRows }));
  return <div className="se-field">
    <span className="se-label"><span className="se-label-text">Measurements</span><span className="optional">{rows.length} rows · {columns.length} columns</span></span>
    <div className="se-table-scroll">
      <table className="se-size-table">
        <thead><tr>{columns.map((column, index) => <th key={index} scope="col">
          <input aria-label={`Column ${index + 1} heading`} value={column} maxLength={30} onChange={(event) => set(columns.map((entry, position) => position === index ? event.target.value : entry), rows)} />
          {columns.length > 1 && <button type="button" className="se-icon-button danger" aria-label={`Remove column ${index + 1}`} onClick={() => set(columns.filter((_, position) => position !== index), rows.map((row) => row.filter((_, position) => position !== index)))}><X size={13} aria-hidden /></button>}
        </th>)}<th aria-hidden /></tr></thead>
        <tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>
          {columns.map((_, cellIndex) => <td key={cellIndex}><input aria-label={`Row ${rowIndex + 1}, ${columns[cellIndex] || `column ${cellIndex + 1}`}`} value={row[cellIndex] ?? ""} maxLength={30}
            onChange={(event) => set(columns, rows.map((entry, position) => position === rowIndex ? columns.map((__, cell) => cell === cellIndex ? event.target.value : entry[cell] ?? "") : entry))} /></td>)}
          <td><button type="button" className="se-icon-button danger" aria-label={`Remove row ${rowIndex + 1}`} onClick={() => set(columns, rows.filter((_, position) => position !== rowIndex))}><X size={13} aria-hidden /></button></td>
        </tr>)}</tbody>
      </table>
    </div>
    <div className="se-row-actions">
      {rows.length < 15 && <button type="button" className="se-add" onClick={() => set(columns, [...rows, columns.map(() => "")])}><Plus size={14} aria-hidden />Add row</button>}
      {columns.length < 8 && <button type="button" className="se-add" onClick={() => set([...columns, ""], rows.map((row) => [...row, ""]))}><Plus size={14} aria-hidden />Add column</button>}
    </div>
  </div>;
}

function ItemList({ spec, items, onChange }: { spec: Extract<FieldSpec, { kind: "list" }>; items: Data[]; onChange: (items: Data[]) => void }) {
  const [open, setOpen] = useState<number | null>(null);
  const move = (from: number, to: number) => {
    const next = [...items]; const [item] = next.splice(from, 1); next.splice(to, 0, item);
    onChange(next); if (open === from) setOpen(to); else if (open === to) setOpen(from);
  };
  return <div className="se-field">
    <span className="se-label"><span className="se-label-text">{spec.label}</span><span className="optional">{items.length} of {spec.max}</span></span>
    {spec.help && <span className="field-help se-help-top">{spec.help}</span>}
    {items.length > 0 && <ol className="se-items">
      {items.map((item, index) => <li key={index} className={open === index ? "is-open" : ""}>
        <div className="se-item-head">
          <button type="button" className="se-item-toggle" aria-expanded={open === index} onClick={() => setOpen(open === index ? null : index)}>
            <span className="se-item-index">{index + 1}</span>
            <span className="se-item-title">{spec.summary(item) || <em>New {spec.itemLabel.toLowerCase()}</em>}</span>
            <ChevronDown size={15} aria-hidden />
          </button>
          <span className="se-item-actions">
            <button type="button" className="se-icon-button" disabled={index === 0} aria-label={`Move ${spec.itemLabel.toLowerCase()} ${index + 1} up`} onClick={() => move(index, index - 1)}><ArrowUp size={14} aria-hidden /></button>
            <button type="button" className="se-icon-button" disabled={index === items.length - 1} aria-label={`Move ${spec.itemLabel.toLowerCase()} ${index + 1} down`} onClick={() => move(index, index + 1)}><ArrowDown size={14} aria-hidden /></button>
            <button type="button" className="se-icon-button danger" aria-label={`Remove ${spec.itemLabel.toLowerCase()} ${index + 1}`} onClick={() => { onChange(items.filter((_, position) => position !== index)); setOpen(null); }}><X size={14} aria-hidden /></button>
          </span>
        </div>
        {open === index && <div className="se-item-body">
          <SpecFields fields={spec.fields} value={item} onChange={(update) => onChange(items.map((entry, position) => position === index ? update(entry) : entry))} />
        </div>}
      </li>)}
    </ol>}
    {items.length < spec.max && <button type="button" className="se-add" onClick={() => { onChange([...items, spec.create()]); setOpen(items.length); }}><Plus size={14} aria-hidden />Add {spec.itemLabel.toLowerCase()}</button>}
  </div>;
}

export function SpecFields({ fields, value, onChange }: { fields: FieldSpec[]; value: Data; onChange: Update<Data> }) {
  const set = (key: string, next: unknown) => onChange((data) => ({ ...data, [key]: next }));
  const toggles = fields.filter((spec) => spec.kind === "toggle");
  return <>
    {fields.map((spec) => {
      switch (spec.kind) {
        case "text": return <TextField key={spec.key} label={spec.label} help={spec.help} required={spec.required} max={spec.max} placeholder={spec.placeholder} value={str(value[spec.key])} onChange={(next) => set(spec.key, next)} />;
        case "textarea": return <TextArea key={spec.key} label={spec.label} help={spec.help} required={spec.required} max={spec.max} rows={spec.rows} placeholder={spec.placeholder} value={str(value[spec.key])} onChange={(next) => set(spec.key, next)} />;
        case "choice": return <Segmented key={spec.key} label={spec.label} help={spec.help} options={spec.options} value={str(value[spec.key]) || spec.options[0].value} onChange={(next) => set(spec.key, next)} />;
        case "icon": return <IconPicker key={spec.key} label={spec.label} optional={spec.optional} value={(value[spec.key] as IconName | null) ?? (spec.optional ? null : "check")} onChange={(next) => set(spec.key, next)} />;
        case "media": return <MediaField key={spec.key} label={spec.label} help={spec.help} required={spec.required} accept={spec.accept} value={(value[spec.key] as Media | null) ?? null} onChange={(next) => set(spec.key, next)} />;
        case "mediaList": return <MediaListField key={spec.key} label={spec.label} help={spec.help} accept={spec.accept} max={spec.max} value={arr<Media>(value[spec.key])} onChange={(next) => set(spec.key, next)} />;
        case "strings": return <StringList key={spec.key} label={spec.label} help={spec.help} max={spec.max} itemMax={spec.itemMax} placeholder={spec.placeholder} values={arr<string>(value[spec.key])} onChange={(next) => set(spec.key, next)} />;
        case "list": return <ItemList key={spec.key} spec={spec} items={arr<Data>(value[spec.key])} onChange={(next) => set(spec.key, next)} />;
        case "table": return <SizeTable key={spec.key} data={value} onChange={onChange} />;
        case "toggle": return spec === toggles[0] ? <div key={spec.key} className="se-toggle-row">
          {toggles.map((toggle) => <Switch key={toggle.key} label={toggle.label} checked={value[toggle.key] === true} onChange={(next) => set(toggle.key, next)} />)}
        </div> : null;
      }
    })}
  </>;
}

function summary(section: Section) {
  const data = section.data as Data;
  for (const key of ["headline", "title", "text", "quote"]) if (str(data[key])) return str(data[key]);
  for (const key of ["items", "tiles", "steps", "rows", "videos", "media"]) if (Array.isArray(data[key])) return `${(data[key] as unknown[]).length} ${key === "media" ? "media" : key}`;
  return "";
}

function newId(type: SectionType, sections: Section[]) {
  const base = type.replace(/_/g, "-");
  if (!sections.some((section) => section.id === base)) return base;
  let id: string;
  do id = `${base}-${Math.random().toString(36).slice(2, 6)}`; while (sections.some((section) => section.id === id));
  return id;
}

/** The store page's sections in order: open one to edit it, switch it off, move or remove it. */
export function PageBuilder({ page, onChange, problem, reveal }: {
  page: StorePage; onChange: Update<StorePage>; problem: { section: number; text: string } | null; reveal: { section: number; at: number } | null;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  // A save that found a problem asks to open its section (once per request).
  const [revealed, setRevealed] = useState<number | null>(null);
  if (reveal && reveal.at !== revealed) {
    setRevealed(reveal.at);
    const id = page.sections[reveal.section]?.id;
    if (id) setOpen(id);
  }
  useEffect(() => {
    const id = reveal ? page.sections[reveal.section]?.id : null;
    if (id) requestAnimationFrame(() => document.getElementById(`se-section-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  // Only when a save asks to reveal a section, not on every edit.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reveal?.at]);

  const updateAt = (id: string, update: (section: Section) => Section) => onChange((current) => ({ ...current, sections: current.sections.map((section) => section.id === id ? update(section) : section) }));
  const move = (index: number, delta: number) => onChange((current) => {
    const sections = [...current.sections]; const [section] = sections.splice(index, 1); sections.splice(index + delta, 0, section);
    return { ...current, sections };
  });
  const remove = (index: number) => {
    const removed = page.sections[index];
    onChange((current) => ({ ...current, sections: current.sections.filter((section) => section.id !== removed.id) }));
    toast(`${SECTION_LABELS[removed.type]} removed`, { action: { label: "Undo", onClick: () => onChange((current) => {
      const sections = [...current.sections]; sections.splice(Math.min(index, sections.length), 0, removed);
      return { ...current, sections };
    }) } });
  };
  const add = (type: SectionType) => {
    const id = newId(type, page.sections);
    onChange((current) => {
      const sections = [...current.sections];
      const after = open ? sections.findIndex((section) => section.id === open) : -1;
      const finale = sections.findIndex((section) => section.type === "final_cta");
      const at = after >= 0 ? after + 1 : finale >= 0 && type !== "final_cta" ? finale : sections.length;
      sections.splice(type === "announcement" ? 0 : at, 0, { id, type, enabled: true, data: newSectionData(type) } as Section);
      return { ...current, sections };
    });
    setAdding(false); setOpen(id);
    requestAnimationFrame(() => document.getElementById(`se-section-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  };

  return <div className="se-builder">
    {problem && problem.section < 0 && <p className="form-error" role="alert">{problem.text}</p>}
    <ol className="se-sections">
      {page.sections.map((section, index) => {
        const isOpen = open === section.id;
        const error = problem?.section === index ? problem.text : null;
        return <li key={section.id} id={`se-section-${section.id}`} className={`se-section${isOpen ? " is-open" : ""}${section.enabled ? "" : " is-off"}${error ? " has-error" : ""}`}>
          <div className="se-section-head">
            <button type="button" className="se-section-toggle" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : section.id)}>
              <span className="se-section-name">{SECTION_LABELS[section.type]}{error && <span className="se-dot" aria-label="Needs attention" />}</span>
              <span className="se-section-summary">{section.enabled ? summary(section) || SECTION_SPECS[section.type].description : "Hidden"}</span>
              <ChevronDown size={16} aria-hidden />
            </button>
            <span className="se-section-actions">
              {section.type !== "hero" && <Switch compact label={`Show ${SECTION_LABELS[section.type]}`} checked={section.enabled} onChange={(enabled) => updateAt(section.id, (current) => ({ ...current, enabled }))} />}
              <button type="button" className="se-icon-button" disabled={index === 0} aria-label={`Move ${SECTION_LABELS[section.type]} up`} onClick={() => move(index, -1)}><ArrowUp size={15} aria-hidden /></button>
              <button type="button" className="se-icon-button" disabled={index === page.sections.length - 1} aria-label={`Move ${SECTION_LABELS[section.type]} down`} onClick={() => move(index, 1)}><ArrowDown size={15} aria-hidden /></button>
              {section.type !== "hero" && <button type="button" className="se-icon-button danger" aria-label={`Remove ${SECTION_LABELS[section.type]}`} onClick={() => remove(index)}><Trash2 size={15} aria-hidden /></button>}
            </span>
          </div>
          {isOpen && <div className="se-section-body">
            {error && <p className="form-error" role="alert">{error}</p>}
            <p className="se-section-description">{SECTION_SPECS[section.type].description}</p>
            <SpecFields fields={SECTION_SPECS[section.type].fields} value={section.data as Data}
              onChange={(update) => updateAt(section.id, (current) => ({ ...current, data: update(current.data as Data) } as Section))} />
          </div>}
        </li>;
      })}
    </ol>
    <button type="button" className="button secondary se-add-section" onClick={() => setAdding(true)}><Plus size={16} aria-hidden />Add a section</button>

    <Dialog open={adding} onOpenChange={setAdding}>
      <DialogContent className="se-picker">
        <DialogHeader>
          <DialogTitle>Add a section</DialogTitle>
          <DialogDescription>{open ? "It goes after the section you have open." : "It goes before the final call to action. You can move it afterwards."}</DialogDescription>
        </DialogHeader>
        <div className="se-section-choices">
          {(Object.keys(SECTION_SPECS) as SectionType[]).map((type) => {
            const taken = SINGLE_SECTIONS.includes(type) && page.sections.some((section) => section.type === type);
            return <button key={type} type="button" disabled={taken} onClick={() => add(type)}>
              <strong>{SECTION_LABELS[type]}</strong>
              <span>{taken ? "Already on the page. Each store can have one." : SECTION_SPECS[type].description}</span>
            </button>;
          })}
        </div>
      </DialogContent>
    </Dialog>
  </div>;
}
