import type { ButtonHTMLAttributes } from "react";

import { classNames } from "@/shared/utils/class-names";

type ButtonVariant = "primary" | "secondary" | "danger";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export function Button({
  className,
  type = "button",
  variant = "primary",
  ...props
}: ButtonProps) {
  return (
    <button
      className={classNames("button", `button--${variant}`, className)}
      type={type}
      {...props}
    />
  );
}
