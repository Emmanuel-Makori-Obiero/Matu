import { r as __toESM } from "../_runtime.mjs";
import { t as supabase } from "./client-BnPxBFM4.mjs";
import { n as require_react } from "../_libs/@radix-ui/react-compose-refs+[...].mjs";
import { _ as useNavigate, g as Link } from "../_libs/@tanstack/react-router+[...].mjs";
import { n as require_jsx_runtime } from "../_libs/radix-ui__react-context+react.mjs";
import { n as toast } from "../_libs/sonner.mjs";
import { A as ArrowLeft, C as CircleCheck, E as Bell, S as CircleX, b as DollarSign, f as Plus, g as MapPin, l as ScanLine, o as Square, p as Play, t as X, y as LoaderCircle } from "../_libs/lucide-react.mjs";
import { t as AppShell } from "./AppShell-KOyaLbOU.mjs";
import { t as RouteMap } from "./RouteMap-DHsYh7qQ.mjs";
import { t as require_jsQR } from "../_libs/jsqr.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/drive.trip-qoJN7Apr.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var import_jsQR = /* @__PURE__ */ __toESM(require_jsQR());
var audioCtx = null;
var loopTimer = null;
function beepOnce() {
	audioCtx ??= new AudioContext();
	const osc = audioCtx.createOscillator();
	const gain = audioCtx.createGain();
	osc.type = "square";
	osc.frequency.value = 880;
	gain.gain.setValueAtTime(.001, audioCtx.currentTime);
	gain.gain.exponentialRampToValueAtTime(.3, audioCtx.currentTime + .02);
	gain.gain.exponentialRampToValueAtTime(.001, audioCtx.currentTime + .35);
	osc.connect(gain).connect(audioCtx.destination);
	osc.start();
	osc.stop(audioCtx.currentTime + .4);
}
function startNoisyAlert() {
	stopNoisyAlert();
	beepOnce();
	loopTimer = setInterval(beepOnce, 1200);
}
function stopNoisyAlert() {
	if (loopTimer) clearInterval(loopTimer);
	loopTimer = null;
}
function TicketScanner({ tripId, onBoarded }) {
	const [open, setOpen] = (0, import_react.useState)(false);
	const [result, setResult] = (0, import_react.useState)({ kind: "idle" });
	const [marking, setMarking] = (0, import_react.useState)(false);
	const videoRef = (0, import_react.useRef)(null);
	const canvasRef = (0, import_react.useRef)(null);
	const streamRef = (0, import_react.useRef)(null);
	const rafRef = (0, import_react.useRef)(null);
	const lastScannedRef = (0, import_react.useRef)(null);
	(0, import_react.useEffect)(() => {
		if (!open) return;
		let cancelled = false;
		async function startCamera() {
			try {
				const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
				if (cancelled) {
					stream.getTracks().forEach((t) => t.stop());
					return;
				}
				streamRef.current = stream;
				if (videoRef.current) {
					videoRef.current.srcObject = stream;
					await videoRef.current.play();
				}
				tick();
			} catch {
				toast.error("Couldn't access camera. Check camera permissions and try again.");
				setOpen(false);
			}
		}
		function tick() {
			const video = videoRef.current;
			const canvas = canvasRef.current;
			if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
				rafRef.current = requestAnimationFrame(tick);
				return;
			}
			canvas.width = video.videoWidth;
			canvas.height = video.videoHeight;
			const ctx = canvas.getContext("2d", { willReadFrequently: true });
			if (!ctx) {
				rafRef.current = requestAnimationFrame(tick);
				return;
			}
			ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
			const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
			const code = (0, import_jsQR.default)(imageData.data, imageData.width, imageData.height, { inversionAttempts: "dontInvert" });
			if (code && code.data && code.data !== lastScannedRef.current) {
				lastScannedRef.current = code.data;
				handleScanned(code.data);
				return;
			}
			rafRef.current = requestAnimationFrame(tick);
		}
		startCamera();
		return () => {
			cancelled = true;
			if (rafRef.current) cancelAnimationFrame(rafRef.current);
			streamRef.current?.getTracks().forEach((t) => t.stop());
			streamRef.current = null;
		};
	}, [open]);
	async function handleScanned(payload) {
		if (!payload.startsWith("MATU-TICKET:")) {
			setResult({ kind: "not_found" });
			return;
		}
		const bookingId = payload.slice(12).trim();
		setResult({ kind: "checking" });
		const { data, error } = await supabase.from("bookings").select("id,trip_id,seat_number,status").eq("id", bookingId).maybeSingle();
		if (error || !data) {
			setResult({ kind: "not_found" });
			return;
		}
		if (data.trip_id !== tripId) {
			setResult({ kind: "wrong_trip" });
			return;
		}
		setResult({
			kind: "found",
			bookingId: data.id,
			seatNumber: data.seat_number,
			status: data.status,
			alreadyBoarded: data.status === "boarded"
		});
	}
	async function markBoarded(bookingId) {
		setMarking(true);
		const { error } = await supabase.from("bookings").update({ status: "boarded" }).eq("id", bookingId);
		setMarking(false);
		if (error) return toast.error(error.message || "Could not update booking");
		toast.success("Passenger marked as boarded");
		onBoarded();
		resumeScanning();
	}
	function resumeScanning() {
		lastScannedRef.current = null;
		setResult({ kind: "idle" });
		rafRef.current = requestAnimationFrame(function loop() {
			const video = videoRef.current;
			const canvas = canvasRef.current;
			if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
				rafRef.current = requestAnimationFrame(loop);
				return;
			}
			canvas.width = video.videoWidth;
			canvas.height = video.videoHeight;
			const ctx = canvas.getContext("2d", { willReadFrequently: true });
			if (!ctx) {
				rafRef.current = requestAnimationFrame(loop);
				return;
			}
			ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
			const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
			const code = (0, import_jsQR.default)(imageData.data, imageData.width, imageData.height, { inversionAttempts: "dontInvert" });
			if (code && code.data && code.data !== lastScannedRef.current) {
				lastScannedRef.current = code.data;
				handleScanned(code.data);
				return;
			}
			rafRef.current = requestAnimationFrame(loop);
		});
	}
	function close() {
		setOpen(false);
		setResult({ kind: "idle" });
		lastScannedRef.current = null;
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
		onClick: () => setOpen(true),
		className: "inline-flex w-full items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ScanLine, { className: "size-4" }), " Scan ticket"]
	}), open && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "fixed inset-0 z-50 flex flex-col bg-black",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-center justify-between p-4 text-white",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "text-sm font-medium",
					children: "Scan passenger ticket"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					onClick: close,
					className: "rounded-md p-1 hover:bg-white/10",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(X, { className: "size-5" })
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "relative flex-1",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("video", {
						ref: videoRef,
						playsInline: true,
						muted: true,
						className: "h-full w-full object-cover"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("canvas", {
						ref: canvasRef,
						className: "hidden"
					}),
					result.kind === "idle" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "pointer-events-none absolute inset-0 flex items-center justify-center",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "size-56 rounded-2xl border-2 border-white/70" })
					})
				]
			}),
			result.kind !== "idle" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "border-t border-white/10 bg-background p-5",
				children: [
					result.kind === "checking" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(LoaderCircle, { className: "size-4 animate-spin" }), " Checking ticket…"]
					}),
					result.kind === "not_found" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "grid gap-3",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex items-center gap-2 text-destructive",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CircleX, { className: "size-5" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "text-sm font-medium",
								children: "Not a valid Matu ticket"
							})]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							onClick: resumeScanning,
							className: "rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground",
							children: "Scan again"
						})]
					}),
					result.kind === "wrong_trip" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "grid gap-3",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex items-center gap-2 text-destructive",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CircleX, { className: "size-5" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "text-sm font-medium",
								children: "This ticket is for a different trip"
							})]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							onClick: resumeScanning,
							className: "rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground",
							children: "Scan again"
						})]
					}),
					result.kind === "found" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "grid gap-3",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex items-center gap-2 text-primary",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CircleCheck, { className: "size-5" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "text-sm font-medium",
									children: result.alreadyBoarded ? "Already boarded" : "Valid ticket"
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "text-sm text-muted-foreground",
								children: [
									"Seat ",
									result.seatNumber ?? "—",
									" · Ticket",
									" ",
									result.bookingId.slice(0, 8).toUpperCase()
								]
							}),
							result.alreadyBoarded ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								onClick: resumeScanning,
								className: "rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground",
								children: "Scan next passenger"
							}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex gap-2",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									onClick: () => markBoarded(result.bookingId),
									disabled: marking,
									className: "flex-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60",
									children: marking ? "Marking…" : "Mark as boarded"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									onClick: resumeScanning,
									className: "rounded-md border border-border px-3 py-2 text-sm",
									children: "Skip"
								})]
							})
						]
					})
				]
			})
		]
	})] });
}
function DriverTrip() {
	const navigate = useNavigate();
	const [vehicles, setVehicles] = (0, import_react.useState)([]);
	const [routes, setRoutes] = (0, import_react.useState)([]);
	const [vehicleId, setVehicleId] = (0, import_react.useState)("");
	const [routeId, setRouteId] = (0, import_react.useState)("");
	const [fare, setFare] = (0, import_react.useState)("");
	const [trip, setTrip] = (0, import_react.useState)(null);
	const [stages, setStages] = (0, import_react.useState)([]);
	const [bookings, setBookings] = (0, import_react.useState)([]);
	const [alerts, setAlerts] = (0, import_react.useState)([]);
	const [newStageName, setNewStageName] = (0, import_react.useState)("");
	const [addStageMode, setAddStageMode] = (0, import_react.useState)(false);
	const [currentStageId, setCurrentStageId] = (0, import_react.useState)(null);
	(0, import_react.useEffect)(() => {
		(async () => {
			const { data: u } = await supabase.auth.getUser();
			if (!u.user) return;
			const [{ data: v }, { data: r }, { data: t }] = await Promise.all([
				supabase.from("vehicles").select("id,plate_number,capacity").eq("driver_id", u.user.id),
				supabase.from("routes").select("id,name,base_fare").order("name"),
				supabase.from("trips").select("id,fare,status,route_id,vehicle_id").eq("driver_id", u.user.id).in("status", ["boarding", "in_transit"]).maybeSingle()
			]);
			setVehicles(v ?? []);
			setRoutes(r ?? []);
			if (t) setTrip(t);
		})();
	}, []);
	(0, import_react.useEffect)(() => {
		if (!trip) return;
		(async () => {
			const [{ data: s }, { data: b }, { data: a }] = await Promise.all([
				supabase.from("stages").select("id,name,lat,lng,order_index").eq("route_id", trip.route_id).order("order_index"),
				supabase.from("bookings").select("id,seat_number,status,passenger_id").eq("trip_id", trip.id),
				supabase.from("alerts").select("id,type,message,created_at,passenger_id").eq("trip_id", trip.id).order("created_at", { ascending: false })
			]);
			setStages(s ?? []);
			setBookings(b ?? []);
			setAlerts(a ?? []);
		})();
		const ch = supabase.channel(`trip-${trip.id}`).on("postgres_changes", {
			event: "*",
			schema: "public",
			table: "bookings",
			filter: `trip_id=eq.${trip.id}`
		}, async () => {
			const { data } = await supabase.from("bookings").select("id,seat_number,status,passenger_id").eq("trip_id", trip.id);
			setBookings(data ?? []);
		}).on("postgres_changes", {
			event: "INSERT",
			schema: "public",
			table: "alerts",
			filter: `trip_id=eq.${trip.id}`
		}, (payload) => {
			const alert = payload.new;
			setAlerts((prev) => [alert, ...prev]);
			startNoisyAlert();
			toast.info(`Passenger alert: ${alert.type.replace("_", " ")}`, {
				duration: 15e3,
				action: {
					label: "Acknowledge",
					onClick: stopNoisyAlert
				}
			});
		}).subscribe();
		return () => {
			supabase.removeChannel(ch);
			stopNoisyAlert();
		};
	}, [trip]);
	(0, import_react.useEffect)(() => {
		if (!trip) return;
		if (!("geolocation" in navigator)) return;
		const watchId = navigator.geolocation.watchPosition(async (pos) => {
			await supabase.from("trips").update({
				current_lat: pos.coords.latitude,
				current_lng: pos.coords.longitude,
				current_heading: pos.coords.heading,
				current_stage_id: currentStageId
			}).eq("id", trip.id);
		}, (err) => console.warn("geo error", err), {
			enableHighAccuracy: true,
			maximumAge: 5e3,
			timeout: 15e3
		});
		return () => navigator.geolocation.clearWatch(watchId);
	}, [trip, currentStageId]);
	async function startTrip() {
		const { data: u } = await supabase.auth.getUser();
		if (!u.user) return;
		if (!vehicleId || !routeId || !fare) return toast.error("Pick vehicle, route, and fare");
		const { data, error } = await supabase.from("trips").insert({
			driver_id: u.user.id,
			vehicle_id: vehicleId,
			route_id: routeId,
			fare: Number(fare),
			status: "boarding",
			started_at: (/* @__PURE__ */ new Date()).toISOString()
		}).select("id,fare,status,route_id,vehicle_id").single();
		if (error) return toast.error(error.message);
		setTrip(data);
		toast.success("Trip started — passengers can now book");
	}
	async function endTrip() {
		if (!trip) return;
		await supabase.from("trips").update({
			status: "completed",
			ended_at: (/* @__PURE__ */ new Date()).toISOString()
		}).eq("id", trip.id);
		toast.success("Trip ended");
		setTrip(null);
		navigate({ to: "/drive" });
	}
	async function updateFare(next) {
		if (!trip) return;
		await supabase.from("trips").update({ fare: next }).eq("id", trip.id);
		setTrip({
			...trip,
			fare: next
		});
		toast.success(`Fare updated to KSh ${next}`);
	}
	async function toggleTransit() {
		if (!trip) return;
		const next = trip.status === "boarding" ? "in_transit" : "boarding";
		await supabase.from("trips").update({ status: next }).eq("id", trip.id);
		setTrip({
			...trip,
			status: next
		});
	}
	async function refreshBookings() {
		if (!trip) return;
		const { data } = await supabase.from("bookings").select("id,seat_number,status,passenger_id").eq("trip_id", trip.id);
		setBookings(data ?? []);
	}
	async function addStage(lat, lng) {
		if (!trip || !addStageMode || !newStageName.trim()) {
			if (addStageMode && !newStageName.trim()) toast.error("Type a stage name first");
			return;
		}
		const { data: u } = await supabase.auth.getUser();
		if (!u.user) return;
		const nextOrder = stages.length ? Math.max(...stages.map((s) => s.order_index)) + 1 : 0;
		const { data, error } = await supabase.from("stages").insert({
			route_id: trip.route_id,
			name: newStageName.trim(),
			lat,
			lng,
			order_index: nextOrder,
			added_by: u.user.id
		}).select("id,name,lat,lng,order_index").single();
		if (error) return toast.error(error.message);
		setStages((prev) => [...prev, data]);
		setNewStageName("");
		setAddStageMode(false);
		toast.success(`Stage “${data.name}” added`);
	}
	if (!trip) return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(AppShell, {
		title: "Start a trip",
		subtitle: "Pick your vehicle and route to begin broadcasting to passengers.",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "mb-4",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
				to: "/drive",
				className: "inline-flex items-center gap-1.5 text-sm text-muted-foreground",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ArrowLeft, { className: "size-4" }), " Back"]
			})
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
			onSubmit: (e) => {
				e.preventDefault();
				startTrip();
			},
			className: "grid max-w-lg gap-3 rounded-2xl border border-border bg-surface p-6",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
					className: "text-sm",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "mb-1 block font-medium",
							children: "Vehicle"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
							value: vehicleId,
							onChange: (e) => setVehicleId(e.target.value),
							required: true,
							className: "w-full rounded-md border border-input bg-background px-3 py-2",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
								value: "",
								children: "— select —"
							}), vehicles.map((v) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("option", {
								value: v.id,
								children: [
									v.plate_number,
									" (",
									v.capacity,
									" seats)"
								]
							}, v.id))]
						}),
						vehicles.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "mt-3 grid gap-3",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(RegisterOwnVehicle, { onCreated: (v) => {
								setVehicles((prev) => [...prev, v]);
								setVehicleId(v.id);
							} }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(JoinSaccoPanel, {})]
						})
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
					className: "text-sm",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
						className: "mb-1 flex items-center justify-between font-medium",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Route" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NewRouteButton, { onCreated: (r) => {
							setRoutes((prev) => [...prev, r].sort((a, b) => a.name.localeCompare(b.name)));
							setRouteId(r.id);
							if (r.base_fare) setFare(String(r.base_fare));
						} })]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
						value: routeId,
						onChange: (e) => setRouteId(e.target.value),
						required: true,
						className: "w-full rounded-md border border-input bg-background px-3 py-2",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
							value: "",
							children: "— select —"
						}), routes.map((r) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
							value: r.id,
							children: r.name
						}, r.id))]
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
					className: "text-sm",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "mb-1 block font-medium",
							children: "Today's fare (KSh)"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							value: fare,
							onChange: (e) => setFare(e.target.value),
							type: "number",
							min: 10,
							required: true,
							className: "w-full rounded-md border border-input bg-background px-3 py-2"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "mt-1 block text-xs text-muted-foreground",
							children: "Agree with the conductor, then set it here."
						})
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					className: "inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Play, { className: "size-4" }), " Start trip"]
				})
			]
		})]
	});
	const seatsBooked = bookings.filter((b) => b.status !== "cancelled").length;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AppShell, {
		title: "Trip in progress",
		subtitle: "Your live location is broadcasting to passengers.",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "grid gap-5 lg:grid-cols-[1fr_360px]",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "grid gap-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(RouteMap, {
					stages,
					onMapClick: addStage
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-3 text-sm",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
						onClick: () => setAddStageMode((v) => !v),
						className: `inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium ${addStageMode ? "bg-accent text-accent-foreground" : "border border-border"}`,
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Plus, { className: "size-3" }),
							" ",
							addStageMode ? "Tap map to add" : "Add stage"
						]
					}), addStageMode && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
						autoFocus: true,
						placeholder: "Stage name (e.g. Junction)",
						value: newStageName,
						onChange: (e) => setNewStageName(e.target.value),
						className: "flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-xs"
					})]
				})]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "grid gap-4",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
						className: "rounded-2xl border border-border bg-surface p-5",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex items-center justify-between",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "text-xs uppercase tracking-wide text-muted-foreground",
									children: "Fare"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "font-display text-3xl font-bold",
									children: ["KSh ", trip.fare]
								})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "flex gap-1",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
										onClick: () => updateFare(Math.max(10, trip.fare - 10)),
										className: "rounded-md border border-border px-2 py-1 text-sm",
										children: "−10"
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
										onClick: () => updateFare(trip.fare + 10),
										className: "rounded-md border border-border px-2 py-1 text-sm",
										children: "+10"
									})]
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
								onClick: toggleTransit,
								className: "mt-3 w-full rounded-md border border-border px-3 py-2 text-sm font-medium",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DollarSign, { className: "mr-1 inline size-4" }), trip.status === "boarding" ? "Boarding → mark in transit" : "In transit → back to boarding"]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
								onClick: endTrip,
								className: "mt-2 w-full rounded-md bg-destructive px-3 py-2 text-sm font-medium text-destructive-foreground",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Square, { className: "mr-1 inline size-4" }), " End trip"]
							})
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
						className: "rounded-2xl border border-border bg-surface p-5",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h2", {
								className: "font-display text-lg font-semibold",
								children: [
									"Bookings (",
									seatsBooked,
									")"
								]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "mt-3",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TicketScanner, {
									tripId: trip.id,
									onBoarded: refreshBookings
								})
							}),
							bookings.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "mt-2 text-sm text-muted-foreground",
								children: "No bookings yet."
							}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
								className: "mt-3 grid gap-1 text-sm",
								children: bookings.map((b) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
									className: "flex items-center justify-between rounded-md bg-background px-3 py-1.5",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: ["Passenger · seat ", b.seat_number ?? "—"] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "text-xs text-muted-foreground",
										children: b.status
									})]
								}, b.id))
							})
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
						className: "rounded-2xl border border-border bg-surface p-5",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
							className: "font-display text-lg font-semibold",
							children: "Alerts"
						}), alerts.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-2 text-sm text-muted-foreground",
							children: "No alerts."
						}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
							className: "mt-3 grid gap-2 text-sm",
							children: alerts.slice(0, 5).map((a) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
								className: "flex items-start gap-2 rounded-md bg-background px-3 py-2",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Bell, { className: "mt-0.5 size-4 text-accent" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "font-medium",
									children: a.type.replace("_", " ")
								}), a.message && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "text-xs text-muted-foreground",
									children: a.message
								})] })]
							}, a.id))
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
						className: "rounded-2xl border border-border bg-surface p-5",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h2", {
								className: "font-display text-lg font-semibold",
								children: [
									"Stages (",
									stages.length,
									")"
								]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", {
								className: "mt-2 block text-xs font-medium text-muted-foreground",
								children: "Current stage (shown to passengers along with your GPS dot)"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
								value: currentStageId ?? "",
								onChange: (e) => setCurrentStageId(e.target.value || null),
								className: "mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
									value: "",
									children: "— none selected —"
								}), stages.map((s) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
									value: s.id,
									children: s.name
								}, s.id))]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ol", {
								className: "mt-3 grid gap-1 text-sm",
								children: stages.map((s) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
									className: "flex items-center gap-2",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(MapPin, { className: "size-3 text-primary" }),
										" ",
										s.name
									]
								}, s.id))
							})
						]
					})
				]
			})]
		})
	});
}
function NewRouteButton({ onCreated }) {
	const [open, setOpen] = (0, import_react.useState)(false);
	const [origin, setOrigin] = (0, import_react.useState)("");
	const [destination, setDestination] = (0, import_react.useState)("");
	const [baseFare, setBaseFare] = (0, import_react.useState)("");
	const [busy, setBusy] = (0, import_react.useState)(false);
	async function create() {
		if (!origin.trim() || !destination.trim()) return toast.error("Enter origin and destination");
		setBusy(true);
		const { data: u } = await supabase.auth.getUser();
		if (!u.user) {
			setBusy(false);
			return;
		}
		await supabase.rpc("claim_role", { _role: "driver" });
		const name = `${origin.trim()} → ${destination.trim()}`;
		const { data, error } = await supabase.from("routes").insert({
			name,
			origin: origin.trim(),
			destination: destination.trim(),
			base_fare: baseFare ? Number(baseFare) : null,
			created_by: u.user.id
		}).select("id,name,base_fare").single();
		setBusy(false);
		if (error) return toast.error(error.message);
		toast.success("Route created");
		onCreated(data);
		setOrigin("");
		setDestination("");
		setBaseFare("");
		setOpen(false);
	}
	if (!open) return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
		type: "button",
		onClick: () => setOpen(true),
		className: "inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-xs font-normal",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Plus, { className: "size-3" }), " New route"]
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
		className: "flex flex-wrap items-center gap-1",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
				value: origin,
				onChange: (e) => setOrigin(e.target.value),
				placeholder: "From (e.g. Utawala)",
				className: "w-32 rounded-md border border-input bg-background px-2 py-1 text-xs"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
				value: destination,
				onChange: (e) => setDestination(e.target.value),
				placeholder: "To (e.g. CBD)",
				className: "w-32 rounded-md border border-input bg-background px-2 py-1 text-xs"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
				value: baseFare,
				onChange: (e) => setBaseFare(e.target.value),
				placeholder: "Fare",
				type: "number",
				className: "w-14 rounded-md border border-input bg-background px-2 py-1 text-xs"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				type: "button",
				disabled: busy,
				onClick: create,
				className: "rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground disabled:opacity-60",
				children: "Save"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				type: "button",
				onClick: () => setOpen(false),
				className: "text-xs text-muted-foreground",
				children: "✕"
			})
		]
	});
}
function JoinSaccoPanel() {
	const [saccos, setSaccos] = (0, import_react.useState)([]);
	const [saccoId, setSaccoId] = (0, import_react.useState)("");
	const [note, setNote] = (0, import_react.useState)("");
	const [phone, setPhone] = (0, import_react.useState)("");
	const [idNumber, setIdNumber] = (0, import_react.useState)("");
	const [license, setLicense] = (0, import_react.useState)("");
	const [bringsOwnVehicle, setBringsOwnVehicle] = (0, import_react.useState)(true);
	const [plate, setPlate] = (0, import_react.useState)("");
	const [myReqs, setMyReqs] = (0, import_react.useState)([]);
	const [busy, setBusy] = (0, import_react.useState)(false);
	async function load() {
		const { data: u } = await supabase.auth.getUser();
		if (!u.user) return;
		const [{ data: s }, { data: r }, { data: p }] = await Promise.all([
			supabase.rpc("list_public_saccos"),
			supabase.from("driver_join_requests").select("sacco_id,status").eq("driver_id", u.user.id),
			supabase.from("profiles").select("phone,id_number,license_number").eq("id", u.user.id).maybeSingle()
		]);
		setSaccos(s ?? []);
		setMyReqs(r ?? []);
		if (p?.phone && !phone) setPhone(p.phone);
		if (p?.id_number && !idNumber) setIdNumber(p.id_number);
		if (p?.license_number && !license) setLicense(p.license_number);
	}
	(0, import_react.useEffect)(() => {
		load();
	}, []);
	async function submit() {
		if (!saccoId) return toast.error("Pick a SACCO first");
		if (!phone.trim()) return toast.error("Enter your phone number so the SACCO can reach you");
		if (!idNumber.trim() || !license.trim()) return toast.error("Enter your ID and license number");
		if (bringsOwnVehicle && !plate.trim()) return toast.error("Enter your vehicle's plate number");
		setBusy(true);
		const { data: u } = await supabase.auth.getUser();
		if (!u.user) {
			setBusy(false);
			return;
		}
		const { error: payError } = await supabase.functions.invoke("mpesa-stk-push", { body: {
			phone: phone.trim(),
			amount: 1e3,
			purpose: "sacco_join_fee"
		} });
		if (payError) {
			setBusy(false);
			return toast.error("Could not start the Ksh 1,000 payment. Try again.");
		}
		toast("Check your phone and enter your M-Pesa PIN to complete the Ksh 1,000 fee.");
		await supabase.rpc("claim_role", { _role: "driver" });
		await supabase.from("profiles").update({
			phone: phone.trim(),
			id_number: idNumber.trim(),
			license_number: license.trim()
		}).eq("id", u.user.id);
		if (bringsOwnVehicle && plate.trim()) await supabase.from("vehicles").upsert({
			plate_number: plate.trim().toUpperCase(),
			driver_id: u.user.id,
			capacity: 14,
			sacco_id: null
		}, { onConflict: "plate_number" });
		const { error } = await supabase.from("driver_join_requests").upsert({
			driver_id: u.user.id,
			sacco_id: saccoId,
			phone: phone.trim(),
			id_number: idNumber.trim(),
			license_number: license.trim(),
			brings_own_vehicle: bringsOwnVehicle,
			vehicle_plate: bringsOwnVehicle ? plate.trim().toUpperCase() : null,
			note: note.trim() || null,
			status: "pending"
		}, { onConflict: "driver_id,sacco_id" });
		setBusy(false);
		if (error) return toast.error(error.message);
		toast.success("Request sent — the SACCO owner will see your details and approve it");
		setNote("");
		load();
	}
	const nameFor = (id) => saccos.find((s) => s.id === id)?.name ?? "SACCO";
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "rounded-lg border border-dashed border-border bg-secondary/60 p-3 text-xs",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "font-medium text-foreground",
				children: "Prefer joining a SACCO?"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-1 text-muted-foreground",
				children: "Request to join a SACCO and get assigned a vehicle once approved. A Ksh 1,000 joining fee applies."
			}),
			myReqs.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
				className: "mt-2 grid gap-1",
				children: myReqs.map((r) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
					className: "flex items-center justify-between rounded-md bg-background px-2 py-1",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: nameFor(r.sacco_id) }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: `rounded px-1.5 py-0.5 text-[10px] font-medium capitalize ${r.status === "approved" ? "bg-primary text-primary-foreground" : r.status === "rejected" ? "bg-destructive text-destructive-foreground" : "bg-accent text-accent-foreground"}`,
						children: r.status
					})]
				}, r.sacco_id))
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-2 grid gap-1.5",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
						value: saccoId,
						onChange: (e) => setSaccoId(e.target.value),
						className: "w-full rounded-md border border-input bg-background px-2 py-1.5",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
							value: "",
							children: "— pick a SACCO —"
						}), saccos.map((s) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
							value: s.id,
							children: s.name
						}, s.id))]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
						value: phone,
						onChange: (e) => setPhone(e.target.value),
						placeholder: "Your phone (e.g. 0712 345 678)",
						className: "w-full rounded-md border border-input bg-background px-2 py-1.5"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
						value: idNumber,
						onChange: (e) => setIdNumber(e.target.value),
						placeholder: "National ID number",
						className: "w-full rounded-md border border-input bg-background px-2 py-1.5"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
						value: license,
						onChange: (e) => setLicense(e.target.value),
						placeholder: "Driving license number",
						className: "w-full rounded-md border border-input bg-background px-2 py-1.5"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex gap-3 rounded-md bg-background px-2 py-1.5",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
							className: "flex items-center gap-1.5",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
								type: "radio",
								checked: bringsOwnVehicle,
								onChange: () => setBringsOwnVehicle(true),
								className: "accent-primary"
							}), "Own vehicle"]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
							className: "flex items-center gap-1.5",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
								type: "radio",
								checked: !bringsOwnVehicle,
								onChange: () => setBringsOwnVehicle(false),
								className: "accent-primary"
							}), "Assign me one"]
						})]
					}),
					bringsOwnVehicle && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
						value: plate,
						onChange: (e) => setPlate(e.target.value),
						placeholder: "Plate (e.g. KDA 123A)",
						className: "w-full rounded-md border border-input bg-background px-2 py-1.5"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
						value: note,
						onChange: (e) => setNote(e.target.value),
						placeholder: "Note (optional)",
						className: "w-full rounded-md border border-input bg-background px-2 py-1.5"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						disabled: busy,
						onClick: submit,
						className: "rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground disabled:opacity-60",
						children: busy ? "Sending..." : "Pay Ksh 1,000 & send request"
					})
				]
			})
		]
	});
}
function RegisterOwnVehicle({ onCreated }) {
	const [open, setOpen] = (0, import_react.useState)(false);
	const [plate, setPlate] = (0, import_react.useState)("");
	const [capacity, setCapacity] = (0, import_react.useState)("14");
	const [type, setType] = (0, import_react.useState)("matatu_14");
	const [busy, setBusy] = (0, import_react.useState)(false);
	async function submit() {
		if (!plate.trim()) return toast.error("Enter a plate number");
		setBusy(true);
		const { data: u } = await supabase.auth.getUser();
		if (!u.user) {
			setBusy(false);
			return;
		}
		await supabase.rpc("claim_role", { _role: "driver" });
		const { data, error } = await supabase.from("vehicles").insert({
			plate_number: plate.trim().toUpperCase(),
			capacity: Number(capacity),
			vehicle_type: type,
			driver_id: u.user.id,
			sacco_id: null
		}).select("id,plate_number,capacity").single();
		setBusy(false);
		if (error) return toast.error(error.message);
		toast.success("Vehicle registered");
		onCreated(data);
		setPlate("");
		setOpen(false);
	}
	if (!open) return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
		type: "button",
		onClick: () => setOpen(true),
		className: "rounded-lg border border-dashed border-border bg-secondary/60 p-3 text-left text-xs",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "font-medium text-foreground",
			children: "Register your own vehicle"
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "mt-0.5 text-muted-foreground",
			children: "Independent driver? Add your matatu directly (no SACCO required)."
		})]
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "grid gap-2 rounded-lg border border-border bg-secondary/60 p-3 text-xs",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
				value: plate,
				onChange: (e) => setPlate(e.target.value),
				placeholder: "Plate (e.g. KDA 123A)",
				className: "rounded-md border border-input bg-background px-2 py-1.5"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex gap-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
					value: type,
					onChange: (e) => setType(e.target.value),
					className: "flex-1 rounded-md border border-input bg-background px-2 py-1.5",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
							value: "matatu_14",
							children: "Matatu · 14"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
							value: "matatu_25",
							children: "Matatu · 25"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
							value: "bus_33",
							children: "Bus · 33"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
							value: "bus_51",
							children: "Bus · 51"
						})
					]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
					type: "number",
					min: 1,
					value: capacity,
					onChange: (e) => setCapacity(e.target.value),
					className: "w-20 rounded-md border border-input bg-background px-2 py-1.5"
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex gap-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					disabled: busy,
					onClick: submit,
					className: "flex-1 rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground disabled:opacity-60",
					children: busy ? "Saving…" : "Save vehicle"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					onClick: () => setOpen(false),
					className: "rounded-md border border-border px-3 py-1.5",
					children: "Cancel"
				})]
			})
		]
	});
}
//#endregion
export { DriverTrip as component };
