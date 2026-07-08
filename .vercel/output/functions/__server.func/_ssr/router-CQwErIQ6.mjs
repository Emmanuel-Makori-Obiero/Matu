import { r as __toESM } from "../_runtime.mjs";
import { t as supabase } from "./client-BnPxBFM4.mjs";
import { n as require_react } from "../_libs/@radix-ui/react-compose-refs+[...].mjs";
import { c as HeadContent, d as createRouter, f as Outlet, g as Link, h as createRootRouteWithContext, j as redirect, m as createFileRoute, p as lazyRouteComponent, s as Scripts, v as useRouter } from "../_libs/@tanstack/react-router+[...].mjs";
import { n as require_jsx_runtime } from "../_libs/radix-ui__react-context+react.mjs";
import { t as Toaster } from "../_libs/sonner.mjs";
import { t as Route$9 } from "./fleet._saccoId-DrAghUD1.mjs";
import { t as Route$10 } from "./ride._routeId-D8qUuMnl.mjs";
import { t as QueryClient } from "../_libs/tanstack__query-core.mjs";
import { t as QueryClientProvider } from "../_libs/tanstack__react-query.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/router-CQwErIQ6.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var styles_default = "/assets/styles-DeeySw9_.css";
var Toaster$1 = ({ ...props }) => {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Toaster, {
		className: "toaster group",
		toastOptions: { classNames: {
			toast: "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
			description: "group-[.toast]:text-muted-foreground",
			actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
			cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground"
		} },
		...props
	});
};
function NotFoundComponent() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "flex min-h-screen items-center justify-center bg-background px-4",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "max-w-md text-center",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
					className: "text-7xl font-display font-bold text-primary",
					children: "404"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
					className: "mt-4 text-xl font-display font-semibold",
					children: "Stage not found"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-2 text-sm text-muted-foreground",
					children: "This route hasn’t been added yet. Catch the next matatu home."
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "mt-6",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
						to: "/",
						className: "inline-flex items-center justify-center rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition hover:opacity-90",
						children: "Back home"
					})
				})
			]
		})
	});
}
function ErrorComponent({ error, reset }) {
	console.error(error);
	const router = useRouter();
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "flex min-h-screen items-center justify-center bg-background px-4",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "max-w-md text-center",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
					className: "text-xl font-display font-semibold",
					children: "Something went off-route"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-2 text-sm text-muted-foreground",
					children: "We hit a pothole. Try again or head home."
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-6 flex flex-wrap justify-center gap-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						onClick: () => {
							router.invalidate();
							reset();
						},
						className: "inline-flex items-center justify-center rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground",
						children: "Try again"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
						href: "/",
						className: "inline-flex items-center justify-center rounded-lg border border-border bg-surface px-5 py-2.5 text-sm font-medium",
						children: "Go home"
					})]
				})
			]
		})
	});
}
var Route$8 = createRootRouteWithContext()({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1, viewport-fit=cover"
			},
			{
				name: "theme-color",
				content: "#1f4a3a"
			},
			{ title: "Matu — Smart matatu & bus rides across Kenya" },
			{
				name: "description",
				content: "Find matatus and buses on your route, see live arrivals, book a seat, and get alerts as your stage approaches."
			},
			{
				property: "og:title",
				content: "Matu — Smart matatu & bus rides across Kenya"
			},
			{
				property: "og:description",
				content: "Find matatus and buses on your route, see live arrivals, book a seat, and get alerts as your stage approaches."
			},
			{
				property: "og:type",
				content: "website"
			},
			{
				name: "twitter:card",
				content: "summary"
			},
			{
				name: "twitter:title",
				content: "Matu — Smart matatu & bus rides across Kenya"
			},
			{
				name: "twitter:description",
				content: "Find matatus and buses on your route, see live arrivals, book a seat, and get alerts as your stage approaches."
			},
			{
				property: "og:image",
				content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/89f7705c-017f-440d-be35-128d96c0c385/id-preview-eaa5de05--f4c18098-ca98-49e9-bd12-5c36a3374c76.lovable.app-1782891678310.png"
			},
			{
				name: "twitter:image",
				content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/89f7705c-017f-440d-be35-128d96c0c385/id-preview-eaa5de05--f4c18098-ca98-49e9-bd12-5c36a3374c76.lovable.app-1782891678310.png"
			}
		],
		links: [{
			rel: "stylesheet",
			href: styles_default
		}]
	}),
	shellComponent: RootShell,
	component: RootComponent,
	notFoundComponent: NotFoundComponent,
	errorComponent: ErrorComponent
});
function RootShell({ children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("html", {
		lang: "en",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("head", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("meta", {
			name: "google-site-verification",
			content: "ACb3I6z-tGggIBYWUW_D1LM8Y2qgoya-R0HjvuPjcqM"
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(HeadContent, {})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("body", { children: [children, /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Scripts, {})] })]
	});
}
function RootComponent() {
	const { queryClient } = Route$8.useRouteContext();
	const router = useRouter();
	(0, import_react.useEffect)(() => {
		const { data: sub } = supabase.auth.onAuthStateChange((event) => {
			if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
			router.invalidate();
			if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
		});
		return () => sub.subscription.unsubscribe();
	}, [router, queryClient]);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(QueryClientProvider, {
		client: queryClient,
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Outlet, {}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Toaster$1, {
			richColors: true,
			position: "top-center"
		})]
	});
}
var $$splitComponentImporter$7 = () => import("./auth-Dl0riGiQ.mjs");
var Route$7 = createFileRoute("/auth")({
	head: () => ({ meta: [{ title: "Sign in · Matu" }, {
		name: "description",
		content: "Sign in or join Matu as a passenger, driver, or SACCO."
	}] }),
	component: lazyRouteComponent($$splitComponentImporter$7, "component")
});
var $$splitComponentImporter$6 = () => import("./route-Di7iQBCH.mjs");
var Route$6 = createFileRoute("/_authenticated")({
	ssr: false,
	beforeLoad: async () => {
		const { data, error } = await supabase.auth.getUser();
		if (error || !data.user) throw redirect({ to: "/auth" });
		return { user: data.user };
	},
	component: lazyRouteComponent($$splitComponentImporter$6, "component")
});
var $$splitComponentImporter$5 = () => import("./routes-BCqNQwIF.mjs");
var Route$5 = createFileRoute("/")({
	head: () => ({ meta: [
		{ title: "Matu — Smart matatu & bus rides across Kenya" },
		{
			name: "description",
			content: "Catch the right matatu, book a seat, and never miss your stage. Built for Kenyan commuters, drivers, and SACCOs."
		},
		{
			property: "og:title",
			content: "Matu — Smart matatu rides"
		},
		{
			property: "og:description",
			content: "Catch the right matatu, book a seat, and never miss your stage."
		}
	] }),
	component: lazyRouteComponent($$splitComponentImporter$5, "component")
});
var $$splitComponentImporter$4 = () => import("./ride.index-CEkljzDo.mjs");
var Route$4 = createFileRoute("/_authenticated/ride/")({ component: lazyRouteComponent($$splitComponentImporter$4, "component") });
var $$splitComponentImporter$3 = () => import("./fleet.index-DtydX5_V.mjs");
var Route$3 = createFileRoute("/_authenticated/fleet/")({ component: lazyRouteComponent($$splitComponentImporter$3, "component") });
var $$splitComponentImporter$2 = () => import("./drive.index-DtDUECT8.mjs");
var Route$2 = createFileRoute("/_authenticated/drive/")({ component: lazyRouteComponent($$splitComponentImporter$2, "component") });
var $$splitComponentImporter$1 = () => import("./ride.history-DwxPgDsj.mjs");
var Route$1 = createFileRoute("/_authenticated/ride/history")({ component: lazyRouteComponent($$splitComponentImporter$1, "component") });
var $$splitComponentImporter = () => import("./drive.trip-qoJN7Apr.mjs");
var Route = createFileRoute("/_authenticated/drive/trip")({ component: lazyRouteComponent($$splitComponentImporter, "component") });
var AuthRoute = Route$7.update({
	id: "/auth",
	path: "/auth",
	getParentRoute: () => Route$8
});
var AuthenticatedRouteRoute = Route$6.update({
	id: "/_authenticated",
	getParentRoute: () => Route$8
});
var IndexRoute = Route$5.update({
	id: "/",
	path: "/",
	getParentRoute: () => Route$8
});
var AuthenticatedRideIndexRoute = Route$4.update({
	id: "/ride/",
	path: "/ride/",
	getParentRoute: () => AuthenticatedRouteRoute
});
var AuthenticatedFleetIndexRoute = Route$3.update({
	id: "/fleet/",
	path: "/fleet/",
	getParentRoute: () => AuthenticatedRouteRoute
});
var AuthenticatedDriveIndexRoute = Route$2.update({
	id: "/drive/",
	path: "/drive/",
	getParentRoute: () => AuthenticatedRouteRoute
});
var AuthenticatedRideHistoryRoute = Route$1.update({
	id: "/ride/history",
	path: "/ride/history",
	getParentRoute: () => AuthenticatedRouteRoute
});
var AuthenticatedRideRouteIdRoute = Route$10.update({
	id: "/ride/$routeId",
	path: "/ride/$routeId",
	getParentRoute: () => AuthenticatedRouteRoute
});
var AuthenticatedFleetSaccoIdRoute = Route$9.update({
	id: "/fleet/$saccoId",
	path: "/fleet/$saccoId",
	getParentRoute: () => AuthenticatedRouteRoute
});
var AuthenticatedRouteRouteChildren = {
	AuthenticatedDriveTripRoute: Route.update({
		id: "/drive/trip",
		path: "/drive/trip",
		getParentRoute: () => AuthenticatedRouteRoute
	}),
	AuthenticatedFleetSaccoIdRoute,
	AuthenticatedRideRouteIdRoute,
	AuthenticatedRideHistoryRoute,
	AuthenticatedDriveIndexRoute,
	AuthenticatedFleetIndexRoute,
	AuthenticatedRideIndexRoute
};
var rootRouteChildren = {
	IndexRoute,
	AuthenticatedRouteRoute: AuthenticatedRouteRoute._addFileChildren(AuthenticatedRouteRouteChildren),
	AuthRoute
};
var routeTree = Route$8._addFileChildren(rootRouteChildren)._addFileTypes();
var getRouter = () => {
	return createRouter({
		routeTree,
		context: { queryClient: new QueryClient() },
		scrollRestoration: true,
		defaultPreloadStaleTime: 0
	});
};
//#endregion
export { getRouter };
