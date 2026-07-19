// FILE: src/components/matu/ThemeToggle.tsx
import { Moon, Sparkles, Sun } from "lucide-react";
import { useTheme, type Theme } from "@/lib/theme";

const OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "pink", label: "Pink", icon: Sparkles },
];

// Lives in AppShell's header — every page, always visible, one tap to cycle
// light -> dark -> pink -> light. The full 3-way picker below still lives on
// the Account page for anyone who wants to pick a specific mode deliberately
// rather than cycle to it.
export function ThemeToggleCompact() {
  const { theme, setTheme } = useTheme();
  const currentIndex = OPTIONS.findIndex((o) => o.value === theme);
  const current = OPTIONS[currentIndex];
  const next = OPTIONS[(currentIndex + 1) % OPTIONS.length];
  const Icon = current.icon;

  return (
    <button
      type="button"
      onClick={() => setTheme(next.value)}
      aria-label={`Appearance: ${current.label}. Tap for ${next.label}.`}
      title={`Appearance: ${current.label} — tap for ${next.label}`}
      className="inline-flex items-center gap-1.5 rounded-md bg-surface/15 px-3 py-1.5 text-sm font-medium hover:bg-surface/25"
    >
      <Icon className="size-4" /> <span className="hidden sm:inline">{current.label}</span>
    </button>
  );
}

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label="Appearance"
      className="inline-flex items-center gap-1 rounded-xl border border-border bg-secondary p-1"
    >
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const active = theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setTheme(value)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              active
                ? "bg-primary text-primary-foreground shadow-soft"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="size-4" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
