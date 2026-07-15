import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Bus, Receipt, Clock, Radar, BellRing, Search, Loader2, MapPin } from "lucide-react";
import passengerImg from "../assets/matu-passenger.jpg";
import driversImg from "../assets/matu-drivers.jpg";
import saccoImg from "../assets/matu-sacco.jpg";
import { InstallAppButton } from "@/components/matu/InstallAppButton";
import { AIAssistant } from "@/components/matu/AIAssistant";
import { supabase } from "@/integrations/supabase/client";
import { homePathForUser, type AppRole } from "@/lib/matu-auth";
import { findNearestStage, type NearestStageResult } from "@/lib/stage-match";

type RouteOption = {
  id: string;
  name: string;
  origin: string;
  destination: string;
  base_fare: number;
};

// A search hit backed by a geocoded building/landmark rather than a literal
// route-name match — "nearest stage" result enriched with the route it sits
// on, so the UI can say "closest to Westgate: <stage> on <route>".
type BuildingMatch = {
  stage: NearestStageResult["stage"];
  distanceKm: number;
  exactNameMatch: boolean;
  route: RouteOption;
};

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Matu: know your fare, know your matatu" },
      {
        name: "description",
        content:
          "Know your fare, know the nearest matatu, and get alerted when it's near. Built for Kenyan commuters, drivers, and SACCOs.",
      },
      { property: "og:title", content: "Matu: know your fare, know your matatu" },
      {
        property: "og:description",
        content:
          "Know your fare, know the nearest matatu, and get alerted when it's near. Built for Kenyan commuters.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const GREEN = "#0f5132";
const CREAM = "#f4f1e9";

function Logo() {
  return (
    <span
      className="inline-flex h-8 w-8 items-center justify-center rounded-full"
      style={{ backgroundColor: GREEN }}
    >
      <Bus size={18} color="#f4d03f" strokeWidth={2.2} />
    </span>
  );
}

function Feature({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex h-16 items-center justify-center" style={{ color: GREEN }}>
        {icon}
      </div>
      <p className="mt-2 text-[15px] leading-snug text-[#1a1a1a]">
        <span className="font-bold">{title}</span> {children}
      </p>
    </div>
  );
}

function RoleCard({
  image,
  title,
  points,
  ctaLabel,
  ctaRole,
}: {
  image: string;
  title: string;
  points: string[];
  ctaLabel: string;
  ctaRole: AppRole;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-[#dcd8cb] bg-[#fbf9f3]">
      <img
        src={image}
        alt={`Matu for ${title}`}
        loading="lazy"
        width={992}
        height={672}
        className="h-32 w-full object-cover md:h-48"
      />
      <div className="p-4 md:p-6">
        <h3 className="font-bold text-[#1a1a1a] md:text-xl">{title}</h3>
        <ul className="mt-3 space-y-1.5 text-[13px] leading-snug text-[#4a4a44] md:text-[15px]">
          {points.map((p) => (
            <li key={p} className="flex gap-2">
              <span style={{ color: GREEN }}>•</span>
              <span>{p}</span>
            </li>
          ))}
        </ul>
        <Link
          to="/auth"
          search={{ role: ctaRole }}
          className="mt-4 flex w-full items-center justify-center rounded-lg py-2.5 text-sm font-bold text-white"
          style={{ backgroundColor: GREEN }}
        >
          {ctaLabel}
        </Link>
      </div>
    </div>
  );
}

function Index() {
  const navigate = useNavigate();
  const [signedIn, setSignedIn] = useState(false);
  const [homePath, setHomePath] = useState("/ride"); // role-aware fallback, resolved on load
  const [routes, setRoutes] = useState<RouteOption[]>([]);
  const [query, setQuery] = useState("");
  const [buildingMatches, setBuildingMatches] = useState<BuildingMatch[]>([]);
  const [buildingSearching, setBuildingSearching] = useState(false);
  const buildingDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      setSignedIn(true);
      const home = await homePathForUser(data.user.id);
      setHomePath(home);
      // Someone who's already signed in landing on the marketing page (e.g.
      // opened the installed PWA, or bookmarked "/") wants their dashboard,
      // not the pitch — send drivers to /drive, SACCO admins to /fleet, etc.,
      // same as the post-login redirect in auth.tsx.
      navigate({ to: home, replace: true });
    });
    supabase
      .from("routes")
      .select("id,name,origin,destination,base_fare")
      .order("name")
      .then(({ data }) => {
        if (data) setRoutes(data as RouteOption[]);
      });
  }, [navigate]);

  const appPath = signedIn ? homePath : "/auth";

  // Fast, local, no-network match on route name/origin/destination — covers
  // typing an actual stage name like "Kasarani" instantly as you type.
  const routeMatches = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.trim().toLowerCase();
    return routes
      .filter(
        (r) =>
          r.origin.toLowerCase().includes(q) ||
          r.destination.toLowerCase().includes(q) ||
          r.name.toLowerCase().includes(q),
      )
      .slice(0, 6);
  }, [routes, query]);

  // Merged in alongside routeMatches: geocodes the query (Mapbox POI index —
  // covers named buildings/businesses/malls like "Westgate" that never
  // appear in a route's name) and finds the nearest real stage across every
  // route, so a building search always resolves to "board here" instead of
  // coming up empty. Debounced since it hits the network.
  useEffect(() => {
    clearTimeout(buildingDebounceRef.current);
    if (query.trim().length < 3 || routes.length === 0) {
      setBuildingMatches([]);
      return;
    }
    setBuildingSearching(true);
    buildingDebounceRef.current = setTimeout(async () => {
      const nearest = await findNearestStage(query, 4);
      const routeById = new Map(routes.map((r) => [r.id, r]));
      const enriched = nearest
        .map((n) => {
          const route = routeById.get(n.stage.route_id);
          return route ? { ...n, route } : null;
        })
        .filter((m): m is BuildingMatch => m !== null);
      setBuildingMatches(enriched);
      setBuildingSearching(false);
    }, 400);
    return () => clearTimeout(buildingDebounceRef.current);
  }, [query, routes]);

  function goToRoute(routeId: string, fromStageName?: string) {
    if (signedIn) {
      navigate({
        to: "/ride/$routeId",
        params: { routeId },
        search: { from: fromStageName, to: undefined },
      });
    } else {
      navigate({ to: "/auth" });
    }
  }

  const hasQuery = query.trim().length > 0;
  const showBuildingLoading = buildingSearching && query.trim().length >= 3;
  const noResults =
    hasQuery && !showBuildingLoading && routeMatches.length === 0 && buildingMatches.length === 0;

  return (
    <div className="min-h-screen w-full" style={{ backgroundColor: CREAM }}>
      <div className="mx-auto w-full max-w-md px-5 pb-10 pt-4 md:max-w-6xl md:px-8 md:pb-14 md:pt-6">
        {/* Header */}
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Logo />
            <span className="text-xl font-bold text-[#1a1a1a] md:text-2xl">Matu</span>
          </div>
          <div className="flex items-center gap-2 md:gap-3">
            <InstallAppButton />
            <Link
              to={appPath}
              className="rounded-full px-5 py-2 text-sm font-semibold text-white md:px-6 md:py-2.5 md:text-base"
              style={{ backgroundColor: GREEN }}
            >
              {signedIn ? "Open app" : "Sign in"}
            </Link>
          </div>
        </header>

        {/* Search — this is the app, not a pitch for it */}
        <div className="mt-5 md:mt-8">
          <h1 className="text-[26px] font-extrabold leading-tight tracking-tight text-[#1a1a1a] md:text-4xl">
            Where are you going?
          </h1>
          <div className="relative mt-3 max-w-xl md:mt-4">
            <Search
              size={18}
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#8a8a80]"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type a stage, building, or landmark, e.g. Westgate or Rongai"
              className="w-full rounded-full border border-[#dcd8cb] bg-white py-3.5 pl-11 pr-4 text-base text-[#1a1a1a] outline-none focus:border-[#0f5132]"
            />
          </div>
          {hasQuery && (
            <div className="mt-2 max-w-xl overflow-hidden rounded-xl border border-[#dcd8cb] bg-white">
              {noResults ? (
                <div className="px-4 py-3 text-sm text-[#8a8a80]">
                  {query.trim().length >= 3 ? (
                    <>
                      <p>
                        Couldn't find a route or a nearby stage for "{query}". Try a more specific
                        name (e.g. add the estate or road), or check the spelling.
                      </p>
                      <p className="mt-1">
                        You can also{" "}
                        <Link
                          to={signedIn ? homePath : "/auth"}
                          className="font-medium text-[#0f5132] underline"
                        >
                          {signedIn ? "open the app" : "sign in"}
                        </Link>{" "}
                        to pick your spot on the map instead.
                      </p>
                    </>
                  ) : (
                    <p>No route matches "{query}" yet.</p>
                  )}
                </div>
              ) : (
                <>
                  {routeMatches.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => goToRoute(r.id)}
                      className="flex w-full items-center justify-between border-b border-[#f0eee5] px-4 py-3 text-left text-sm last:border-0 hover:bg-[#fbf9f3]"
                    >
                      <span>
                        <span className="font-semibold text-[#1a1a1a]">{r.origin}</span>
                        <span className="mx-1.5 text-[#8a8a80]">to</span>
                        <span className="font-semibold text-[#1a1a1a]">{r.destination}</span>
                      </span>
                      <span className="text-[#0f5132]">KES {r.base_fare}</span>
                    </button>
                  ))}

                  {showBuildingLoading && (
                    <div className="flex items-center gap-2 px-4 py-3 text-sm text-[#8a8a80]">
                      <Loader2 className="size-4 animate-spin" />
                      Looking for the nearest stage…
                    </div>
                  )}

                  {buildingMatches.map((m) => (
                    <button
                      key={`${m.route.id}-${m.stage.id}`}
                      onClick={() => goToRoute(m.route.id, m.stage.name)}
                      className="flex w-full items-start gap-2 border-b border-[#f0eee5] px-4 py-3 text-left text-sm last:border-0 hover:bg-[#fbf9f3]"
                    >
                      <MapPin size={16} className="mt-0.5 shrink-0 text-[#0f5132]" />
                      <span className="flex-1">
                        <span className="block text-[#8a8a80]">
                          {m.exactNameMatch ? "Board at" : `Nearest stage to "${query}"`}
                        </span>
                        <span className="font-semibold text-[#1a1a1a]">{m.stage.name}</span>
                        <span className="mx-1.5 text-[#8a8a80]">·</span>
                        <span className="text-[#1a1a1a]">
                          {m.route.origin} to {m.route.destination}
                        </span>
                        {!m.exactNameMatch && (
                          <span className="ml-1.5 text-xs text-[#8a8a80]">
                            (~{m.distanceKm.toFixed(1)} km away)
                          </span>
                        )}
                      </span>
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        {/* Features */}
        <h2 className="mt-8 text-2xl font-bold text-[#1a1a1a] md:mt-12 md:text-3xl">
          What Matu Gives You
        </h2>

        <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-7 md:mt-8 md:grid-cols-4 md:gap-x-8">
          <Feature icon={<Receipt size={44} strokeWidth={1.8} />} title="Know your fare:">
            See today's price before you board.
          </Feature>
          <Feature icon={<Clock size={44} strokeWidth={1.8} />} title="Know the time to leave:">
            Plan your perfect trip to the stage.
          </Feature>
          <Feature icon={<Radar size={44} strokeWidth={1.8} />} title="Know the nearest matatu:">
            See available vehicles on the live map.
          </Feature>
          <Feature icon={<BellRing size={44} strokeWidth={1.8} />} title="Get alerted:">
            Receive a buzz when your matatu is near.
          </Feature>
        </div>

        {/* Built for everyone */}
        <h2 className="mt-10 text-[26px] font-bold leading-tight text-[#1a1a1a] md:mt-14 md:text-4xl">
          Built for everyone on the road
        </h2>
        <p className="mt-2 text-[15px] leading-snug text-[#8a8a80] md:mt-3 md:text-lg">
          Three apps in one. Pick how you ride, drive, or run your SACCO.
        </p>

        <div className="mt-5 grid grid-cols-1 gap-4 md:mt-8 md:grid-cols-3 md:gap-6">
          <RoleCard
            image={passengerImg}
            title="Passenger"
            points={[
              "Know your fare before you board",
              "See the nearest matatu on the live map",
              "Get a buzz when your ride is near",
            ]}
            ctaLabel="Become a passenger"
            ctaRole="passenger"
          />
          <RoleCard
            image={driversImg}
            title="Drivers & Conductors"
            points={[
              "Know the best time to leave the stage",
              "Set and share today's SACCO fare",
              "Reach more passengers on your route",
            ]}
            ctaLabel="Become a driver"
            ctaRole="driver"
          />
          <RoleCard
            image={saccoImg}
            title="SACCO"
            points={[
              "Track your whole fleet in real time",
              "Manage fares and routes in one place",
              "See trips, revenue, and performance",
            ]}
            ctaLabel="Become a SACCO owner"
            ctaRole="sacco_admin"
          />
        </div>

        {/* Sign up */}
        <Link
          to="/auth"
          className="mt-6 flex w-full items-center justify-center rounded-lg py-4 text-lg font-bold text-white md:mt-10 md:max-w-sm md:py-5"
          style={{ backgroundColor: GREEN }}
        >
          Sign up now
        </Link>

        {/* Footer */}
        <footer className="mt-8 border-t border-[#dcd8cb] pt-5 md:mt-14 md:flex md:items-center md:justify-between md:pt-6">
          <div className="flex items-center gap-2">
            <Logo />
            <span className="text-[15px] text-[#1a1a1a]">
              <span className="font-bold">Matu</span> · Built for Kenyan commuters
            </span>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[15px] text-[#8a8a80] md:mt-0">
            <Link to="/privacy" className="hover:text-[#1a1a1a]">
              Privacy Policy
            </Link>
            <Link to="/terms" className="hover:text-[#1a1a1a]">
              Terms of Service
            </Link>
            <span>© 2026 Matu</span>
          </div>
        </footer>
      </div>
      <AIAssistant
        context={{ page: "landing" }}
        promptMessage="Any questions about the app? Press here"
      />
    </div>
  );
}
