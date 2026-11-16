import type { ComponentChildren } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { Option } from "../data/geo";

/** Moves keyboard focus to a field by id (used by "fix this" links). */
export function focusField(id: string): void {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView?.({ block: "center" });
  el.focus({ preventScroll: true });
}

/**
 * Accepts a dropped file anywhere on the page. A depth counter keeps the highlight steady
 * while the pointer crosses child elements (dragleave fires for each of them).
 */
export function useFileDrop(onFile: (file: File) => void): boolean {
  const [dragging, setDragging] = useState(false);
  const latest = useRef(onFile);
  latest.current = onFile;

  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setDragging(true);
    };
    const over = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      const file = e.dataTransfer?.files[0];
      if (file) latest.current(file);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  }, []);

  return dragging;
}

export interface StepStatus {
  tone: "ok" | "warn" | "muted";
  text: string;
}

interface SheetProps {
  id: string;
  title: string;
  status?: StepStatus;
  children: ComponentChildren;
}

/** A ruled section of the filing sheet: a hairline heading with its state word, then rows. No boxes. */
export function Sheet({ id, title, status, children }: SheetProps) {
  return (
    <section className="sheet-sec" id={`sec-${id}`} aria-labelledby={`h-${id}`}>
      <header className="sheet-head">
        <h2 id={`h-${id}`}>{title}</h2>
        {status && <span className={`state ${status.tone}`}>{status.text}</span>}
      </header>
      {children}
    </section>
  );
}

interface FieldProps {
  id: string;
  label: string;
  required?: boolean;
  error?: string | undefined;
  hint?: string | undefined;
  /** Label a group of controls (radio group) instead of a single input. */
  group?: boolean;
  /** Keep the label for screen readers only (the control sits in a table cell that names it). */
  hideLabel?: boolean;
  /** A field the clerk must get right: larger control. */
  lead?: boolean;
  children: ComponentChildren;
}

export function Field({ id, label, required, error, hint, group, hideLabel, lead, children }: FieldProps) {
  const text = (
    <>
      {label}
      {required && (
        <span className="req" aria-hidden="true">
          {" "}
          *
        </span>
      )}
    </>
  );
  return (
    <div className={`field${error ? " invalid" : ""}${lead ? " lead" : ""}${hideLabel ? " bare" : ""}`}>
      {group ? (
        <span id={`${id}-label`} className={`field-label${hideLabel ? " sr-only" : ""}`}>
          {text}
        </span>
      ) : (
        <label htmlFor={id} className={`field-label${hideLabel ? " sr-only" : ""}`}>
          {text}
        </label>
      )}
      {children}
      {error ? (
        <p id={`${id}-msg`} className="field-msg err">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-msg`} className="field-msg">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

interface SegmentedProps {
  id: string;
  label: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  required?: boolean;
  error?: string | undefined;
  hint?: string | undefined;
  hideLabel?: boolean;
  lead?: boolean;
}

/** A short list of exclusive choices shown as buttons. Arrow keys move and select, like native radios. */
export function Segmented({
  id,
  label,
  value,
  options,
  onChange,
  required,
  error,
  hint,
  hideLabel,
  lead,
}: SegmentedProps) {
  const move = (e: KeyboardEvent, from: number) => {
    const step =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? -1
          : 0;
    if (step === 0) return;
    e.preventDefault();
    const next = (from + step + options.length) % options.length;
    const target = options[next];
    if (!target) return;
    onChange(target.value);
    (e.currentTarget as HTMLElement).parentElement
      ?.querySelectorAll<HTMLElement>("[role=radio]")
      [next]?.focus();
  };
  return (
    <Field
      id={id}
      label={label}
      required={required}
      error={error}
      hint={hint}
      group
      hideLabel={hideLabel}
      lead={lead}
    >
      <div
        className="seg"
        role="radiogroup"
        aria-labelledby={`${id}-label`}
        aria-invalid={error ? true : undefined}
        aria-required={required ? true : undefined}
      >
        {options.map((o, i) => {
          const on = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              id={i === 0 ? id : undefined}
              aria-checked={on}
              tabIndex={on || (value === "" && i === 0) ? 0 : -1}
              className={`seg-item${on ? " on" : ""}`}
              onClick={() => onChange(o.value)}
              onKeyDown={(e) => move(e, i)}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </Field>
  );
}

function filterOptions(options: Option[], query: string | null): Option[] {
  const tokens = (query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  const first = tokens[0];
  if (first === undefined) return options;
  const hits = options.filter((o) => {
    const haystack = `${o.label} ${o.value} ${o.detail ?? ""}`.toLowerCase();
    return tokens.every((t) => haystack.includes(t));
  });
  // Entries that start with what was typed come first ("United…" before "Tanzania, United Republic").
  const starts = (o: Option) =>
    o.label.toLowerCase().startsWith(first) || o.value.toLowerCase() === first ? 0 : 1;
  return hits.sort((a, b) => starts(a) - starts(b));
}

interface ComboboxProps {
  id: string;
  label: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** The typed text is the value and the options are only suggestions (codes that may not be in a list). */
  freeText?: boolean;
  required?: boolean;
  error?: string | undefined;
  hint?: string | undefined;
  hideLabel?: boolean;
  lead?: boolean;
  /** Keep the chosen option's detail visible after its label while the list is closed (cut with …). */
  showDetail?: boolean;
}

/**
 * Searchable list replacing the native select: type to filter, arrows and Enter to choose,
 * long entries wrap, and a value from the file that is not in the list stays visible.
 */
export function Combobox({
  id,
  label,
  value,
  options,
  onChange,
  placeholder,
  disabled,
  freeText,
  required,
  error,
  hint,
  hideLabel,
  lead,
  showDetail,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const all = useMemo(
    () =>
      freeText || value === "" || options.some((o) => o.value === value)
        ? options
        : [{ value, label: `${value} (from file)` }, ...options],
    [options, value, freeText],
  );
  const matches = useMemo(() => filterOptions(all, query), [all, query]);
  const chosen = all.find((o) => o.value === value);
  const shown = freeText ? value : (chosen?.label ?? "");
  const detail = showDetail && !freeText && value !== "" && !open ? chosen?.detail : undefined;
  const listId = `${id}-list`;
  const popup = open && (matches.length > 0 || !freeText);

  useEffect(() => {
    if (popup) listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView?.({ block: "nearest" });
  }, [popup, active]);

  const openList = () => {
    if (disabled) return;
    // Free text starts with nothing highlighted, so Enter keeps what was typed until an arrow key picks a suggestion.
    setActive(
      freeText
        ? -1
        : Math.max(
            0,
            matches.findIndex((o) => o.value === value),
          ),
    );
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    setQuery(null);
  };
  const commit = (o: Option | undefined) => {
    if (!o) return;
    onChange(o.value);
    close();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!popup) return openList();
      const n = matches.length;
      if (n === 0) return;
      const down = e.key === "ArrowDown";
      setActive((i) => (i < 0 ? (down ? 0 : n - 1) : down ? (i + 1) % n : (i - 1 + n) % n));
    } else if (e.key === "Enter" && popup) {
      e.preventDefault();
      const picked = matches[active];
      if (picked) commit(picked);
      else close();
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      close();
    }
  };

  return (
    <Field
      id={id}
      label={label}
      required={required}
      error={error}
      hint={hint}
      hideLabel={hideLabel}
      lead={lead}
    >
      <div className="combo">
        {detail && (
          <span className="combo-shown" aria-hidden="true">
            <span className="combo-shown-label">{shown}</span>
            <span className="combo-shown-detail">{detail}</span>
          </span>
        )}
        <input
          id={id}
          className="combo-input"
          role="combobox"
          aria-expanded={popup}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={popup && matches[active] ? `${id}-opt-${active}` : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? `${id}-msg` : undefined}
          aria-required={required}
          autoComplete="off"
          spellcheck={false}
          disabled={disabled}
          placeholder={placeholder}
          value={query ?? shown}
          title={detail ? `${shown} — ${detail}` : undefined}
          onFocus={(e) => {
            openList();
            e.currentTarget.select();
          }}
          onClick={() => {
            if (!open) openList();
          }}
          onInput={(e) => {
            const v = e.currentTarget.value;
            setQuery(v);
            setActive(freeText ? -1 : 0);
            setOpen(true);
            if (freeText) onChange(v);
          }}
          onKeyDown={onKeyDown}
          onBlur={close}
        />
        {value !== "" && !disabled && (
          <button
            type="button"
            className="combo-clear"
            aria-label={`Clear ${label}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onChange("");
              setQuery(null);
            }}
          >
            ×
          </button>
        )}
        {popup && (
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label={label}
            className="combo-list"
            onMouseDown={(e) => e.preventDefault()}
          >
            {matches.length === 0 && (
              <li className="combo-empty" role="presentation">
                No match for “{query}”
              </li>
            )}
            {matches.map((o, i) => (
              <li
                key={o.value}
                id={`${id}-opt-${i}`}
                role="option"
                aria-selected={o.value === value}
                data-active={i === active}
                className={`combo-opt${i === active ? " active" : ""}${o.value === value ? " chosen" : ""}`}
                onClick={() => commit(o)}
                onMouseMove={() => {
                  if (i !== active) setActive(i);
                }}
              >
                <span className="combo-opt-label">{o.label}</span>
                {o.detail && <span className="combo-opt-detail">{o.detail}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Field>
  );
}

type Theme = "dark" | "light";

const readTheme = (): Theme => (document.documentElement.dataset.theme === "light" ? "light" : "dark");

/** Dark is the default. The choice is remembered per browser; storage may be unavailable. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(readTheme);
  const next: Theme = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      className="icon-btn theme"
      title={`Switch to ${next} theme`}
      aria-label={`Switch to ${next} theme`}
      onClick={() => {
        document.documentElement.dataset.theme = next;
        try {
          localStorage.setItem("theme", next);
        } catch {
          /* private mode: the choice just will not persist */
        }
        setTheme(next);
      }}
    >
      <svg
        viewBox="0 0 24 24"
        width="18"
        height="18"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        {theme === "dark" ? (
          <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z" />
        ) : (
          <path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z" />
        )}
      </svg>
    </button>
  );
}
