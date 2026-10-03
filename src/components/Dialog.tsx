"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function Dialog({
  open,
  title,
  onClose,
  children,
  wide = false,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  const id = useId();
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        close.current();
      }
      if (event.key !== "Tab") return;
      const nodes = Array.from(
        ref.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]',
        ) ?? [],
      ).filter((el) => el.getClientRects().length > 0);
      const first = nodes[0],
        last = nodes.at(-1);
      if (!first) {
        event.preventDefault();
        return;
      }
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          document.activeElement === ref.current)
      ) {
        event.preventDefault();
        last?.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          document.activeElement === ref.current)
      ) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", keydown);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", keydown);
      previous?.focus();
    };
  }, [open]);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div
      className="dialog-overlay app-dialog-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={`dialog-panel app-dialog ${wide ? "is-wide" : ""}`}
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        tabIndex={-1}
      >
        <header className="flex items-center justify-between gap-3 border-b border-line p-5">
          <h2 id={id} className="text-xl">
            {title}
          </h2>
          <button
            className="icon-button"
            type="button"
            aria-label={`关闭${title}`}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>
        <div className="dialog-body p-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
