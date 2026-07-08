import { r as __toESM } from "../_runtime.mjs";
import { t as supabase } from "./client-BnPxBFM4.mjs";
import { n as require_react } from "../_libs/@radix-ui/react-compose-refs+[...].mjs";
import { _ as useNavigate, g as Link, l as useRouterState } from "../_libs/@tanstack/react-router+[...].mjs";
import { n as require_jsx_runtime } from "../_libs/radix-ui__react-context+react.mjs";
import { n as toast } from "../_libs/sonner.mjs";
import { T as Building2, _ as LogOut, i as User, w as Bus } from "../_libs/lucide-react.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/AppShell-KOyaLbOU.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var NAV = [
	{
		to: "/ride",
		label: "Ride",
		icon: User,
		role: "passenger"
	},
	{
		to: "/drive",
		label: "Drive",
		icon: Bus,
		role: "driver"
	},
	{
		to: "/fleet",
		label: "SACCO",
		icon: Building2,
		role: "sacco_admin"
	}
];
function AppShell({ title, subtitle, accent = "primary", tabs, children }) {
	const navigate = useNavigate();
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const [myRoles, setMyRoles] = (0, import_react.useState)([]);
	(0, import_react.useEffect)(() => {
		supabase.auth.getUser().then(async ({ data }) => {
			if (!data.user) return;
			const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id);
			setMyRoles((roles ?? []).map((r) => r.role));
		});
	}, []);
	async function signOut() {
		await supabase.auth.signOut();
		toast.success("Signed out");
		navigate({
			to: "/auth",
			replace: true
		});
	}
	const visibleNav = NAV.filter((n) => n.role === "passenger" || myRoles.includes(n.role));
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "min-h-screen bg-background",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
			className: `border-b border-border ${accent === "accent" ? "bg-accent text-accent-foreground" : "bg-primary text-primary-foreground"}`,
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mx-auto flex max-w-6xl items-center justify-between px-5 py-4",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
					to: "/",
					className: "flex items-center gap-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
						className: "relative grid size-8 place-items-center overflow-hidden rounded-lg bg-surface/15",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 bg-accent" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Bus, { className: "relative z-10 size-4" })]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "font-display text-xl font-bold",
						children: "Matu"
					})]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-center gap-1",
					children: [
						visibleNav.map((n) => {
							const active = pathname.startsWith(n.to);
							return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
								to: n.to,
								className: `hidden sm:inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition ${active ? "bg-surface text-foreground" : "bg-surface/15 hover:bg-surface/25"}`,
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(n.icon, { className: "size-4" }),
									" ",
									n.label
								]
							}, n.to);
						}),
						!myRoles.includes("driver") && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
							to: "/drive",
							className: "hidden sm:inline-flex items-center gap-1.5 rounded-md bg-surface/15 px-3 py-1.5 text-sm font-medium hover:bg-surface/25",
							children: "Become a driver"
						}),
						!myRoles.includes("sacco_admin") && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
							to: "/fleet",
							className: "hidden sm:inline-flex items-center gap-1.5 rounded-md bg-surface/15 px-3 py-1.5 text-sm font-medium hover:bg-surface/25",
							children: "Register a SACCO"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
							onClick: signOut,
							className: "ml-1 inline-flex items-center gap-1.5 rounded-md bg-surface/15 px-3 py-1.5 text-sm font-medium hover:bg-surface/25",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(LogOut, { className: "size-4" }),
								" ",
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "hidden sm:inline",
									children: "Sign out"
								})
							]
						})
					]
				})]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mx-auto max-w-6xl px-5 pb-6 pt-2",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "mb-3 flex gap-1 sm:hidden",
						children: visibleNav.map((n) => {
							const active = pathname.startsWith(n.to);
							return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
								to: n.to,
								className: `flex-1 rounded-md px-2 py-1.5 text-center text-xs font-medium transition ${active ? "bg-surface text-foreground" : "bg-surface/15"}`,
								children: n.label
							}, n.to);
						})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
						className: "font-display text-3xl font-bold tracking-tight",
						children: title
					}),
					subtitle && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-1 text-sm opacity-80",
						children: subtitle
					}),
					tabs && tabs.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("nav", {
						className: "mt-5 flex gap-1 overflow-x-auto",
						children: tabs.map((t) => {
							const active = pathname === t.to || pathname.startsWith(t.to + "/");
							return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
								to: t.to,
								className: `whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition ${active ? "bg-surface text-foreground" : "text-current opacity-80 hover:opacity-100"}`,
								children: t.label
							}, t.to);
						})
					})
				]
			})]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("main", {
			className: "mx-auto max-w-6xl px-5 py-8",
			children
		})]
	});
}
//#endregion
export { AppShell as t };
