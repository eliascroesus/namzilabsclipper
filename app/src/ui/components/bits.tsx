import { useRef, useState, type ReactNode } from "react";

/** The Namzilabs mark: two overlapping rings. */
export function Mark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="25" cy="32" r="15" fill="none" stroke="currentColor" strokeWidth="4.6" />
      <circle cx="39" cy="32" r="15" fill="none" stroke="currentColor" strokeWidth="4.6" />
    </svg>
  );
}

export function Section({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="card">
      <div className="section-head">
        <span className="caps">{title}</span>
        {right && <span className="right">{right}</span>}
      </div>
      {children}
    </section>
  );
}

export function Segmented<T extends string | number>({ value, options, onChange, label, disabled }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; label: string; disabled?: boolean }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" aria-pressed={o.value === value} disabled={disabled} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({ checked, onChange, children, hint }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="switch">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="track" />
      <span className="text">
        {children}
        {hint && <small>{hint}</small>}
      </span>
    </label>
  );
}

/** A drop zone that also opens the file picker when clicked (a label for the hidden input). */
export function Drop({ accept, multiple, onFiles, tall, children }: { accept: string; multiple?: boolean; onFiles: (files: File[]) => void; tall?: boolean; children: ReactNode }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <label
      className={`drop${tall ? " tall" : ""}${over ? " over" : ""}`}
      tabIndex={0}
      role="button"
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          input.current?.click();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const files = Array.from(e.dataTransfer.files);
        if (files.length) onFiles(multiple ? files : files.slice(0, 1));
      }}
    >
      {children}
      <input
        ref={input}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length) onFiles(files);
        }}
      />
    </label>
  );
}

export const fmtTime = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}` : `${s.toFixed(s < 10 ? 1 : 0)}s`);
export const fmtBytes = (b: number) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.round(b / 1e3)} KB`);
