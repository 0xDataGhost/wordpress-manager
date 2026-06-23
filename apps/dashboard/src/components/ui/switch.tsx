import * as React from "react";
import { cn } from "@/lib/utils";

interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
  "aria-label"?: string;
}

/**
 * Minimal, dependency-free toggle. Accessible (`role="switch"` + `aria-checked`)
 * and RTL-aware: the thumb rests at the inline-start when off and slides to the
 * inline-end when on, animating only `transform` (compositor-friendly). The app
 * is globally RTL, so the `rtl:` variant drives the visual direction.
 */
export const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ checked, onCheckedChange, disabled, id, ...rest }, ref) => {
    return (
      <button
        ref={ref}
        type="button"
        role="switch"
        aria-checked={checked}
        id={id}
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          checked ? "bg-primary" : "bg-input",
        )}
        {...rest}
      >
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute top-0.5 start-0.5 inline-block h-5 w-5 rounded-full bg-background shadow ring-0 transition-transform",
            checked ? "ltr:translate-x-5 rtl:-translate-x-5" : "translate-x-0",
          )}
        />
      </button>
    );
  },
);
Switch.displayName = "Switch";
