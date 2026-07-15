import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Bus, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { homePathForUser, type AppRole } from "@/lib/matu-auth";

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>) => ({
    role:
      search.role === "passenger" || search.role === "driver" || search.role === "sacco_admin"
        ? (search.role as AppRole)
        : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Sign in · Matu" },
      { name: "description", content: "Sign in or join Matu as a passenger, driver, or SACCO." },
    ],
  }),
  component: AuthPage,
});

const ROLE_OPTIONS: { value: AppRole; label: string; desc: string }[] = [
  { value: "passenger", label: "Passenger", desc: "Find a matatu, book a seat" },
  { value: "driver", label: "Driver / Conductor", desc: "Pick up passengers on your route" },
  { value: "sacco_admin", label: "SACCO Admin", desc: "Manage your fleet & drivers" },
];

function roleLabel(role: AppRole) {
  return ROLE_OPTIONS.find((r) => r.value === role)?.label ?? role;
}

function AuthPage() {
  const navigate = useNavigate();
  const { role: roleParam } = Route.useSearch();
  const [mode, setMode] = useState<"signin" | "signup">(roleParam ? "signup" : "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<AppRole>(roleParam ?? "passenger");
  const [idNumber, setIdNumber] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [loading, setLoading] = useState(false);

  const needsVerificationFields = role === "driver" || role === "sacco_admin";

  // A homepage "Become a driver" / "Become a SACCO owner" / "Become a
  // passenger" button lands here with ?role=driver etc. — jump straight into
  // signup with that role already picked, instead of making them re-select
  // it after already telling us what they wanted.
  useEffect(() => {
    if (roleParam) {
      setMode("signup");
      setRole(roleParam);
    }
  }, [roleParam]);

  // Redirect signed-in users away
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session?.user) {
        const home = await homePathForUser(data.session.user.id);
        navigate({ to: home, replace: true });
      }
    });
  }, [navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "signup" && needsVerificationFields && !idNumber.trim()) {
      toast.error("Enter your national ID number");
      return;
    }
    if (mode === "signup" && role === "driver" && !licenseNumber.trim()) {
      toast.error("Enter your driving license number");
      return;
    }
    setLoading(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { full_name: fullName.trim(), phone: phone.trim(), role },
          },
        });
        if (error) throw error;

        if (data.session?.user) {
          // Guarantee chosen role is assigned even if the DB trigger missed it.
          // For driver/sacco_admin this also flips profiles.verification_status
          // to 'pending' (see claim_role) — the identity details below are what
          // a platform admin reviews to clear that.
          await supabase.rpc("claim_role", { _role: role });
          if (needsVerificationFields) {
            const { error: verifyError } = await supabase
              .from("profiles")
              .update({
                id_number: idNumber.trim(),
                license_number: role === "driver" ? licenseNumber.trim() : null,
              })
              .eq("id", data.session.user.id);
            if (verifyError) throw verifyError;
          }
          const home = await homePathForUser(data.session.user.id);
          toast.success(
            needsVerificationFields
              ? `Welcome to Matu, ${roleLabel(role)}! Your account is pending verification — you can start using the app now, and we'll confirm your details shortly.`
              : `Welcome to Matu, ${roleLabel(role)}!`,
            { duration: 6000 },
          );
          navigate({ to: home, replace: true });
        } else {
          // Email confirmation is required — there's no session yet, so there's
          // nothing to redirect to. Make that explicit instead of silently doing
          // nothing, and drop them into sign-in mode with their email pre-filled.
          toast.success("Account created. Check your email to confirm it, then sign in.");
          setMode("signin");
          setPassword("");
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        if (data.user) {
          const home = await homePathForUser(data.user.id);
          toast.success("Karibu tena!");
          navigate({ to: home, replace: true });
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: window.location.origin + "/auth",
        },
      });
      if (error) {
        toast.error("Google sign-in failed");
        setLoading(false);
      }
      // On success, Supabase redirects the browser to Google automatically —
      // nothing else needs to happen here.
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Google sign-in failed");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Back
        </Link>
        <Link to="/" className="flex items-center gap-2">
          <span className="relative grid size-8 place-items-center overflow-hidden rounded-lg bg-primary">
            <span className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 bg-accent" />
            <Bus className="relative z-10 size-4 text-primary-foreground" />
          </span>
          <span className="font-display text-xl font-bold">Matu</span>
        </Link>
      </header>

      <main className="mx-auto grid max-w-md gap-6 px-5 py-8 md:py-14">
        <div className="text-center">
          <h1 className="font-display text-3xl font-bold">
            {mode === "signup" ? "Join Matu" : "Welcome back"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {mode === "signup" ? "Tell us how you'll use Matu." : "Sign in to keep moving."}
          </p>
        </div>

        <button
          onClick={handleGoogle}
          disabled={loading}
          className="flex items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 py-3 text-sm font-medium transition hover:bg-secondary disabled:opacity-50"
        >
          <GoogleIcon /> Continue with Google
        </button>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <div className="h-px flex-1 bg-border" /> or email{" "}
          <div className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {mode === "signup" && (
            <>
              <Input label="Full name" value={fullName} onChange={setFullName} required />
              <Input
                label="Phone (M-Pesa)"
                value={phone}
                onChange={setPhone}
                placeholder="07XX XXX XXX"
              />
            </>
          )}
          <Input label="Email" type="email" value={email} onChange={setEmail} required />
          <Input
            label="Password"
            type="password"
            value={password}
            onChange={setPassword}
            required
            minLength={6}
          />

          {mode === "signup" && (
            <fieldset className="space-y-2 pt-2">
              <legend className="text-sm font-medium">I am a…</legend>
              <div className="grid gap-2">
                {ROLE_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition ${role === opt.value ? "border-primary bg-primary/5" : "border-border hover:bg-secondary"}`}
                  >
                    <input
                      type="radio"
                      name="role"
                      value={opt.value}
                      checked={role === opt.value}
                      onChange={() => setRole(opt.value)}
                      className="mt-0.5 accent-primary"
                    />
                    <span>
                      <span className="block font-medium text-foreground">{opt.label}</span>
                      <span className="block text-xs text-muted-foreground">{opt.desc}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {mode === "signup" && needsVerificationFields && (
            <fieldset className="space-y-3 rounded-lg border border-border bg-secondary/40 p-3">
              <legend className="px-1 text-sm font-medium">Identity verification</legend>
              <p className="text-xs text-muted-foreground">
                {role === "driver"
                  ? "Required for every driver — a platform admin reviews this before your account is fully verified. You can start using the app right away; verification runs in the background."
                  : "Required for SACCO owners — a platform admin reviews this before your account is fully verified. You can start using the app right away; verification runs in the background."}
              </p>
              <Input
                label="National ID number"
                value={idNumber}
                onChange={setIdNumber}
                required
                placeholder="e.g. 12345678"
              />
              {role === "driver" && (
                <Input
                  label="Driving license number"
                  value={licenseNumber}
                  onChange={setLicenseNumber}
                  required
                  placeholder="e.g. DL1234567"
                />
              )}
            </fieldset>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"}
          </button>

          {mode === "signup" && (
            <p className="text-center text-xs text-muted-foreground">
              By creating an account you agree to Matu's{" "}
              <Link to="/terms" className="underline hover:text-foreground">
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link to="/privacy" className="underline hover:text-foreground">
                Privacy Policy
              </Link>
              .
            </p>
          )}
        </form>

        <p className="text-center text-sm text-muted-foreground">
          {mode === "signup" ? "Already have an account?" : "New to Matu?"}{" "}
          <button
            onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
            className="font-medium text-primary hover:underline"
          >
            {mode === "signup" ? "Sign in" : "Create one"}
          </button>
        </p>
      </main>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
  required,
  placeholder,
  minLength,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  placeholder?: string;
  minLength?: number;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
        minLength={minLength}
        className="w-full rounded-lg border border-input bg-surface px-3 py-2.5 text-sm outline-none ring-ring focus:ring-2"
      />
    </label>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1A6.99 6.99 0 015.46 12c0-.73.13-1.44.36-2.1V7.07H2.18A11 11 0 001 12c0 1.77.42 3.44 1.18 4.93l3.66-2.83z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.83C6.71 7.31 9.14 5.38 12 5.38z"
      />
    </svg>
  );
}
