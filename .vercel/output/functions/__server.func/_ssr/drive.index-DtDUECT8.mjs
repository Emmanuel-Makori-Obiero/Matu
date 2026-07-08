import { g as Link } from "../_libs/@tanstack/react-router+[...].mjs";
import { n as require_jsx_runtime } from "../_libs/radix-ui__react-context+react.mjs";
import { g as MapPin, n as Wallet, p as Play, r as Users } from "../_libs/lucide-react.mjs";
import { t as AppShell } from "./AppShell-KOyaLbOU.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/drive.index-DtDUECT8.js
var import_jsx_runtime = require_jsx_runtime();
function DriverHome() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AppShell, {
		title: "Driver dashboard",
		subtitle: "Start your shift, set today's fare, and broadcast your location to passengers.",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "grid gap-5",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "rounded-2xl border border-dashed border-border bg-surface p-6 text-sm text-muted-foreground",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", {
						className: "text-foreground",
						children: "Coming next:"
					}), " start a trip, broadcast GPS, set adaptive fares, add stages on the fly, and manage seat bookings & alight requests."]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "grid gap-4 md:grid-cols-3",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
							to: "/drive/trip",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Tile, {
								icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Play, { className: "size-5" }),
								title: "Start trip",
								desc: "Pick your vehicle & route, set fare, hit go."
							})
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
							to: "/drive/trip",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Tile, {
								icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Wallet, { className: "size-5" }),
								title: "Today's fare",
								desc: "Agree with the conductor — adaptive pricing."
							})
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
							to: "/drive/trip",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Tile, {
								icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(MapPin, { className: "size-5" }),
								title: "Add a stage",
								desc: "Tap the map to mark a new stage on your route."
							})
						})
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "rounded-2xl border border-border bg-surface p-6",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
							className: "font-display text-xl font-semibold",
							children: "Live passengers"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-1 text-sm text-muted-foreground",
							children: "Once you start a trip, bookings, seat occupancy, and alight requests appear here in real time."
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "mt-4 flex items-center gap-2 text-sm text-muted-foreground",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Users, { className: "size-4" }), " No active trip yet"]
						})
					]
				})
			]
		})
	});
}
function Tile({ icon, title, desc }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
		className: "rounded-xl border border-border bg-surface p-5 text-left transition hover:shadow-soft",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "grid size-10 place-items-center rounded-lg bg-primary text-primary-foreground",
				children: icon
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mt-3 font-display text-lg font-semibold",
				children: title
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mt-1 text-sm text-muted-foreground",
				children: desc
			})
		]
	});
}
//#endregion
export { DriverHome as component };
