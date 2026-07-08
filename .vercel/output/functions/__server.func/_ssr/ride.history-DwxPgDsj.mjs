import { r as __toESM } from "../_runtime.mjs";
import { t as supabase } from "./client-BnPxBFM4.mjs";
import { n as require_react } from "../_libs/@radix-ui/react-compose-refs+[...].mjs";
import { g as Link } from "../_libs/@tanstack/react-router+[...].mjs";
import { n as require_jsx_runtime } from "../_libs/radix-ui__react-context+react.mjs";
import { a as DialogOverlay$1, i as DialogDescription$1, n as DialogClose, o as DialogPortal$1, r as DialogContent$1, s as DialogTitle$1, t as Dialog$1 } from "../_libs/@radix-ui/react-dialog+[...].mjs";
import { n as toast } from "../_libs/sonner.mjs";
import { C as CircleCheck, D as Ban, S as CircleX, d as QrCode, g as MapPin, t as X, x as Clock } from "../_libs/lucide-react.mjs";
import { t as AppShell } from "./AppShell-KOyaLbOU.mjs";
import { t as clsx } from "../_libs/clsx.mjs";
import { t as twMerge } from "../_libs/tailwind-merge.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/ride.history-DwxPgDsj.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function cn(...inputs) {
	return twMerge(clsx(inputs));
}
var Dialog = Dialog$1;
var DialogPortal = DialogPortal$1;
var DialogOverlay = import_react.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogOverlay$1, {
	ref,
	className: cn("fixed inset-0 z-50 bg-black/80  data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0", className),
	...props
}));
DialogOverlay.displayName = DialogOverlay$1.displayName;
var DialogContent = import_react.forwardRef(({ className, children, ...props }, ref) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogPortal, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogOverlay, {}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogContent$1, {
	ref,
	className: cn("fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 sm:rounded-lg", className),
	...props,
	children: [children, /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogClose, {
		className: "absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background cursor-pointer transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(X, { className: "h-4 w-4" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "sr-only",
			children: "Close"
		})]
	})]
})] }));
DialogContent.displayName = DialogContent$1.displayName;
var DialogHeader = ({ className, ...props }) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
	className: cn("flex flex-col space-y-1.5 text-center sm:text-left", className),
	...props
});
DialogHeader.displayName = "DialogHeader";
var DialogFooter = ({ className, ...props }) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
	className: cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className),
	...props
});
DialogFooter.displayName = "DialogFooter";
var DialogTitle = import_react.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogTitle$1, {
	ref,
	className: cn("text-lg font-semibold leading-none tracking-tight", className),
	...props
}));
DialogTitle.displayName = DialogTitle$1.displayName;
var DialogDescription = import_react.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogDescription$1, {
	ref,
	className: cn("text-sm text-muted-foreground", className),
	...props
}));
DialogDescription.displayName = DialogDescription$1.displayName;
var STATUS_LABEL = {
	reserved: "Reserved — pending payment",
	confirmed: "Confirmed",
	boarded: "Boarded",
	alighted: "Completed",
	cancelled: "Cancelled"
};
var UPCOMING_STATUSES = /* @__PURE__ */ new Set([
	"reserved",
	"confirmed",
	"boarded"
]);
var PAID_PAYMENT_STATUSES = /* @__PURE__ */ new Set(["held", "released"]);
function BookingHistory() {
	const [loading, setLoading] = (0, import_react.useState)(true);
	const [bookings, setBookings] = (0, import_react.useState)([]);
	const [trips, setTrips] = (0, import_react.useState)({});
	const [routes, setRoutes] = (0, import_react.useState)({});
	const [vehicles, setVehicles] = (0, import_react.useState)({});
	const [stages, setStages] = (0, import_react.useState)({});
	const [paymentByBooking, setPaymentByBooking] = (0, import_react.useState)({});
	const [cancelling, setCancelling] = (0, import_react.useState)(null);
	const [confirmingCancel, setConfirmingCancel] = (0, import_react.useState)(null);
	const [ticketBooking, setTicketBooking] = (0, import_react.useState)(null);
	async function load() {
		setLoading(true);
		const { data: u } = await supabase.auth.getUser();
		if (!u.user) {
			setLoading(false);
			return;
		}
		const { data: b } = await supabase.from("bookings").select("id,trip_id,seat_number,pickup_stage_id,dropoff_stage_id,status,fare_paid,created_at").eq("passenger_id", u.user.id).order("created_at", { ascending: false });
		const bookingRows = b ?? [];
		setBookings(bookingRows);
		const bookingIds = bookingRows.map((r) => r.id);
		if (bookingIds.length) {
			const { data: p } = await supabase.from("payments").select("id,booking_id,status").in("booking_id", bookingIds).eq("payer_id", u.user.id);
			const paymentMap = {};
			(p ?? []).forEach((x) => {
				if (x.booking_id) paymentMap[x.booking_id] = x;
			});
			setPaymentByBooking(paymentMap);
		}
		const tripIds = [...new Set(bookingRows.map((r) => r.trip_id))];
		if (tripIds.length) {
			const { data: t } = await supabase.from("trips").select("id,fare,status,route_id,vehicle_id").in("id", tripIds);
			const tripMap = {};
			(t ?? []).forEach((x) => tripMap[x.id] = x);
			setTrips(tripMap);
			const routeIds = [...new Set((t ?? []).map((x) => x.route_id))];
			const vehicleIds = [...new Set((t ?? []).map((x) => x.vehicle_id))];
			const [{ data: r }, { data: v }] = await Promise.all([routeIds.length ? supabase.from("routes").select("id,name,origin,destination").in("id", routeIds) : Promise.resolve({ data: [] }), vehicleIds.length ? supabase.from("vehicles").select("id,plate_number,nickname").in("id", vehicleIds) : Promise.resolve({ data: [] })]);
			const routeMap = {};
			(r ?? []).forEach((x) => routeMap[x.id] = x);
			setRoutes(routeMap);
			const vehicleMap = {};
			(v ?? []).forEach((x) => vehicleMap[x.id] = x);
			setVehicles(vehicleMap);
		}
		const stageIds = [...new Set(bookingRows.flatMap((r) => [r.pickup_stage_id, r.dropoff_stage_id]).filter((x) => !!x))];
		if (stageIds.length) {
			const { data: s } = await supabase.from("stages").select("id,name").in("id", stageIds);
			const stageMap = {};
			(s ?? []).forEach((x) => stageMap[x.id] = x);
			setStages(stageMap);
		}
		setLoading(false);
	}
	(0, import_react.useEffect)(() => {
		load();
	}, []);
	async function cancelBooking(bookingId) {
		setCancelling(bookingId);
		const { error } = await supabase.from("bookings").update({ status: "cancelled" }).eq("id", bookingId);
		setCancelling(null);
		setConfirmingCancel(null);
		if (error) return toast.error(error.message || "Could not cancel booking");
		toast.success("Booking cancelled");
		setBookings((prev) => prev.map((b) => b.id === bookingId ? {
			...b,
			status: "cancelled"
		} : b));
	}
	const upcoming = bookings.filter((b) => UPCOMING_STATUSES.has(b.status));
	const past = bookings.filter((b) => !UPCOMING_STATUSES.has(b.status));
	const ticketTrip = ticketBooking ? trips[ticketBooking.trip_id] : void 0;
	const ticketRoute = ticketTrip ? routes[ticketTrip.route_id] : void 0;
	const ticketVehicle = ticketTrip ? vehicles[ticketTrip.vehicle_id] : void 0;
	const ticketPickup = ticketBooking?.pickup_stage_id ? stages[ticketBooking.pickup_stage_id] : void 0;
	const ticketDropoff = ticketBooking?.dropoff_stage_id ? stages[ticketBooking.dropoff_stage_id] : void 0;
	const qrUrl = ticketBooking ? `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(`MATU-TICKET:${ticketBooking.id}`)}` : "";
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(AppShell, {
		title: "My bookings",
		subtitle: "Your upcoming and past matatu bookings.",
		tabs: [{
			to: "/ride",
			label: "Find a ride"
		}, {
			to: "/ride/history",
			label: "My bookings"
		}],
		children: [loading ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "text-sm text-muted-foreground",
			children: "Loading your bookings…"
		}) : bookings.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "rounded-2xl border border-dashed border-border p-8 text-center",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-sm text-muted-foreground",
				children: "You haven’t booked a ride yet."
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
				to: "/ride",
				className: "mt-3 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground",
				children: "Find a matatu"
			})]
		}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "grid gap-8",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h2", {
				className: "font-display text-lg font-semibold",
				children: [
					"Upcoming (",
					upcoming.length,
					")"
				]
			}), upcoming.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-2 text-sm text-muted-foreground",
				children: "No upcoming bookings."
			}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
				className: "mt-3 grid gap-3",
				children: upcoming.map((b) => {
					const trip = trips[b.trip_id];
					const route = trip ? routes[trip.route_id] : void 0;
					const vehicle = trip ? vehicles[trip.vehicle_id] : void 0;
					const pickup = b.pickup_stage_id ? stages[b.pickup_stage_id] : void 0;
					const dropoff = b.dropoff_stage_id ? stages[b.dropoff_stage_id] : void 0;
					const canCancel = b.status === "reserved" || b.status === "confirmed";
					const payment = paymentByBooking[b.id];
					const canShowTicket = !!payment && PAID_PAYMENT_STATUSES.has(payment.status) && (b.status === "confirmed" || b.status === "boarded");
					return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
						className: "rounded-2xl border border-border bg-surface p-4",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex items-start justify-between gap-3",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "min-w-0",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
										className: "font-display text-sm font-semibold",
										children: route?.name ?? "Route"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "mt-0.5 flex items-center gap-1 text-xs text-muted-foreground",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(MapPin, { className: "size-3 shrink-0" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
											className: "truncate",
											children: [
												pickup?.name ?? "—",
												" → ",
												dropoff?.name ?? "—"
											]
										})]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "mt-1 text-xs text-muted-foreground",
										children: [
											vehicle?.plate_number ?? "—",
											vehicle?.nickname ? ` · ${vehicle.nickname}` : "",
											b.seat_number ? ` · Seat ${b.seat_number}` : ""
										]
									})
								]
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "shrink-0 text-right",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "rounded-md bg-accent/30 px-2 py-1 text-xs font-semibold text-accent-foreground",
									children: ["KSh ", b.fare_paid ?? trip?.fare ?? "—"]
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "mt-1 flex items-center justify-end gap-1 text-[11px] text-muted-foreground",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Clock, { className: "size-3" }),
										" ",
										STATUS_LABEL[b.status]
									]
								})]
							})]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3",
							children: [canShowTicket && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
								onClick: () => setTicketBooking(b),
								className: "inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(QrCode, { className: "size-3" }), " View ticket"]
							}), canCancel && (confirmingCancel === b.id ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex items-center gap-2",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "text-xs text-muted-foreground",
										children: "Cancel this booking?"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
										onClick: () => cancelBooking(b.id),
										disabled: cancelling === b.id,
										className: "rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground disabled:opacity-60",
										children: cancelling === b.id ? "Cancelling…" : "Yes, cancel"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
										onClick: () => setConfirmingCancel(null),
										className: "rounded-md border border-border px-3 py-1.5 text-xs",
										children: "Keep booking"
									})
								]
							}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
								onClick: () => setConfirmingCancel(b.id),
								className: "inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:border-destructive hover:text-destructive",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Ban, { className: "size-3" }), " Cancel booking"]
							}))]
						})]
					}, b.id);
				})
			})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h2", {
				className: "font-display text-lg font-semibold",
				children: [
					"Past (",
					past.length,
					")"
				]
			}), past.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-2 text-sm text-muted-foreground",
				children: "No past bookings yet."
			}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
				className: "mt-3 grid gap-2",
				children: past.map((b) => {
					const trip = trips[b.trip_id];
					const route = trip ? routes[trip.route_id] : void 0;
					const pickup = b.pickup_stage_id ? stages[b.pickup_stage_id] : void 0;
					const dropoff = b.dropoff_stage_id ? stages[b.dropoff_stage_id] : void 0;
					return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
						className: "flex items-center justify-between gap-3 rounded-xl border border-border bg-background p-3 opacity-80",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "min-w-0",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "truncate text-sm font-medium",
								children: route?.name ?? "Route"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "truncate text-xs text-muted-foreground",
								children: [
									pickup?.name ?? "—",
									" → ",
									dropoff?.name ?? "—",
									" ·",
									" ",
									new Date(b.created_at).toLocaleDateString("en-KE", {
										day: "numeric",
										month: "short",
										year: "numeric"
									})
								]
							})]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex shrink-0 items-center gap-1 text-xs",
							children: [b.status === "cancelled" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CircleX, { className: "size-3.5 text-destructive" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CircleCheck, { className: "size-3.5 text-primary" }), STATUS_LABEL[b.status]]
						})]
					}, b.id);
				})
			})] })]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Dialog, {
			open: !!ticketBooking,
			onOpenChange: (open) => !open && setTicketBooking(null),
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogContent, {
				className: "max-w-sm",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogHeader, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogTitle, { children: "Your ticket" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogDescription, { children: "Show this to the conductor to board. It refreshes automatically — no need to screenshot it." })] }), ticketBooking && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex flex-col items-center gap-4 py-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
						src: qrUrl,
						alt: "Boarding QR ticket",
						width: 200,
						height: 200,
						className: "rounded-lg border border-border"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "w-full rounded-xl border border-border bg-surface p-3 text-center",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "font-display text-sm font-semibold",
								children: ticketRoute?.name ?? "Route"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "mt-0.5 text-xs text-muted-foreground",
								children: [
									ticketPickup?.name ?? "—",
									" → ",
									ticketDropoff?.name ?? "—"
								]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "mt-1 text-xs text-muted-foreground",
								children: [
									ticketVehicle?.plate_number ?? "—",
									ticketVehicle?.nickname ? ` · ${ticketVehicle.nickname}` : "",
									ticketBooking.seat_number ? ` · Seat ${ticketBooking.seat_number}` : ""
								]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "mt-2 text-[11px] text-muted-foreground",
								children: ["Ticket ID: ", ticketBooking.id.slice(0, 8).toUpperCase()]
							})
						]
					})]
				})]
			})
		})]
	});
}
//#endregion
export { BookingHistory as component };
