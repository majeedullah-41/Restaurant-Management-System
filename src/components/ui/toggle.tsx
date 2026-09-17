import { cn } from "@/lib/utils"

interface ToggleProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  testId?: string;
  className?: string;
  activeClass?: string;
}

function Toggle({ checked, onChange, testId, className, activeClass = "bg-violet-600" }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      data-testid={testId}
      onClick={(e) => {
        e.preventDefault();
        onChange(!checked);
      }}
      className={cn(
        "relative w-11 h-6 rounded-full transition-colors shrink-0",
        checked ? activeClass : "bg-slate-300 dark:bg-slate-700",
        className
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform",
          checked && "translate-x-5"
        )}
      />
    </button>
  );
}

interface ToggleRowProps {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  description?: string;
  testId?: string;
  activeClass?: string;
  className?: string;
  labelClassName?: string;
}

function ToggleRow({ label, checked, onChange, description, testId, activeClass, className, labelClassName }: ToggleRowProps) {
  return (
    <label className={cn("flex items-center justify-between py-2 cursor-pointer select-none gap-4", className)}>
      <span className="min-w-0">
        <span className={cn("block text-sm text-slate-700 dark:text-slate-300", labelClassName)}>{label}</span>
        {description && (
          <span className="block text-xs text-slate-400 dark:text-slate-500 mt-0.5">{description}</span>
        )}
      </span>
      <Toggle checked={checked} onChange={onChange} testId={testId} activeClass={activeClass} />
    </label>
  );
}

export { Toggle, ToggleRow }