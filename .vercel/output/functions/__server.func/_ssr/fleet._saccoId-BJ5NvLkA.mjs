import { r as __toESM } from "../_runtime.mjs";
import { t as supabase } from "./client-BnPxBFM4.mjs";
import { n as require_react } from "../_libs/@radix-ui/react-compose-refs+[...].mjs";
import { g as Link } from "../_libs/@tanstack/react-router+[...].mjs";
import { n as require_jsx_runtime } from "../_libs/radix-ui__react-context+react.mjs";
import { n as toast } from "../_libs/sonner.mjs";
import { A as ArrowLeft, a as UserPlus, f as Plus, h as Map, n as Wallet, u as Radio, w as Bus } from "../_libs/lucide-react.mjs";
import { t as AppShell } from "./AppShell-KOyaLbOU.mjs";
import { t as RouteMap } from "./RouteMap-DHsYh7qQ.mjs";
import { i as TSS_SERVER_FUNCTION, l as createServerFn } from "./esm-9EjmF9OT.mjs";
import { t as getServerFnById } from "../__23tanstack-start-server-fn-resolver-b9wouynH.mjs";
import { t as requireSupabaseAuth } from "./auth-middleware-DIQeP8rF.mjs";
import { t as Route } from "./fleet._saccoId-DrAghUD1.mjs";
import { n as stringType, t as objectType } from "../_libs/zod.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/fleet._saccoId-BJ5NvLkA.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var createSsrRpc = (functionId) => {
	const url = "/_serverFn/" + functionId;
	const serverFnMeta = { id: functionId };
	const fn = async (...args) => {
		return (await getServerFnById(functionId, { origin: "server" }))(...args);
	};
	return Object.assign(fn, {
		url,
		serverFnMeta,
		[TSS_SERVER_FUNCTION]: true
	});
};
var assignSaccoDriver = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).validator((data) => objectType({
	vehicleId: stringType().uuid(),
	phone: stringType().min(3)
}).parse(data)).handler(createSsrRpc("7f771bda0e6e12e865f03fc21b8a7a99d90e9aab4714996ddcb9527e7f1994c4"));
function FleetDetail() {
	const { saccoId } = Route.useParams();
	const [sacco, setSacco] = (0, import_react.useState)(null);
	const [vehicles, setVehicles] = (0, import_react.useState)([]);
	const [adding, setAdding] = (0, import_react.useState)(false);
	const [plate, setPlate] = (0, import_react.useState)("");
	const [capacity, setCapacity] = (0, import_react.useState)("14");
	const [type, setType] = (0, import_react.useState)("matatu_14");
	const [nickname, setNickname] = (0, import_react.useState)("");
	const [assignFor, setAssignFor] = (0, import_react.useState)(null);
	const [driverEmail, setDriverEmail] = (0, import_react.useState)("");
	const [liveTrips, setLiveTrips] = (0, import_react.useState)([]);
	const [drivers, setDrivers] = (0, import_react.useState)([]);
	const [routes, setRoutes] = (0, import_react.useState)([]);
	const [joinRequests, setJoinRequests] = (0, import_react.useState)([]);
	const [addingRoute, setAddingRoute] = (0, import_react.useState)(false);
	const [origin, setOrigin] = (0, import_react.useState)("");
	const [destination, setDestination] = (0, import_react.useState)("");
	const [routeFare, setRouteFare] = (0, import_react.useState)("");
	async function loadLive(vehicleIds) {
		if (vehicleIds.length === 0) return setLiveTrips([]);
		const { data } = await supabase.from("trips").select("id,fare,status,vehicle_id,route_id,current_lat,current_lng,vehicles(plate_number),routes(name)").in("vehicle_id", vehicleIds).in("status", ["boarding", "in_transit"]);
		setLiveTrips(data ?? []);
	}
	async function load() {
		const [{ data: s }, { data: v }, { data: d }, { data: r }, { data: jr }] = await Promise.all([
			supabase.from("saccos").select("id,name").eq("id", saccoId).maybeSingle(),
			supabase.from("vehicles").select("id,plate_number,capacity,nickname,vehicle_type,driver_id").eq("sacco_id", saccoId).order("plate_number"),
			supabase.rpc("get_my_sacco_drivers", { _sacco_id: saccoId }),
			supabase.from("routes").select("id,name,origin,destination,base_fare").eq("sacco_id", saccoId).order("name"),
			supabase.rpc("list_sacco_join_requests", { _sacco_id: saccoId })
		]);
		if (s) setSacco(s);
		const vs = v ?? [];
		setVehicles(vs);
		setDrivers(d ?? []);
		setRoutes(r ?? []);
		setJoinRequests(jr ?? []);
		await loadLive(vs.map((x) => x.id));
	}
	(0, import_react.useEffect)(() => {
		load();
		const t = setInterval(load, 15e3);
		return () => clearInterval(t);
	}, [saccoId]);
	async function adjustFare(tripId, next) {
		const { error } = await supabase.from("trips").update({ fare: next }).eq("id", tripId);
		if (error) return toast.error(error.message);
		setLiveTrips((prev) => prev.map((t) => t.id === tripId ? {
			...t,
			fare: next
		} : t));
		toast.success(`Fare set to KSh ${next}`);
	}
	async function addVehicle(e) {
		e.preventDefault();
		const { error } = await supabase.from("vehicles").insert({
			sacco_id: saccoId,
			plate_number: plate.trim().toUpperCase(),
			capacity: Number(capacity),
			vehicle_type: type,
			nickname: nickname.trim() || null
		});
		if (error) return toast.error(error.message);
		toast.success("Vehicle added");
		setPlate("");
		setCapacity("14");
		setNickname("");
		setAdding(false);
		load();
	}
	async function assignDriver(vehicleId) {
		try {
			const data = await assignSaccoDriver({ data: {
				vehicleId,
				phone: driverEmail.trim()
			} });
			toast.success(`Assigned ${data.full_name ?? "driver"}`);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Could not assign driver");
			return;
		}
		setAssignFor(null);
		setDriverEmail("");
		load();
	}
	async function addRoute(e) {
		e.preventDefault();
		const { data: u } = await supabase.auth.getUser();
		if (!u.user) return;
		await supabase.rpc("claim_role", { _role: "sacco_admin" });
		const name = `${origin.trim()} → ${destination.trim()}`;
		const { error } = await supabase.from("routes").insert({
			name,
			origin: origin.trim(),
			destination: destination.trim(),
			base_fare: routeFare ? Number(routeFare) : null,
			sacco_id: saccoId,
			created_by: u.user.id
		});
		if (error) return toast.error(error.message);
		toast.success("Route added");
		setOrigin("");
		setDestination("");
		setRouteFare("");
		setAddingRoute(false);
		load();
	}
	async function updateRouteFare(routeId, next) {
		const { error } = await supabase.from("routes").update({ base_fare: next }).eq("id", routeId);
		if (error) return toast.error(error.message);
		setRoutes((prev) => prev.map((r) => r.id === routeId ? {
			...r,
			base_fare: next
		} : r));
	}
	async function approveJoin(id) {
		const { error } = await supabase.rpc("approve_driver_request", { _request_id: id });
		if (error) return toast.error(error.message);
		toast.success("Driver approved — assign them a vehicle below");
		load();
	}
	async function rejectJoin(id) {
		const { error } = await supabase.from("driver_join_requests").update({ status: "rejected" }).eq("id", id);
		if (error) return toast.error(error.message);
		toast.success("Request rejected");
		load();
	}
	const mapVehicles = liveTrips.filter((t) => t.current_lat && t.current_lng).map((t) => ({
		id: t.id,
		lat: t.current_lat,
		lng: t.current_lng,
		label: t.vehicles?.plate_number ?? "Matatu"
	}));
	const todayRevenue = liveTrips.reduce((sum, t) => sum + Number(t.fare ?? 0), 0);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(AppShell, {
		title: sacco?.name ?? "Fleet",
		subtitle: "Vehicles, drivers, and assignments.",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mb-4",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
					to: "/fleet",
					className: "inline-flex items-center gap-1.5 text-sm text-muted-foreground",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ArrowLeft, { className: "size-4" }), " All SACCOs"]
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "grid gap-4 md:grid-cols-3",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Summary, {
						icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Bus, {}),
						label: "Vehicles",
						value: vehicles.length
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Summary, {
						icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Radio, {}),
						label: "Live trips",
						value: liveTrips.length
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Summary, {
						icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Wallet, {}),
						label: "Live fares",
						value: `KSh ${todayRevenue}`
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "mt-5 rounded-2xl border border-border bg-surface p-5",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex items-center justify-between",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h2", {
							className: "font-display text-xl font-semibold",
							children: [
								"Vehicles (",
								vehicles.length,
								")"
							]
						}), !adding && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
							onClick: () => setAdding(true),
							className: "inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Plus, { className: "size-4" }), " Add vehicle"]
						})]
					}),
					adding && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
						onSubmit: addVehicle,
						className: "mt-4 grid gap-3 rounded-xl bg-secondary p-4 sm:grid-cols-2",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
								className: "text-sm",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "mb-1 block font-medium",
									children: "Plate number"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
									required: true,
									value: plate,
									onChange: (e) => setPlate(e.target.value),
									className: "w-full rounded-md border border-input bg-surface px-3 py-2"
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
								className: "text-sm",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "mb-1 block font-medium",
									children: "Nickname (optional)"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
									value: nickname,
									onChange: (e) => setNickname(e.target.value),
									className: "w-full rounded-md border border-input bg-surface px-3 py-2"
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
								className: "text-sm",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "mb-1 block font-medium",
									children: "Type"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
									value: type,
									onChange: (e) => setType(e.target.value),
									className: "w-full rounded-md border border-input bg-surface px-3 py-2",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
											value: "matatu_14",
											children: "Matatu · 14 seats"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
											value: "matatu_25",
											children: "Matatu · 25 seats"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
											value: "bus_33",
											children: "Bus · 33 seats"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
											value: "bus_51",
											children: "Bus · 51 seats"
										})
									]
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
								className: "text-sm",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "mb-1 block font-medium",
									children: "Capacity"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
									type: "number",
									required: true,
									min: 1,
									value: capacity,
									onChange: (e) => setCapacity(e.target.value),
									className: "w-full rounded-md border border-input bg-surface px-3 py-2"
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex gap-2 sm:col-span-2",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									className: "rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground",
									children: "Add"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									type: "button",
									onClick: () => setAdding(false),
									className: "rounded-md border border-border px-4 py-2 text-sm",
									children: "Cancel"
								})]
							})
						]
					}),
					vehicles.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-4 text-sm text-muted-foreground",
						children: "No vehicles yet."
					}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
						className: "mt-4 grid gap-3",
						children: vehicles.map((v) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
							className: "rounded-xl border border-border bg-background p-4",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex items-center justify-between",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "flex items-center gap-2 font-display text-lg font-semibold",
										children: [
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Bus, { className: "size-4" }),
											" ",
											v.plate_number
										]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "text-xs text-muted-foreground",
										children: [
											v.nickname ?? "—",
											" · ",
											v.vehicle_type.replace("_", " "),
											" · ",
											v.capacity,
											" seats"
										]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "mt-1 text-xs",
										children: [
											"Driver:",
											" ",
											v.driver_id ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
												className: "text-primary",
												children: "assigned"
											}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
												className: "text-muted-foreground",
												children: "unassigned"
											})
										]
									})
								] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
									onClick: () => setAssignFor(assignFor === v.id ? null : v.id),
									className: "inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(UserPlus, { className: "size-3" }),
										" ",
										v.driver_id ? "Reassign" : "Assign driver"
									]
								})]
							}), assignFor === v.id && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "mt-3 flex gap-2 border-t border-border pt-3",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
									placeholder: "Driver's phone (e.g. 0712345678)",
									value: driverEmail,
									onChange: (e) => setDriverEmail(e.target.value),
									className: "flex-1 rounded-md border border-input bg-surface px-2 py-1.5 text-xs"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									onClick: () => assignDriver(v.id),
									className: "rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground",
									children: "Assign"
								})]
							})]
						}, v.id))
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "mt-5 rounded-2xl border border-border bg-surface p-5",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h2", {
					className: "font-display text-xl font-semibold",
					children: [
						"Driver requests (",
						joinRequests.filter((r) => r.status === "pending").length,
						" pending)"
					]
				}), joinRequests.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-2 text-sm text-muted-foreground",
					children: "No requests yet. Drivers can request to join your SACCO from their dashboard."
				}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
					className: "mt-3 grid gap-2",
					children: joinRequests.map((r) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
						className: "flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-background p-3 text-sm",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "min-w-0",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "font-medium truncate",
									children: r.full_name ?? "Driver"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "text-xs text-muted-foreground truncate",
									children: [
										r.phone ?? "no phone",
										" · ",
										new Date(r.created_at).toLocaleDateString(),
										r.note ? ` · "${r.note}"` : ""
									]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground",
									children: [
										r.id_number && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: ["ID: ", r.id_number] }),
										r.license_number && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: ["License: ", r.license_number] }),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: r.brings_own_vehicle ? `Bringing own vehicle${r.vehicle_plate ? ` (${r.vehicle_plate})` : ""}` : "Needs a vehicle assigned" })
									]
								})
							]
						}), r.status === "pending" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex gap-2",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								onClick: () => approveJoin(r.id),
								className: "rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground",
								children: "Approve"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								onClick: () => rejectJoin(r.id),
								className: "rounded-md border border-border px-3 py-1.5 text-xs",
								children: "Reject"
							})]
						}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: `rounded-md px-2 py-1 text-xs capitalize ${r.status === "approved" ? "bg-primary text-primary-foreground" : "bg-secondary"}`,
							children: r.status
						})]
					}, r.id))
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "mt-5 rounded-2xl border border-border bg-surface p-5",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
					className: "font-display text-xl font-semibold",
					children: "Drivers"
				}), drivers.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-2 text-sm text-muted-foreground",
					children: "Add a vehicle, then assign a driver by their sign-up phone number."
				}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
					className: "mt-3 grid gap-2",
					children: drivers.map((d) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
						className: "flex items-center justify-between rounded-xl border border-border bg-background p-3 text-sm",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "font-medium",
							children: d.full_name ?? "Unassigned driver"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "text-xs text-muted-foreground",
							children: [
								d.plate_number,
								" · ",
								d.phone ?? "no phone"
							]
						})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "rounded-md bg-secondary px-2 py-1 text-xs capitalize",
							children: d.status
						})]
					}, d.vehicle_id))
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "mt-5 rounded-2xl border border-border bg-surface p-5",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex items-center justify-between",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h2", {
							className: "font-display text-xl font-semibold",
							children: [
								"SACCO routes (",
								routes.length,
								")"
							]
						}), !addingRoute && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
							onClick: () => setAddingRoute(true),
							className: "inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Plus, { className: "size-4" }), " Add route"]
						})]
					}),
					addingRoute && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
						onSubmit: addRoute,
						className: "mt-4 grid gap-3 rounded-xl bg-secondary p-4 sm:grid-cols-4",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
								required: true,
								value: origin,
								onChange: (e) => setOrigin(e.target.value),
								placeholder: "From: Utawala",
								className: "rounded-md border border-input bg-surface px-3 py-2 text-sm"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
								required: true,
								value: destination,
								onChange: (e) => setDestination(e.target.value),
								placeholder: "To: CBD",
								className: "rounded-md border border-input bg-surface px-3 py-2 text-sm"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
								value: routeFare,
								onChange: (e) => setRouteFare(e.target.value),
								type: "number",
								min: 10,
								placeholder: "Fare",
								className: "rounded-md border border-input bg-surface px-3 py-2 text-sm"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex gap-2",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									className: "rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground",
									children: "Save"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									type: "button",
									onClick: () => setAddingRoute(false),
									className: "rounded-md border border-border px-3 py-2 text-sm",
									children: "Cancel"
								})]
							})
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
						className: "mt-4 grid gap-2",
						children: routes.map((r) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
							className: "flex items-center justify-between rounded-xl border border-border bg-background p-3 text-sm",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Map, { className: "mr-1 inline size-3" }),
								r.origin,
								" → ",
								r.destination
							] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
								className: "flex items-center gap-2",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
										onClick: () => updateRouteFare(r.id, Math.max(10, Number(r.base_fare ?? 10) - 10)),
										className: "rounded-md border border-border px-2 py-1 text-xs",
										children: "−"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("strong", { children: ["KSh ", r.base_fare ?? "—"] }),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
										onClick: () => updateRouteFare(r.id, Number(r.base_fare ?? 0) + 10),
										className: "rounded-md border border-border px-2 py-1 text-xs",
										children: "+"
									})
								]
							})]
						}, r.id))
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "mt-5 rounded-2xl border border-border bg-surface p-5",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h2", {
					className: "font-display text-xl font-semibold",
					children: [
						"Live trips (",
						liveTrips.length,
						")"
					]
				}), liveTrips.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-2 text-sm text-muted-foreground",
					children: "No active trips right now."
				}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
					className: "mt-3 grid gap-3",
					children: liveTrips.map((t) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", {
						className: "rounded-xl border border-border bg-background p-4",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex items-center justify-between gap-3",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "font-display text-lg font-semibold",
								children: t.vehicles?.plate_number ?? "—"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "text-xs text-muted-foreground",
								children: [
									t.routes?.name ?? "—",
									" · ",
									t.status
								]
							})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex items-center gap-2",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
										onClick: () => adjustFare(t.id, Math.max(10, t.fare - 10)),
										className: "rounded-md border border-border px-2 py-1 text-sm",
										children: "−10"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "font-display text-xl font-bold",
										children: ["KSh ", t.fare]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
										onClick: () => adjustFare(t.id, t.fare + 10),
										className: "rounded-md border border-border px-2 py-1 text-sm",
										children: "+10"
									})
								]
							})]
						})
					}, t.id))
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "mt-5 rounded-2xl border border-border bg-surface p-5",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
					className: "font-display text-xl font-semibold",
					children: "Live fleet map"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RouteMap, {
					stages: [],
					vehicles: mapVehicles,
					className: "mt-3 h-[360px] w-full rounded-2xl border border-border"
				})]
			})
		]
	});
}
function Summary({ icon, label, value }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "rounded-xl border border-border bg-surface p-4",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex items-center gap-2 text-xs text-muted-foreground",
			children: [icon, label]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "mt-2 font-display text-2xl font-bold",
			children: value
		})]
	});
}
//#endregion
export { FleetDetail as component };
