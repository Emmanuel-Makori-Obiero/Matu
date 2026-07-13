import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { MapPin, Bell, Wallet, Bus, ShieldCheck, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AIAssistant } from "@/components/matu/AIAssistant";
import { InstallAppButton } from "@/components/matu/InstallAppButton";
import { homePathForUser } from "@/lib/matu-auth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Matu — Smart matatu & bus rides across Kenya" },
      {
        name: "description",
        content:
          "Catch the right matatu, book a seat, and never miss your stage. Built for Kenyan commuters, drivers, and SACCOs.",
      },
      { property: "og:title", content: "Matu — Smart matatu rides" },
      {
        property: "og:description",
        content: "Catch the right matatu, book a seat, and never miss your stage.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  const [signedIn, setSignedIn] = useState(false);
  const [homePath, setHomePath] = useState("/ride");
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSignedIn(!!data.session);
      if (data.session) {
        homePathForUser(data.session.user.id).then(setHomePath);
      }
    });
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <IllustrationStyles />
      {/* Nav */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <Link to="/" className="flex items-center gap-2">
          <Logo />
          <span className="font-display text-2xl font-bold tracking-tight">Matu</span>
        </Link>
        <div className="flex items-center gap-2">
          <InstallAppButton />
          <Link
            to={signedIn ? homePath : "/auth"}
            className="rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90"
          >
            {signedIn ? "Open app" : "Sign in"}
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-5 pb-12 pt-6 md:pb-24 md:pt-16">
        <div className="grid items-center gap-12 md:grid-cols-2">
          <div>
            <h1 className="text-4xl font-display font-bold leading-[1.05] tracking-tight md:text-6xl">
              Never wait for
              <br />a matatu again
            </h1>
            <div className="mt-6 flex flex-wrap gap-3 md:hidden">
              <Link
                to="/auth"
                className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-base font-medium text-primary-foreground shadow-soft transition hover:shadow-lift"
              >
                Sign up now <ArrowRight className="size-4" />
              </Link>
            </div>
            <p className="mt-5 hidden max-w-md text-lg text-muted-foreground md:block">
              Track matatus in real time, reserve your seat before leaving home, pay securely, and
              receive an alert before your stop. Designed for passengers, drivers and SACCOs across
              Kenya.
            </p>
            <div className="mt-8 hidden flex-wrap gap-3 md:flex">
              <Link
                to="/auth"
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-base font-medium text-primary-foreground shadow-soft transition hover:shadow-lift"
              >
                Get started <ArrowRight className="size-4" />
              </Link>
              <a
                href="#how"
                className="inline-flex items-center rounded-lg border border-border bg-surface px-6 py-3 text-base font-medium"
              >
                How it works
              </a>
            </div>
          </div>

          {/* Matatu card illustration */}
          <div className="relative hidden md:block">
            <div className="absolute -inset-6 -z-10 rounded-3xl bg-gradient-to-br from-accent/40 via-primary/10 to-transparent blur-2xl" />
            <div className="overflow-hidden rounded-3xl border border-border bg-surface shadow-lift">
              <div className="relative h-44 bg-primary">
                <div className="absolute inset-x-0 top-1/2 h-8 -translate-y-1/2 bg-accent" />
                <div className="absolute left-6 top-4 font-display text-2xl font-bold text-primary-foreground">
                  KDA 042M
                </div>
                <div className="absolute bottom-3 right-5 rounded-md bg-surface/95 px-2 py-1 text-xs font-semibold text-foreground">
                  CBD → Rongai
                </div>
              </div>
              <div className="space-y-4 p-5">
                <Row
                  icon={<MapPin className="size-4 text-primary" />}
                  label="Next stage"
                  value="T-Mall · 3 min"
                />
                <Row
                  icon={<Wallet className="size-4 text-primary" />}
                  label="Fare today"
                  value="KSh 80"
                />
                <Row
                  icon={<Bus className="size-4 text-primary" />}
                  label="Seats"
                  value="9 of 14 left"
                />
                <button className="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground">
                  Book a seat
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* What Matu gives you */}
      <section className="mx-auto max-w-6xl px-5 pb-16">
        <h2 className="font-display text-2xl font-bold md:text-3xl">What Matu Gives You</h2>
        <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-8 md:grid-cols-4 md:gap-8">
          <GiveYou
            icon={<FareIllustration />}
            title="Know your fare"
            desc="See today's price before you board."
          />
          <GiveYou
            icon={<ClockIllustration />}
            title="Know the time to leave"
            desc="Plan your perfect trip to the stage."
          />
          <GiveYou
            icon={<RadarIllustration />}
            title="Know the nearest matatu"
            desc="See available vehicles on the live map."
          />
          <GiveYou
            icon={<AlertIllustration />}
            title="Get alerted"
            desc="Receive a buzz when your matatu is near."
          />
        </div>
      </section>

      {/* How */}
      <section id="how" className="bg-surface py-16 md:py-20">
        <div className="mx-auto max-w-6xl px-5">
          <h2 className="text-2xl font-display font-bold md:text-4xl">
            Built for everyone on the road
          </h2>
          <p className="mt-3 max-w-xl text-muted-foreground">
            Three apps in one — pick how you ride, drive, or run your SACCO.
          </p>
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            <RoleCard
              title="Passengers"
              desc="Find matatus on your route, book a seat ahead, and get notified the moment your bus is near your stage."
              points={["Live matatu map", "Seat booking", "Near-pickup & near-stop alerts"]}
              illustration={<PassengerIllustration />}
            />
            <RoleCard
              title="Drivers & Conductors"
              desc="Set your route, agree on today's fare, and let your phone broadcast your location so passengers can find you."
              points={["Adaptive fare", "Add custom stages", "Seat & alight requests"]}
              illustration={<DriverIllustration />}
              highlight
            />
            <RoleCard
              title="SACCOs"
              desc="Manage your fleet from one dashboard. Add vehicles, assign drivers, and see every trip in real time."
              points={["Fleet manager", "Driver assignments", "M-Pesa escrow (soon)"]}
            />
          </div>

          <Link
            to="/auth"
            className="mt-10 flex w-full items-center justify-center rounded-full bg-primary px-6 py-4 text-base font-semibold text-primary-foreground shadow-soft transition hover:shadow-lift"
          >
            Sign up now
          </Link>
        </div>
      </section>

      {/* Features strip */}
      <section className="mx-auto max-w-6xl px-5 py-16 md:py-20">
        <div className="grid gap-5 md:grid-cols-3">
          <Feature
            icon={<Bell />}
            title="Smart alerts"
            desc="A buzz when your matatu is 300m away. Another when your stage is next."
          />
          <Feature
            icon={<Wallet />}
            title="Adaptive fares"
            desc="Drivers and conductors agree on today's price — no surprises at the door."
          />
          <Feature
            icon={<ShieldCheck />}
            title="Safer rides"
            desc="Every trip is tied to a driver, a vehicle, and a SACCO. Receipts on every fare."
          />
        </div>
      </section>

      <footer className="border-t border-border bg-surface">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-3 px-5 py-8 text-sm text-muted-foreground md:flex-row md:items-center">
          <div className="flex items-center gap-2">
            <Logo small /> <span className="font-display font-semibold text-foreground">Matu</span>
            <span>· Built for Kenyan commuters</span>
          </div>
          <div className="flex items-center gap-4">
            <Link to="/privacy" className="hover:text-foreground">
              Privacy Policy
            </Link>
            <Link to="/terms" className="hover:text-foreground">
              Terms of Service
            </Link>
            <span>© {new Date().getFullYear()} Matu</span>
          </div>
        </div>
      </footer>
      <AIAssistant context={{ page: "landing" }} />
    </div>
  );
}

function Logo({ small = false }: { small?: boolean }) {
  const size = small ? 24 : 32;
  return (
    <span
      style={{ width: size, height: size }}
      className="relative grid place-items-center overflow-hidden rounded-lg bg-primary"
    >
      <span className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 bg-accent" />
      <Bus className="relative z-10 size-4 text-primary-foreground" />
    </span>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {icon} {label}
      </div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}

function GiveYou({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div>
      <div className="grid size-16 place-items-center">{icon}</div>
      <h3 className="mt-3 font-display text-base font-semibold leading-snug">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
    </div>
  );
}

function FareIllustration() {
  return (
    <svg viewBox="0 0 64 64" className="size-14 anim-float">
      <ellipse cx="18" cy="46" rx="13" ry="4" fill="var(--color-accent)" opacity="0.5" />
      <ellipse cx="18" cy="42" rx="13" ry="4" fill="var(--color-accent)" opacity="0.7" />
      <ellipse
        cx="18"
        cy="38"
        rx="13"
        ry="4"
        fill="var(--color-accent)"
        className="anim-coin-bounce"
      />
      <rect
        x="30"
        y="14"
        width="24"
        height="34"
        rx="3"
        fill="var(--color-surface)"
        stroke="var(--color-primary)"
        strokeWidth="2"
      />
      <line
        x1="35"
        y1="22"
        x2="49"
        y2="22"
        stroke="var(--color-primary)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <line
        x1="35"
        y1="28"
        x2="49"
        y2="28"
        stroke="var(--color-primary)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <line
        x1="35"
        y1="34"
        x2="44"
        y2="34"
        stroke="var(--color-primary)"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ClockIllustration() {
  return (
    <svg viewBox="0 0 64 64" className="size-14">
      <circle
        cx="30"
        cy="34"
        r="20"
        fill="var(--color-surface)"
        stroke="var(--color-primary)"
        strokeWidth="3"
      />
      <g className="anim-tick" style={{ transformOrigin: "30px 34px" }}>
        <line
          x1="30"
          y1="34"
          x2="30"
          y2="22"
          stroke="var(--color-primary)"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </g>
      <g className="anim-tick-slow" style={{ transformOrigin: "30px 34px" }}>
        <line
          x1="30"
          y1="34"
          x2="39"
          y2="38"
          stroke="var(--color-primary)"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </g>
      <path
        d="M42 14 A22 22 0 0 1 50 30"
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M50 30 l4 -6 l4 5"
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function RadarIllustration() {
  return (
    <svg viewBox="0 0 64 64" className="size-14">
      <circle
        cx="32"
        cy="32"
        r="26"
        fill="var(--color-primary)"
        opacity="0.12"
        className="anim-ping"
        style={{ animationDelay: "0s" }}
      />
      <circle
        cx="32"
        cy="32"
        r="19"
        fill="var(--color-primary)"
        opacity="0.22"
        className="anim-ping"
        style={{ animationDelay: "0.4s" }}
      />
      <circle
        cx="32"
        cy="32"
        r="12"
        fill="var(--color-primary)"
        opacity="0.35"
        className="anim-ping"
        style={{ animationDelay: "0.8s" }}
      />
      <circle cx="32" cy="32" r="10" fill="var(--color-primary)" />
      <rect x="26" y="28" width="12" height="7" rx="1.5" fill="var(--color-accent)" />
      <circle cx="28.5" cy="36" r="1.6" fill="var(--color-surface)" />
      <circle cx="35.5" cy="36" r="1.6" fill="var(--color-surface)" />
    </svg>
  );
}

function AlertIllustration() {
  return (
    <svg viewBox="0 0 64 64" className="size-14 anim-shake" style={{ transformOrigin: "32px 8px" }}>
      <path
        d="M14 20 A16 24 0 0 0 8 34"
        fill="none"
        stroke="var(--color-primary)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M50 20 A16 24 0 0 1 56 34"
        fill="none"
        stroke="var(--color-primary)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <rect
        x="20"
        y="12"
        width="24"
        height="40"
        rx="6"
        fill="var(--color-surface)"
        stroke="var(--color-primary)"
        strokeWidth="2.5"
      />
      <circle cx="32" cy="30" r="8" fill="var(--color-accent)" />
      <path
        d="M32 24 v8 l4 3"
        stroke="var(--color-primary)"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      <line
        x1="27"
        y1="46"
        x2="37"
        y2="46"
        stroke="var(--color-primary)"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PassengerIllustration() {
  return (
    <svg viewBox="0 0 160 120" className="h-28 w-full">
      <rect x="10" y="70" width="46" height="42" rx="6" fill="var(--color-primary)" />
      <circle cx="70" cy="52" r="14" fill="#c98a5e" className="anim-float" />
      <path d="M56 78 q14 -14 28 0 v34 h-28 z" fill="#2f6b52" />
      <rect
        x="88"
        y="72"
        width="30"
        height="22"
        rx="4"
        fill="var(--color-surface)"
        stroke="var(--color-primary)"
        strokeWidth="2"
      />
      <circle
        cx="46"
        cy="52"
        r="10"
        fill="var(--color-accent)"
        opacity="0.5"
        className="anim-pulse"
      />
    </svg>
  );
}

function DriverIllustration() {
  return (
    <svg viewBox="0 0 160 100" className="h-28 w-full">
      <rect x="6" y="10" width="148" height="60" rx="8" fill="var(--color-primary)" />
      <rect x="18" y="20" width="40" height="24" rx="3" fill="var(--color-accent)" opacity="0.85" />
      <rect x="66" y="20" width="30" height="24" rx="3" fill="var(--color-surface)" opacity="0.9" />
      <circle
        cx="126"
        cy="60"
        r="22"
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth="6"
        className="anim-spin"
        style={{ transformOrigin: "126px 60px" }}
      />
      <circle cx="126" cy="60" r="6" fill="var(--color-accent)" />
    </svg>
  );
}

function IllustrationStyles() {
  return (
    <style>{`
      @keyframes floatY { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
      @keyframes coinBounce { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-2px); } }
      @keyframes tick { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
      @keyframes tickSlow { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
      @keyframes ping { 0% { opacity: 0.35; transform: scale(0.85); } 70%,100% { opacity: 0; transform: scale(1.15); } }
      @keyframes shake { 0%,100% { transform: rotate(0deg); } 20% { transform: rotate(-8deg); } 40% { transform: rotate(7deg); } 60% { transform: rotate(-5deg); } 80% { transform: rotate(4deg); } }
      @keyframes pulseOpacity { 0%,100% { opacity: 0.35; } 50% { opacity: 0.75; } }
      @keyframes spinSlow { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
      .anim-float { animation: floatY 2.6s ease-in-out infinite; }
      .anim-coin-bounce { animation: coinBounce 1.8s ease-in-out infinite; }
      .anim-tick { animation: tick 8s linear infinite; }
      .anim-tick-slow { animation: tickSlow 20s linear infinite; }
      .anim-ping { animation: ping 2.4s ease-out infinite; }
      .anim-shake { animation: shake 2.8s ease-in-out infinite; animation-delay: 1s; }
      .anim-pulse { animation: pulseOpacity 2s ease-in-out infinite; }
      .anim-spin { animation: spinSlow 6s linear infinite; }
      @media (prefers-reduced-motion: reduce) {
        .anim-float, .anim-coin-bounce, .anim-tick, .anim-tick-slow, .anim-ping, .anim-shake, .anim-pulse, .anim-spin {
          animation: none;
        }
      }
    `}</style>
  );
}

function RoleCard({
  title,
  desc,
  points,
  highlight = false,
  illustration,
}: {
  title: string;
  desc: string;
  points: string[];
  highlight?: boolean;
  illustration?: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-2xl border p-6 transition ${highlight ? "border-primary/30 bg-primary text-primary-foreground shadow-lift" : "border-border bg-background"}`}
    >
      {illustration && (
        <div
          className={`mb-4 rounded-xl p-3 ${highlight ? "bg-primary-foreground/10" : "bg-accent/15"}`}
        >
          {illustration}
        </div>
      )}
      <h3 className="font-display text-xl font-semibold">{title}</h3>
      <p
        className={`mt-2 text-sm ${highlight ? "text-primary-foreground/80" : "text-muted-foreground"}`}
      >
        {desc}
      </p>
      <ul className="mt-4 space-y-1.5 text-sm">
        {points.map((p) => (
          <li key={p} className="flex items-center gap-2">
            <span className={`size-1.5 rounded-full ${highlight ? "bg-accent" : "bg-primary"}`} />
            {p}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Feature({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-6">
      <div className="grid size-10 place-items-center rounded-lg bg-accent/30 text-accent-foreground">
        {icon}
      </div>
      <h3 className="mt-4 font-display text-lg font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
    </div>
  );
}
