import { r as __toESM } from "../_runtime.mjs";
import { t as supabase } from "./client-BnPxBFM4.mjs";
import { n as require_react } from "../_libs/@radix-ui/react-compose-refs+[...].mjs";
import { g as Link } from "../_libs/@tanstack/react-router+[...].mjs";
import { n as require_jsx_runtime } from "../_libs/radix-ui__react-context+react.mjs";
import { n as toast } from "../_libs/sonner.mjs";
import { A as ArrowLeft, E as Bell, g as MapPin, r as Users } from "../_libs/lucide-react.mjs";
import { t as AppShell } from "./AppShell-KOyaLbOU.mjs";
import { t as RouteMap } from "./RouteMap-DHsYh7qQ.mjs";
import { t as Route } from "./ride._routeId-D8qUuMnl.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/ride._routeId-DxZIkgmk.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function RouteDetail() {
	const { routeId } = Route.useParams();
	const [routeInfo, setRouteInfo] = (0, import_react.useState)(null);
	const [stages, setStages] = (0, import_react.useState)([]);
	const [trips, setTrips] = (0, import_react.useState)([]);
	const [vehicles, setVehicles] = (0, import_react.useState)({});
	const [tripLocs, setTripLocs] = (0, import_react.useState)({});
	const [selectedTrip, setSelectedTrip] = (0, import_react.useState)(null);
	const [takenSeats, setTakenSeats] = (0, import_react.useState)({});
	const [selectedSeat, setSelectedSeat] = (0, import_react.useState)(null);
	const [bookedBookingId, setBookedBookingId] = (0, import_react.useState)(null);
	const [bookedTripId, setBookedTripId] = (0, import_react.useState)(null);
	const [payPhone, setPayPhone] = (0, import_react.useState)("");
	const [payingBookingId, setPayingBookingId] = (0, import_react.useState)(null);
	const [paymentStatus, setPaymentStatus] = (0, import_react.useState)({});
	const [myBookings, setMyBookings] = (0, import_react.useState)([]);
	const notifiedRef = (0, import_react.useRef)(/* @__PURE__ */ new Set());
	const [pickup, setPickup] = (0, import_react.useState)("");
	const [dropoff, setDropoff] = (0, import_react.useState)("");
	(0, import_react.useEffect)(() => {
		(async () => {
			const [{ data: r }, { data: s }] = await Promise.all([supabase.from("routes").select("name,origin,destination").eq("id", routeId).maybeSingle(), supabase.from("stages").select("id,name,lat,lng,order_index").eq("route_id", routeId).order("order_index")]);
			if (r) setRouteInfo(r);
			setStages(s ?? []);
		})();
	}, [routeId]);
	async function loadTrips() {
		const { data } = await supabase.from("trips").select("id,fare,status,vehicle_id").eq("route_id", routeId).in("status", ["boarding", "in_transit"]);
		const t = data ?? [];
		setTrips(t);
		const ids = [...new Set(t.map((x) => x.vehicle_id))];
		if (ids.length) {
			const { data: v } = await supabase.from("vehicles").select("id,plate_number,capacity,nickname").in("id", ids);
			const map = {};
			(v ?? []).forEach((x) => map[x.id] = x);
			setVehicles(map);
		}
	}
	(0, import_react.useEffect)(() => {
		loadTrips();
		const ch = supabase.channel(`trips-route-${routeId}`).on("postgres_changes", {
			event: "*",
			schema: "public",
			table: "trips",
			filter: `route_id=eq.${routeId}`
		}, () => loadTrips()).subscribe();
		return () => {
			supabase.removeChannel(ch);
		};
	}, [routeId]);
	(0, import_react.useEffect)(() => {
		if (trips.length === 0) return;
		let cancelled = false;
		const fetchAll = async () => {
			const entries = await Promise.all(trips.map(async (t) => {
				const { data } = await supabase.rpc("get_trip_location", { _trip_id: t.id });
				const row = Array.isArray(data) ? data[0] : null;
				if (row?.current_lat != null && row?.current_lng != null) return [t.id, {
					lat: row.current_lat,
					lng: row.current_lng,
					heading: row.current_heading ?? null
				}];
				return null;
			}));
			if (cancelled) return;
			const next = {};
			entries.forEach((e) => {
				if (e) next[e[0]] = e[1];
			});
			setTripLocs(next);
		};
		fetchAll();
		const iv = setInterval(fetchAll, 5e3);
		return () => {
			cancelled = true;
			clearInterval(iv);
		};
	}, [trips]);
	(0, import_react.useEffect)(() => {
		if (trips.length === 0) {
			setMyBookings([]);
			return;
		}
		(async () => {
			const { data: u } = await supabase.auth.getUser();
			if (!u.user) return;
			const { data } = await supabase.from("bookings").select("trip_id,pickup_stage_id,dropoff_stage_id,status").eq("passenger_id", u.user.id).in("trip_id", trips.map((t) => t.id)).in("status", ["reserved", "boarded"]);
			setMyBookings(data ?? []);
		})();
	}, [trips]);
	(0, import_react.useEffect)(() => {
		if (!bookedBookingId) return;
		const ch = supabase.channel(`payment-${bookedBookingId}`).on("postgres_changes", {
			event: "UPDATE",
			schema: "public",
			table: "payments",
			filter: `booking_id=eq.${bookedBookingId}`
		}, (payload) => {
			const status = payload.new.status;
			setPaymentStatus((prev) => ({
				...prev,
				[bookedBookingId]: status
			}));
			setPayingBookingId(null);
			if (status === "held") toast.success("Payment confirmed! Seat secured.");
			if (status === "failed") toast.error("Payment failed. Try again.");
		}).subscribe();
		return () => {
			supabase.removeChannel(ch);
		};
	}, [bookedBookingId]);
	(0, import_react.useEffect)(() => {
		if (myBookings.length === 0) return;
		if (typeof Notification === "undefined") return;
		if (Notification.permission === "default") Notification.requestPermission();
		const notified = notifiedRef.current;
		const R = 6371e3;
		const dist = (a, b) => {
			const toRad = (x) => x * Math.PI / 180;
			const dLat = toRad(b.lat - a.lat);
			const dLng = toRad(b.lng - a.lng);
			const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
			return 2 * R * Math.asin(Math.sqrt(s));
		};
		myBookings.forEach((b) => {
			const loc = tripLocs[b.trip_id];
			if (!loc) return;
			const check = (stageId, kind) => {
				if (!stageId) return;
				const stage = stages.find((s) => s.id === stageId);
				if (!stage) return;
				const key = `${b.trip_id}:${kind}`;
				if (notified.has(key)) return;
				if (dist(loc, stage) < 300) {
					notified.add(key);
					const title = kind === "pickup" ? "Matatu near your pickup" : "Approaching your stop";
					const body = kind === "pickup" ? `Bus is <300m from ${stage.name}` : `Get ready to alight at ${stage.name}`;
					toast.info(title, { description: body });
					if (Notification.permission === "granted") new Notification(title, { body });
				}
			};
			check(b.pickup_stage_id, "pickup");
			check(b.dropoff_stage_id, "dropoff");
		});
	}, [
		tripLocs,
		myBookings,
		stages
	]);
	const mapStages = stages;
	const mapVehicles = (0, import_react.useMemo)(() => trips.filter((t) => tripLocs[t.id]).map((t) => ({
		id: t.id,
		lat: tripLocs[t.id].lat,
		lng: tripLocs[t.id].lng,
		heading: tripLocs[t.id].heading,
		label: vehicles[t.vehicle_id]?.plate_number ?? "Matatu"
	})), [
		trips,
		vehicles,
		tripLocs
	]);
	async function openSeatPicker(tripId) {
		setSelectedTrip(tripId);
		setSelectedSeat(null);
		const { data } = await supabase.rpc("get_trip_taken_seats", { _trip_id: tripId });
		const seats = (data ?? []).map((r) => r.seat_number).filter((n) => n != null);
		setTakenSeats((prev) => ({
			...prev,
			[tripId]: seats
		}));
	}
	async function bookSeat(tripId) {
		const { data: u } = await supabase.auth.getUser();
		if (!u.user) return;
		const trip = trips.find((t) => t.id === tripId);
		if (!trip) return;
		if (!selectedSeat) return toast.error("Pick a seat");
		if (!pickup || !dropoff) return toast.error("Pick your pickup and drop-off stages");
		const { data: newBooking, error } = await supabase.from("bookings").insert({
			trip_id: tripId,
			passenger_id: u.user.id,
			seat_number: selectedSeat,
			pickup_stage_id: pickup,
			dropoff_stage_id: dropoff,
			fare_paid: trip.fare,
			status: "reserved"
		}).select("id").single();
		if (error || !newBooking) return toast.error(error?.message ?? "Could not reserve seat");
		toast.success(`Seat ${selectedSeat} reserved — pay to confirm it.`);
		setBookedBookingId(newBooking.id);
		setBookedTripId(tripId);
		setSelectedSeat(null);
	}
	async function payForBooking(tripId) {
		if (!bookedBookingId) return;
		if (!payPhone.trim()) return toast.error("Enter your M-Pesa phone number");
		const trip = trips.find((t) => t.id === tripId);
		if (!trip) return;
		setPayingBookingId(bookedBookingId);
		const { error } = await supabase.functions.invoke("mpesa-stk-push", { body: {
			bookingId: bookedBookingId,
			phone: payPhone.trim(),
			amount: trip.fare
		} });
		if (error) {
			toast.error("Could not start payment. Try again.");
			setPayingBookingId(null);
			return;
		}
		toast.success("Check your phone and enter your M-Pesa PIN");
		setPaymentStatus((prev) => ({
			...prev,
			[bookedBookingId]: "pending"
		}));
		setTimeout(() => {
			setPaymentStatus((prev) => {
				if (prev[bookedBookingId] !== "pending") return prev;
				toast.error("Payment not received. If you weren't prompted, check the number and try again.");
				return {
					...prev,
					[bookedBookingId]: "failed"
				};
			});
		}, 6e4);
	}
	async function sendAlert(tripId, type) {
		const { data: u } = await supabase.auth.getUser();
		if (!u.user) return;
		const { error } = await supabase.from("alerts").insert({
			trip_id: tripId,
			passenger_id: u.user.id,
			type,
			message: type === "alight_request" ? "Passenger wants to alight" : "Passenger waiting at pickup"
		});
		if (error) return toast.error(error.message);
		toast.success("Driver notified");
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(AppShell, {
		title: routeInfo?.name ?? "Route",
		subtitle: routeInfo ? `${routeInfo.origin} → ${routeInfo.destination}` : "",
		tabs: [{
			to: "/ride",
			label: "Find a ride"
		}, {
			to: "/ride/history",
			label: "My bookings"
		}],
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "mb-4",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
				to: "/ride",
				className: "inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ArrowLeft, { className: "size-4" }), " All routes"]
			})
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "grid gap-5 lg:grid-cols-[1fr_360px]",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(RouteMap, {
				stages: mapStages,
				vehicles: mapVehicles
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "grid gap-4",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
					className: "rounded-2xl border border-border bg-surface p-5",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h2", {
						className: "font-display text-lg font-semibold",
						children: [
							"Live matatus (",
							trips.length,
							")"
						]
					}), trips.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-2 text-sm text-muted-foreground",
						children: "No matatus on this route right now."
					}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
						className: "mt-3 grid gap-2",
						children: trips.map((t) => {
							const v = vehicles[t.vehicle_id];
							return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
								className: "rounded-xl border border-border bg-background p-3",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "flex items-center justify-between",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
											className: "font-semibold",
											children: v?.plate_number ?? "—"
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "text-xs text-muted-foreground",
											children: [
												v?.nickname ?? "",
												" · ",
												t.status
											]
										})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "rounded-md bg-accent/40 px-2 py-1 text-xs font-semibold",
											children: ["KSh ", t.fare]
										})]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "mt-3 flex flex-wrap gap-2",
										children: [
											/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
												onClick: () => openSeatPicker(t.id),
												className: "rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground",
												children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Users, { className: "mr-1 inline size-3" }), " Book seat"]
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
												onClick: () => sendAlert(t.id, "near_pickup"),
												className: "rounded-md border border-border px-3 py-1.5 text-xs",
												children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Bell, { className: "mr-1 inline size-3" }), " I'm at pickup"]
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
												onClick: () => sendAlert(t.id, "alight_request"),
												className: "rounded-md border border-border px-3 py-1.5 text-xs",
												children: "Alight next stage"
											})
										]
									}),
									selectedTrip === t.id && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "mt-3 grid gap-3 border-t border-border pt-3",
										children: [
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)(StageSelect, {
												stages,
												value: pickup,
												onChange: setPickup,
												label: "Pickup"
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)(StageSelect, {
												stages,
												value: dropoff,
												onChange: setDropoff,
												label: "Drop-off"
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SeatPicker, {
												capacity: v?.capacity ?? 14,
												taken: takenSeats[t.id] ?? [],
												selected: selectedSeat,
												onSelect: setSelectedSeat
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
												className: "flex gap-2",
												children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
													onClick: () => bookSeat(t.id),
													className: "flex-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-60",
													disabled: !selectedSeat || !pickup || !dropoff,
													children: ["Confirm seat ", selectedSeat ?? ""]
												}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
													onClick: () => {
														setSelectedTrip(null);
														setSelectedSeat(null);
													},
													className: "rounded-md border border-border px-3 py-1.5 text-xs",
													children: "Cancel"
												})]
											})
										]
									}),
									bookedTripId === t.id && bookedBookingId && paymentStatus[bookedBookingId] !== "held" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "mt-3 grid gap-2 border-t border-border pt-3",
										children: [
											/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
												className: "text-xs font-medium",
												children: [
													"Pay KSh ",
													t.fare,
													" with M-Pesa"
												]
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
												type: "tel",
												placeholder: "07XX XXX XXX",
												value: payPhone,
												onChange: (e) => setPayPhone(e.target.value),
												className: "w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
												onClick: () => payForBooking(t.id),
												disabled: payingBookingId === bookedBookingId,
												className: "rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-60",
												children: payingBookingId === bookedBookingId ? "Check your phone…" : paymentStatus[bookedBookingId] === "failed" ? "Try payment again" : "Pay Now"
											})
										]
									})
								]
							}, t.id);
						})
					})]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
					className: "rounded-2xl border border-border bg-surface p-5",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h2", {
						className: "font-display text-lg font-semibold",
						children: [
							"Stages (",
							stages.length,
							")"
						]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ol", {
						className: "mt-3 grid gap-1 text-sm",
						children: stages.map((s) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
							className: "flex items-center gap-2",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(MapPin, { className: "size-3 text-primary" }),
								" ",
								s.name
							]
						}, s.id))
					})]
				})]
			})]
		})]
	});
}
function StageSelect({ stages, value, onChange, label }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
		className: "text-xs",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "mb-1 block font-medium",
			children: label
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
			value,
			onChange: (e) => onChange(e.target.value),
			className: "w-full rounded-md border border-input bg-background px-2 py-1.5",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
				value: "",
				children: "— select stage —"
			}), stages.map((s) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
				value: s.id,
				children: s.name
			}, s.id))]
		})]
	});
}
function SeatPicker({ capacity, taken, selected, onSelect }) {
	const seats = Array.from({ length: capacity }, (_, i) => i + 1);
	const takenSet = new Set(taken);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "grid gap-2",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-center justify-between text-xs",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "font-medium",
					children: "Pick a seat"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
					className: "text-muted-foreground",
					children: [
						capacity - taken.length,
						" of ",
						capacity,
						" free"
					]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "grid grid-cols-4 gap-1.5 sm:grid-cols-5",
				children: seats.map((n) => {
					const isTaken = takenSet.has(n);
					return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						disabled: isTaken,
						onClick: () => onSelect(n),
						className: `aspect-square rounded-md border text-xs font-medium transition ${isTaken ? "cursor-not-allowed border-border bg-muted text-muted-foreground line-through" : selected === n ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:border-primary"}`,
						"aria-label": `Seat ${n}${isTaken ? " (taken)" : ""}`,
						children: n
					}, n);
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-center gap-3 text-[10px] text-muted-foreground",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
						className: "inline-flex items-center gap-1",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "size-2 rounded-sm border border-border bg-background" }), " Free"]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
						className: "inline-flex items-center gap-1",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "size-2 rounded-sm bg-primary" }), " You"]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
						className: "inline-flex items-center gap-1",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "size-2 rounded-sm bg-muted" }), " Taken"]
					})
				]
			})
		]
	});
}
//#endregion
export { RouteDetail as component };
