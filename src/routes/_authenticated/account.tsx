import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Bus,
  Building2,
  LogOut,
  User,
  Check,
  AlertTriangle,
  MessageSquareWarning,
  Volume2,
  ShieldAlert,
  Bell,
  BellOff,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ROLE_HOME, type AppRole } from "@/lib/matu-auth";
import { AppShell } from "@/components/matu/AppShell";
import {
  SOUND_PROFILES,
  getSelectedSoundId,
  setSelectedSoundId,
  testSound,
  type SoundProfileId,
} from "@/lib/noisy-alert";
import {
  getNotificationsPreference,
  setNotificationsPreference,
  notificationPermission,
  pushNotificationsSupported,
  enableTripPushNotifications,
} from "@/lib/push-notifications";

export const Route = createFileRoute("/_authenticated/account")({
  head: () => ({ meta: [{ title: "Account settings · Matu" }] }),
  component: AccountSettings,
});

const REGISTERABLE_ROLES: { value: AppRole; label: string; desc: string; icon: typeof User }[] = [
  { value: "passenger", label: "Passenger", desc: "Find a matatu, book a seat", icon: User },
  {
    value: "driver",
    label: "Driver / Conductor",
    desc: "Pick up passengers on your route",
    icon: Bus,
  },
  {
    value: "sacco_admin",
    label: "SACCO Admin",
    desc: "Manage your fleet & drivers",
    icon: Building2,
  },
];

function AccountSettings() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [age, setAge] = useState("");
  const [phone, setPhone] = useState("");
  const [myRoles, setMyRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [claimingRole, setClaimingRole] = useState<AppRole | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [selectedSound, setSelectedSound] = useState<SoundProfileId>(getSelectedSoundId());
  const [notificationsEnabled, setNotificationsEnabled] = useState(getNotificationsPreference());
  const [pushPermission, setPushPermission] = useState(notificationPermission());
  const [requestingPush, setRequestingPush] = useState(false);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [payMethod, setPayMethod] = useState<"pochi" | "send_money" | "buy_goods" | "">("");
  const [payTarget, setPayTarget] = useState("");
  const [payName, setPayName] = useState("");
  const [savingPayment, setSavingPayment] = useState(false);

  const heldSaccoRole = myRoles.includes("sacco_admin");
  const heldDriverRole = myRoles.includes("driver") || myRoles.includes("conductor");

  useEffect(() => {
    (async () => {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData.user;
      if (!user) return;
      setUserId(user.id);
      setEmail(user.email ?? "");

      const [{ data: profile }, { data: roles }, { data: platformAdmin }] = await Promise.all([
        supabase
          .from("profiles")
          .select(
            "full_name,age,phone,driver_payment_method,driver_payment_target,driver_payment_name",
          )
          .eq("id", user.id)
          .maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", user.id),
        supabase.rpc("is_platform_admin"),
      ]);

      if (profile) {
        setFullName(profile.full_name ?? "");
        setAge(profile.age != null ? String(profile.age) : "");
        setPhone(profile.phone ?? "");
        setPayMethod(profile.driver_payment_method ?? "");
        setPayTarget(profile.driver_payment_target ?? "");
        setPayName(profile.driver_payment_name ?? "");
      }
      // platform_admin is excluded from the self-service AppRole type/picker on
      // purpose (it's granted manually, never claimed), so filter it out here
      // rather than widening AppRole.
      setMyRoles(
        (roles ?? []).map((r) => r.role).filter((r): r is AppRole => r !== "platform_admin"),
      );
      setIsPlatformAdmin(Boolean(platformAdmin));
      setLoading(false);
    })();
  }, []);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) return;
    if (!fullName.trim()) return toast.error("Enter your full name");
    const ageNum = age.trim() ? Number(age) : null;
    if (age.trim() && (Number.isNaN(ageNum) || ageNum! < 16 || ageNum! > 120)) {
      return toast.error("Enter a valid age (16 or older)");
    }
    setSavingProfile(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: fullName.trim(), age: ageNum, phone: phone.trim() })
        .eq("id", userId);
      if (error) throw error;
      toast.success("Profile updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't update profile");
    } finally {
      setSavingProfile(false);
    }
  }

  async function savePaymentMethod(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) return;
    if (!payMethod) {
      toast.error("Pick a payment method");
      return;
    }
    if (!payTarget.trim()) {
      toast.error(payMethod === "buy_goods" ? "Enter your till number" : "Enter the phone number");
      return;
    }
    if (!payName.trim()) {
      toast.error("Enter the name passengers should see");
      return;
    }
    setSavingPayment(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          driver_payment_method: payMethod,
          driver_payment_target: payTarget.trim(),
          driver_payment_name: payName.trim(),
        })
        .eq("id", userId);
      if (error) throw error;
      toast.success("Payment details saved. Passengers booking your trips will see these.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save payment details");
    } finally {
      setSavingPayment(false);
    }
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    setSavingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success("Password updated");
      setNewPassword("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't update password");
    } finally {
      setSavingPassword(false);
    }
  }

  async function registerRole(role: AppRole) {
    setClaimingRole(role);
    try {
      const { error } = await supabase.rpc("claim_role", { _role: role });
      if (error) throw error;
      setMyRoles((prev) => (prev.includes(role) ? prev : [...prev, role]));
      toast.success(`You're now registered as a ${roleLabel(role)}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't register that role");
    } finally {
      setClaimingRole(null);
    }
  }

  async function deleteAccount() {
    if (confirmDelete !== "DELETE") return;
    setDeleting(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const { data, error } = await supabase.functions.invoke("delete-account", {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success("Your account has been deleted.");
      // The account (and its session) no longer exists server-side, so just clear the
      // local session and send them off the app entirely.
      await supabase.auth.signOut();
      navigate({ to: "/", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't delete your account");
    } finally {
      setDeleting(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    toast.success("Signed out");
    navigate({ to: "/auth", replace: true });
  }

  function chooseSound(id: SoundProfileId) {
    setSelectedSound(id);
    setSelectedSoundId(id);
    testSound(id);
    toast.success("Alert sound saved. That's what you'll hear for new passenger alerts.");
  }

  async function toggleNotifications() {
    const next = !notificationsEnabled;

    // Turning it off never needs the browser — just stop offering/using push.
    if (!next) {
      setNotificationsEnabled(false);
      setNotificationsPreference(false);
      toast.success("Notifications off. Matu won't prompt you to enable trip alerts.");
      return;
    }

    setNotificationsEnabled(true);
    setNotificationsPreference(true);

    // Already decided at the browser level — nothing to prompt for.
    if (pushPermission === "granted") {
      toast.success("Notifications on.");
      return;
    }
    if (pushPermission === "denied") {
      toast.error(
        "Notifications are blocked for Matu in your browser. Allow them in your browser's site settings, then try again.",
      );
      return;
    }
    if (!pushNotificationsSupported()) {
      toast.success(
        "Notifications on. You'll be offered the option to enable alerts while tracking a trip.",
      );
      return;
    }

    // This click is itself the user gesture, so calling this here — rather
    // than only from the trip-tracking banner — is what makes the real OS/
    // browser permission dialog appear immediately, on both mobile and
    // desktop, instead of waiting for a second tap later on the trip screen.
    setRequestingPush(true);
    const result = await enableTripPushNotifications();
    setRequestingPush(false);
    setPushPermission(notificationPermission());
    if (result.ok) {
      toast.success("Notifications on — you'll get alerts as your matatu approaches.");
    } else {
      toast.error(result.reason);
    }
  }

  if (loading) {
    return (
      <AppShell title="Account settings">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </AppShell>
    );
  }

  return (
    <AppShell title="Account settings" subtitle="Manage your profile, roles, and sign-in details.">
      <div className="grid gap-6 md:max-w-2xl">
        {/* Profile */}
        <section className="rounded-2xl border border-border bg-surface p-6">
          <h2 className="font-display text-lg font-semibold">Profile</h2>
          <form onSubmit={saveProfile} className="mt-4 space-y-3">
            <Field label="Email">
              <input
                value={email}
                disabled
                className="w-full rounded-lg border border-input bg-secondary px-3 py-2.5 text-sm text-muted-foreground"
              />
            </Field>
            <Field label="Full name">
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none ring-ring focus:ring-2"
              />
            </Field>
            <Field label="Age">
              <input
                type="number"
                min={16}
                max={120}
                value={age}
                onChange={(e) => setAge(e.target.value)}
                placeholder="e.g. 28"
                className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none ring-ring focus:ring-2"
              />
            </Field>
            <Field label="Phone (M-Pesa)">
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="07XX XXX XXX"
                className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none ring-ring focus:ring-2"
              />
            </Field>
            <button
              type="submit"
              disabled={savingProfile}
              className="rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
            >
              {savingProfile ? "Saving…" : "Save profile"}
            </button>
          </form>
        </section>

        {/* How drivers get paid — manual mobile money (no STK Push), shown to
            passengers booking any trip this driver runs */}
        {heldDriverRole && (
          <section className="rounded-2xl border border-border bg-surface p-6">
            <h2 className="font-display text-lg font-semibold">How you get paid</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Passengers pay you directly from their own M-Pesa app using these details. Matu
              doesn't move this money.
            </p>
            <form onSubmit={savePaymentMethod} className="mt-4 space-y-3">
              <Field label="Payment method">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {(
                    [
                      { id: "pochi", label: "Pochi la Biashara" },
                      { id: "send_money", label: "Send Money" },
                      { id: "buy_goods", label: "Buy Goods (Till)" },
                    ] as const
                  ).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setPayMethod(m.id)}
                      className={`rounded-lg border px-3 py-2.5 text-sm font-medium transition ${
                        payMethod === m.id
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border hover:bg-secondary"
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </Field>
              <Field
                label={
                  payMethod === "buy_goods"
                    ? "Till number"
                    : payMethod === "pochi"
                      ? "Pochi phone number"
                      : "Phone number"
                }
              >
                <input
                  value={payTarget}
                  onChange={(e) => setPayTarget(e.target.value)}
                  placeholder={payMethod === "buy_goods" ? "e.g. 123456" : "07XX XXX XXX"}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none ring-ring focus:ring-2"
                />
              </Field>
              <Field label="Name passengers will see">
                <input
                  value={payName}
                  onChange={(e) => setPayName(e.target.value)}
                  placeholder="e.g. John Kamau, or your registered business name"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none ring-ring focus:ring-2"
                />
              </Field>
              <button
                type="submit"
                disabled={savingPayment}
                className="rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
              >
                {savingPayment ? "Saving…" : "Save payment details"}
              </button>
            </form>
          </section>
        )}
        <section className="rounded-2xl border border-border bg-surface p-6">
          <h2 className="font-display text-lg font-semibold">Roles</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Register for another role to unlock its dashboard. You can hold more than one. Use the
            account menu any time to jump between them.
          </p>
          <div className="mt-4 grid gap-2">
            {REGISTERABLE_ROLES.map((opt) => {
              const held = myRoles.includes(opt.value);
              return (
                <div
                  key={opt.value}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
                >
                  <div className="flex items-center gap-3">
                    <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
                      <opt.icon className="size-4" />
                    </span>
                    <div>
                      <div className="text-sm font-medium">{opt.label}</div>
                      <div className="text-xs text-muted-foreground">{opt.desc}</div>
                    </div>
                  </div>
                  {held ? (
                    <Link
                      to={ROLE_HOME[opt.value]}
                      className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition hover:bg-primary/20"
                    >
                      <Check className="size-3.5" /> Go to dashboard
                    </Link>
                  ) : (
                    <button
                      onClick={() => registerRole(opt.value)}
                      disabled={claimingRole === opt.value}
                      className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium transition hover:bg-secondary disabled:opacity-50"
                    >
                      {claimingRole === opt.value ? "Registering…" : "Register"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Password */}
        <section className="rounded-2xl border border-border bg-surface p-6">
          <h2 className="font-display text-lg font-semibold">Password</h2>
          <form onSubmit={savePassword} className="mt-4 space-y-3">
            <Field label="New password">
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={6}
                placeholder="At least 6 characters"
                className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none ring-ring focus:ring-2"
              />
            </Field>
            <button
              type="submit"
              disabled={savingPassword}
              className="rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
            >
              {savingPassword ? "Saving…" : "Update password"}
            </button>
          </form>
        </section>

        {/* Show notifications — controls whether Matu offers to enable browser/push
            alerts at all. Turning this on is itself the user gesture that triggers
            the real browser/OS permission prompt (via enableTripPushNotifications),
            so it takes effect at the browser level immediately on both mobile and
            desktop — it doesn't just set an in-app preference and wait for a later
            tap. Turning it off only stops Matu from asking again; it doesn't revoke
            permission already granted at the browser level (only the browser's own
            site settings can do that). */}
        <section className="rounded-2xl border border-border bg-surface p-6">
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
            <Bell className="size-5" /> Notifications
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            When on, Matu will alert you (even outside the app) as your matatu gets close and when
            it arrives.
          </p>
          <button
            type="button"
            onClick={toggleNotifications}
            disabled={requestingPush}
            className={`mt-4 flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left transition disabled:opacity-60 ${
              notificationsEnabled
                ? "border-primary bg-primary/10"
                : "border-border hover:bg-secondary"
            }`}
          >
            <div className="flex items-center gap-2">
              {notificationsEnabled ? (
                <Bell className="size-4 text-primary" />
              ) : (
                <BellOff className="size-4 text-muted-foreground" />
              )}
              <div>
                <div className="text-sm font-medium">Show notifications</div>
                <div className="text-xs text-muted-foreground">
                  {requestingPush
                    ? "Requesting permission…"
                    : pushPermission === "denied"
                      ? "Blocked at the browser level — check your browser's site settings to allow them."
                      : notificationsEnabled && pushPermission === "granted"
                        ? "On — allowed at the browser level."
                        : notificationsEnabled
                          ? "On — you'll be offered trip alerts."
                          : "Off — Matu won't ask to send alerts."}
                </div>
              </div>
            </div>
            <span
              className={`relative h-6 w-11 shrink-0 rounded-full transition ${
                notificationsEnabled ? "bg-primary" : "bg-secondary"
              }`}
            >
              <span
                className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition ${
                  notificationsEnabled ? "left-5" : "left-0.5"
                }`}
              />
            </span>
          </button>
        </section>

        {/* Alert sound — available to everyone. Drivers hear it for new passenger alerts
            (seat reserved, boarding request, approaching stage) on the trip screen;
            passengers hear it when their matatu gets close to their pickup or drop-off. */}
        <section className="rounded-2xl border border-border bg-surface p-6">
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
            <Volume2 className="size-5" /> Alert sound
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {heldDriverRole
              ? "This plays on your trip screen for new passenger alerts, and for you as a passenger when a matatu you're tracking gets close to your stage."
              : "This plays when a matatu you're tracking gets close to your pickup or drop-off stage."}{" "}
            Tap a sound to preview and save it. That tap also makes sure your device is ready to
            actually play it later, which browsers otherwise sometimes block.
          </p>
          <div className="mt-4 grid gap-2">
            {SOUND_PROFILES.map((profile) => {
              const selected = selectedSound === profile.id;
              return (
                <button
                  key={profile.id}
                  type="button"
                  onClick={() => chooseSound(profile.id)}
                  className={`flex items-center justify-between gap-3 rounded-lg border p-3 text-left transition ${
                    selected ? "border-primary bg-primary/10" : "border-border hover:bg-secondary"
                  }`}
                >
                  <div>
                    <div className="text-sm font-medium">{profile.label}</div>
                    <div className="text-xs text-muted-foreground">{profile.description}</div>
                  </div>
                  {selected ? (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                      <Check className="size-3.5" /> Selected
                    </span>
                  ) : (
                    <span className="shrink-0 text-xs font-medium text-muted-foreground">
                      Tap to test
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* Support */}
        <section className="rounded-2xl border border-border bg-surface p-6">
          <h2 className="font-display text-lg font-semibold">Support</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Report an app problem or something that happened on a trip.
          </p>
          <Link
            to="/complaints"
            className="mt-3 inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium transition hover:bg-secondary"
          >
            <MessageSquareWarning className="size-4" /> Support & complaints
          </Link>
          <div className="mt-4 flex gap-4 text-xs text-muted-foreground">
            <Link to="/privacy" className="underline hover:text-foreground">
              Privacy Policy
            </Link>
            <Link to="/terms" className="underline hover:text-foreground">
              Terms of Service
            </Link>
          </div>
        </section>

        {isPlatformAdmin && (
          <section className="rounded-2xl border border-border bg-surface p-6">
            <h2 className="font-display text-lg font-semibold">Platform admin</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Cross-SACCO oversight: view and suspend vehicles platform-wide.
            </p>
            <Link
              to="/platform-admin"
              className="mt-3 inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium transition hover:bg-secondary"
            >
              <ShieldAlert className="size-4" /> Open admin panel
            </Link>
          </section>
        )}

        {/* Sign out */}
        <section className="rounded-2xl border border-border bg-surface p-6">
          <button
            onClick={signOut}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium transition hover:bg-secondary"
          >
            <LogOut className="size-4" /> Sign out
          </button>
        </section>

        {/* Danger zone */}
        <section className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6">
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-destructive">
            <AlertTriangle className="size-5" /> Delete account
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            This permanently deletes your account, profile, bookings, and payment history. This
            cannot be undone.
            {(heldSaccoRole || heldDriverRole) && (
              <>
                {" "}
                Since you're registered as a{" "}
                {[heldSaccoRole && "SACCO admin", heldDriverRole && "driver"]
                  .filter(Boolean)
                  .join(" and ")}
                , this will also delete{" "}
                {heldSaccoRole ? "your SACCO and its vehicle records" : "trips you've driven"}
                {heldSaccoRole && heldDriverRole ? " and trips you've driven" : ""}. Passengers with
                bookings on those trips will lose them too.
              </>
            )}
          </p>
          <div className="mt-4 space-y-3">
            <Field label={'Type "DELETE" to confirm'}>
              <input
                value={confirmDelete}
                onChange={(e) => setConfirmDelete(e.target.value)}
                placeholder="DELETE"
                className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none ring-ring focus:ring-2"
              />
            </Field>
            <button
              onClick={deleteAccount}
              disabled={confirmDelete !== "DELETE" || deleting}
              className="rounded-lg bg-destructive px-4 py-2.5 text-sm font-medium text-destructive-foreground transition hover:opacity-90 disabled:opacity-40"
            >
              {deleting ? "Deleting…" : "Permanently delete my account"}
            </button>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function roleLabel(role: AppRole) {
  return REGISTERABLE_ROLES.find((r) => r.value === role)?.label ?? role;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}
