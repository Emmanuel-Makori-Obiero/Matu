import { r as __toESM } from "../_runtime.mjs";
import { t as supabase } from "./client-BnPxBFM4.mjs";
import { n as require_react } from "../_libs/@radix-ui/react-compose-refs+[...].mjs";
import { _ as useNavigate, g as Link } from "../_libs/@tanstack/react-router+[...].mjs";
import { n as require_jsx_runtime } from "../_libs/radix-ui__react-context+react.mjs";
import { n as toast } from "../_libs/sonner.mjs";
import { c as Search, g as MapPin, k as ArrowRightLeft, m as Navigation, v as LocateFixed } from "../_libs/lucide-react.mjs";
import { t as AppShell } from "./AppShell-KOyaLbOU.mjs";
import { n as loadGoogleMaps, t as RouteMap } from "./RouteMap-DHsYh7qQ.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/ride.index-CEkljzDo.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function haversineKm(aLat, aLng, bLat, bLng) {
	const R = 6371;
	const dLat = (bLat - aLat) * Math.PI / 180;
	const dLng = (bLng - aLng) * Math.PI / 180;
	const a = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * Math.PI / 180) * Math.cos(bLat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
	return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
async function findNearestStage(query, limit = 3) {
	const { data: stages, error } = await supabase.from("stages").select("id,route_id,name,lat,lng");
	if (error || !stages) return [];
	const lower = query.trim().toLowerCase();
	const nameMatches = stages.filter((s) => s.name.toLowerCase().includes(lower));
	if (nameMatches.length > 0) return nameMatches.slice(0, limit).map((stage) => ({
		stage,
		distanceKm: 0,
		exactNameMatch: true
	}));
	const geocoder = new (await (loadGoogleMaps())).maps.Geocoder();
	const result = await new Promise((resolve) => {
		geocoder.geocode({ address: `${query}, Nairobi, Kenya` }, (results, status) => {
			resolve(status === "OK" && results?.[0] ? results[0] : null);
		});
	});
	if (!result) return [];
	const lat = result.geometry.location.lat();
	const lng = result.geometry.location.lng();
	return stages.map((stage) => ({
		stage,
		distanceKm: haversineKm(lat, lng, stage.lat, stage.lng),
		exactNameMatch: false
	})).sort((a, b) => a.distanceKm - b.distanceKm).slice(0, limit);
}
function PassengerHome() {
	const navigate = useNavigate();
	const [routes, setRoutes] = (0, import_react.useState)([]);
	const [stages, setStages] = (0, import_react.useState)([]);
	const [loading, setLoading] = (0, import_react.useState)(true);
	const [from, setFrom] = (0, import_react.useState)("");
	const [to, setTo] = (0, import_react.useState)("");
	const [myLoc, setMyLoc] = (0, import_react.useState)(null);
	const [nearestSuggestions, setNearestSuggestions] = (0, import_react.useState)([]);
	(0, import_react.useEffect)(() => {
		(async () => {
			const [{ data: r }, { data: s }] = await Promise.all([supabase.from("routes").select("id,name,origin,destination,base_fare").order("name"), supabase.from("stages").select("id,name,lat,lng,order_index,route_id").order("order_index")]);
			setRoutes(r ?? []);
			setStages(s ?? []);
			setLoading(false);
		})();
	}, []);
	const places = (0, import_react.useMemo)(() => {
		const s = /* @__PURE__ */ new Set();
		routes.forEach((r) => {
			s.add(r.origin);
			s.add(r.destination);
		});
		stages.forEach((st) => s.add(st.name));
		return Array.from(s).sort();
	}, [routes, stages]);
	const filtered = (0, import_react.useMemo)(() => {
		const f = from.trim().toLowerCase();
		const t = to.trim().toLowerCase();
		if (!f && !t) return routes;
		return routes.filter((r) => {
			const hay = [
				r.origin.toLowerCase(),
				r.destination.toLowerCase(),
				...stages.filter((s) => s.route_id === r.id).map((s) => s.name.toLowerCase())
			].join(" | ");
			const matchesF = !f || hay.includes(f);
			const matchesT = !t || hay.includes(t);
			return matchesF && matchesT;
		});
	}, [
		routes,
		stages,
		from,
		to
	]);
	(0, import_react.useEffect)(() => {
		const query = (to || from).trim();
		if (filtered.length > 0 || !query) {
			setNearestSuggestions([]);
			return;
		}
		let cancelled = false;
		findNearestStage(query).then((matches) => {
			if (!cancelled) setNearestSuggestions(matches);
		});
		return () => {
			cancelled = true;
		};
	}, [
		filtered.length,
		to,
		from
	]);
	const mapStages = (0, import_react.useMemo)(() => {
		const routeIds = new Set(filtered.map((r) => r.id));
		return stages.filter((s) => routeIds.has(s.route_id)).map((s) => ({
			id: s.id,
			name: s.name,
			lat: s.lat,
			lng: s.lng
		}));
	}, [filtered, stages]);
	async function useMyLocation() {
		if (!("geolocation" in navigator)) return toast.error("Location not available");
		toast.loading("Getting your location…", { id: "geo" });
		navigator.geolocation.getCurrentPosition((pos) => {
			const p = {
				lat: pos.coords.latitude,
				lng: pos.coords.longitude
			};
			setMyLoc(p);
			let bestName = null;
			let bestD = Infinity;
			stages.forEach((s) => {
				const d = (s.lat - p.lat) ** 2 + (s.lng - p.lng) ** 2;
				if (d < bestD) {
					bestD = d;
					bestName = s.name;
				}
			});
			if (bestName) setFrom(bestName);
			toast.success(`Pickup set to ${bestName ?? "your location"}`, { id: "geo" });
		}, () => toast.error("Could not get location", { id: "geo" }), {
			enableHighAccuracy: true,
			timeout: 1e4
		});
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AppShell, {
		title: "Where to?",
		subtitle: "Pick pickup and destination — we'll match you to matatus on your route.",
		tabs: [{
			to: "/ride",
			label: "Find a ride"
		}, {
			to: "/ride/history",
			label: "My bookings"
		}],
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "grid gap-4 lg:grid-cols-[1fr_380px]",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "order-2 lg:order-1",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RouteMap, {
					stages: mapStages,
					vehicles: myLoc ? [{
						id: "me",
						lat: myLoc.lat,
						lng: myLoc.lng,
						label: "You"
					}] : [],
					className: "h-[420px] w-full rounded-2xl border border-border lg:h-[600px]"
				})
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("aside", {
				className: "order-1 flex flex-col gap-4 lg:order-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("section", {
					className: "rounded-2xl border border-border bg-surface p-4 shadow-soft",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "grid gap-3",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PlaceField, {
								icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "size-2.5 rounded-full bg-accent" }),
								label: "Pickup",
								value: from,
								onChange: setFrom,
								options: places,
								placeholder: "Where from? (e.g. Utawala)",
								rightSlot: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
									type: "button",
									onClick: useMyLocation,
									className: "inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs font-medium hover:bg-secondary",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(LocateFixed, { className: "size-3" }), " Use my location"]
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "flex justify-center",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									type: "button",
									onClick: () => {
										const a = from;
										setFrom(to);
										setTo(a);
									},
									"aria-label": "Swap",
									className: "rounded-full border border-border bg-background p-1.5 hover:bg-secondary",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ArrowRightLeft, { className: "size-3.5" })
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PlaceField, {
								icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "size-2.5 rounded-full bg-primary" }),
								label: "Destination",
								value: to,
								onChange: setTo,
								options: places,
								placeholder: "Where to? (e.g. CBD)"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex gap-2",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
									type: "button",
									className: "flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Search, { className: "mr-1 inline size-4" }), " Find matatus"]
								}), (from || to) && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									type: "button",
									onClick: () => {
										setFrom("");
										setTo("");
									},
									className: "rounded-lg border border-border px-3 py-2.5 text-xs",
									children: "Clear"
								})]
							})
						]
					})
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
					className: "rounded-2xl border border-border bg-surface p-4 shadow-soft",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "flex items-center justify-between",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
								className: "font-display text-base font-semibold",
								children: from || to ? `Matching routes (${filtered.length})` : `All routes (${routes.length})`
							})
						}),
						loading ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-3 text-sm text-muted-foreground",
							children: "Loading routes…"
						}) : filtered.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "mt-3 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "No routes match. Try a nearby stage or clear the search." }), nearestSuggestions.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "mt-3",
								children: [!nearestSuggestions[0].exactNameMatch && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
									className: "text-xs",
									children: [
										"No stage called \"",
										to || from,
										"\" — nearest stop is",
										" ",
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: nearestSuggestions[0].stage.name }),
										" (",
										nearestSuggestions[0].distanceKm.toFixed(1),
										" km away)"
									]
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
									className: "mt-2 grid gap-1.5",
									children: nearestSuggestions.map((m) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
										type: "button",
										onClick: () => to ? setTo(m.stage.name) : setFrom(m.stage.name),
										className: "w-full rounded-md border border-border bg-background px-2 py-1.5 text-left text-xs hover:border-primary",
										children: [m.stage.name, !m.exactNameMatch && ` · ${m.distanceKm.toFixed(1)} km from "${to || from}"`]
									}) }, m.stage.id))
								})]
							})]
						}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
							className: "mt-3 grid max-h-[440px] gap-2 overflow-y-auto pr-1",
							children: filtered.map((r) => {
								const routeStages = stages.filter((s) => s.route_id === r.id).sort((a, b) => a.order_index - b.order_index);
								const fLow = from.trim().toLowerCase();
								const tLow = to.trim().toLowerCase();
								const findIdx = (q) => routeStages.findIndex((s) => s.name.toLowerCase().includes(q));
								let fromIdx = fLow ? findIdx(fLow) : -1;
								let toIdx = tLow ? findIdx(tLow) : -1;
								if (fromIdx > -1 && toIdx > -1 && fromIdx > toIdx) [fromIdx, toIdx] = [toIdx, fromIdx];
								const between = fromIdx > -1 && toIdx > -1 ? routeStages.slice(fromIdx, toIdx + 1) : routeStages;
								const showBetween = (fLow || tLow) && between.length > 0;
								return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
									onClick: () => navigate({
										to: "/ride/$routeId",
										params: { routeId: r.id }
									}),
									className: "flex w-full items-start justify-between gap-3 rounded-xl border border-border bg-background p-3 text-left transition hover:border-primary",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "min-w-0 flex-1",
										children: [
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
												className: "truncate font-display text-sm font-semibold",
												children: r.name
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
												className: "mt-0.5 flex items-center gap-1 text-xs text-muted-foreground",
												children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(MapPin, { className: "size-3 shrink-0" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
													className: "truncate",
													children: [
														r.origin,
														" → ",
														r.destination
													]
												})]
											}),
											showBetween && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ol", {
												className: "mt-2 grid gap-0.5 border-l-2 border-primary/40 pl-2 text-[11px] text-muted-foreground",
												children: between.map((s, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
													className: "flex items-center gap-1",
													children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: `size-1.5 rounded-full ${i === 0 ? "bg-accent" : i === between.length - 1 ? "bg-primary" : "bg-muted-foreground/50"}` }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
														className: "truncate",
														children: s.name
													})]
												}, s.id))
											})
										]
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "shrink-0 rounded-md bg-accent/30 px-2 py-1 text-xs font-semibold text-accent-foreground",
										children: ["KSh ", r.base_fare ?? "—"]
									})]
								}) }, r.id);
							})
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
							to: "/ride",
							className: "mt-3 inline-flex items-center gap-1 text-xs text-primary",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Navigation, { className: "size-3" }), " Browse all routes"]
						})
					]
				})]
			})]
		})
	});
}
function PlaceField({ label, value, onChange, options, placeholder, icon, rightSlot }) {
	const listId = `places-${label.toLowerCase()}`;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
		className: "block",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
				className: "mb-1 flex items-center justify-between text-xs font-medium uppercase tracking-wide text-muted-foreground",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
					className: "flex items-center gap-2",
					children: [
						icon,
						" ",
						label
					]
				}), rightSlot]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
				list: listId,
				value,
				onChange: (e) => onChange(e.target.value),
				placeholder,
				className: "w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none ring-ring focus:ring-2"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("datalist", {
				id: listId,
				children: options.map((o) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: o }, o))
			})
		]
	});
}
//#endregion
export { PassengerHome as component };
