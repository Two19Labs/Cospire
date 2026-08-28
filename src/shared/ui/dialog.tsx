"use client";

import { useEffect, useRef, type ReactNode } from "react";

import { Button } from "@/shared/ui/button";

export interface DialogProps {
  children: ReactNode;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  title: string;
}

export function Dialog({ children, onOpenChange, open, title }: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      aria-labelledby="dialog-title"
      className="dialog"
      onCancel={() => onOpenChange(false)}
      onClose={() => onOpenChange(false)}
      ref={dialogRef}
    >
      <div className="dialog__header">
        <h2 id="dialog-title">{title}</h2>
        <Button
          aria-label="Close dialog"
          onClick={() => onOpenChange(false)}
          variant="secondary"
        >
          Close
        </Button>
      </div>
      {children}
    </dialog>
  );
}
