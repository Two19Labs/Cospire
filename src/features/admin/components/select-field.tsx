import type { SelectHTMLAttributes } from "react";

import { classNames } from "@/shared/utils/class-names";

// Built inside the feature rather than added to `src/shared/ui`, per operating
// manual §6.1: features build components locally first and a human promotes
// them to shared during review, once a second caller proves the shape is right.

export interface SelectFieldProps
  extends SelectHTMLAttributes<HTMLSelectElement> {
  error?: string;
  label: string;
  options: ReadonlyArray<{ label: string; value: string }>;
}

export function SelectField({
  className,
  error,
  id,
  label,
  options,
  ...props
}: SelectFieldProps) {
  const selectId = id ?? props.name;
  const errorId = error && selectId ? `${selectId}-error` : undefined;

  return (
    <label className="field" htmlFor={selectId}>
      <span className="field__label">{label}</span>
      <select
        aria-describedby={errorId}
        aria-invalid={Boolean(error)}
        className={classNames("input", className)}
        id={selectId}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error ? (
        <span className="field__error" id={errorId} role="alert">
          {error}
        </span>
      ) : null}
    </label>
  );
}
