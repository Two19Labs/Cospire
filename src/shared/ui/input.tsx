import { forwardRef, type InputHTMLAttributes } from "react";

import { classNames } from "@/shared/utils/class-names";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, error, id, label, ...props },
  ref,
) {
  const inputId = id ?? props.name;
  const errorId = error && inputId ? `${inputId}-error` : undefined;

  return (
    <label className="field" htmlFor={inputId}>
      <span className="field__label">{label}</span>
      <input
        aria-describedby={errorId}
        aria-invalid={Boolean(error)}
        className={classNames("input", className)}
        id={inputId}
        ref={ref}
        {...props}
      />
      {error ? (
        <span className="field__error" id={errorId} role="alert">
          {error}
        </span>
      ) : null}
    </label>
  );
});
