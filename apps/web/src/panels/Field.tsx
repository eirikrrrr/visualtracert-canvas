// A text field that applies its value on Enter or when it loses focus (one
// undo step per edit, not per key), with an optional check that keeps an
// invalid value from being applied.
import { useEffect, useId, useState } from "react";

interface FieldProps {
  label: string;
  value: string;
  onApply: (value: string) => void;
  /** a message when the value is not valid */
  check?: (value: string) => string | null;
  placeholder?: string;
  mono?: boolean;
  hint?: string;
}

export function Field({ label, value, onApply, check, placeholder, mono, hint }: FieldProps) {
  const id = useId();
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setDraft(value); setError(null); }, [value]);

  const apply = () => {
    const next = draft.trim();
    if(next === value) return;
    const problem = check ? check(next) : null;
    setError(problem);
    if(!problem) onApply(next);
  };

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className={`${mono ? "mono" : ""}${error ? " invalid" : ""}`}
        value={draft}
        placeholder={placeholder}
        spellCheck={false}
        aria-invalid={Boolean(error)}
        aria-describedby={error || hint ? `${id}-note` : undefined}
        onChange={event => setDraft(event.target.value)}
        onBlur={apply}
        onKeyDown={event => {
          if(event.key === "Enter") apply();
          if(event.key === "Escape"){ setDraft(value); setError(null); }
        }}
      />
      {(error || hint) && <small id={`${id}-note`} className={error ? "field-error" : "field-hint"}>{error ?? hint}</small>}
    </div>
  );
}
