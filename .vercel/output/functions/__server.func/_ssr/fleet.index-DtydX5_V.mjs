import { r as __toESM } from "../_runtime.mjs";
import { t as supabase } from "./client-BnPxBFM4.mjs";
import { n as require_react } from "../_libs/@radix-ui/react-compose-refs+[...].mjs";
import { g as Link } from "../_libs/@tanstack/react-router+[...].mjs";
import { n as require_jsx_runtime } from "../_libs/radix-ui__react-context+react.mjs";
import { n as toast } from "../_libs/sonner.mjs";
import { f as Plus, h as Map, n as Wallet, r as Users, u as Radio, w as Bus } from "../_libs/lucide-react.mjs";
import { t as AppShell } from "./AppShell-KOyaLbOU.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/fleet.index-DtydX5_V.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function SaccoHome() {
	const [saccos, setSaccos] = (0, import_react.useState)([]);
	const [loading, setLoading] = (0, import_react.useState)(true);
	const [creating, setCreating] = (0, import_react.useState)(false);
	const [name, setName] = (0, import_react.useState)("");
	const [reg, setReg] = (0, import_react.useState)("");
	const [totals, setTotals] = (0, import_react.useState)({
		vehicles: 0,
		drivers: 0,
		routes: 0,
		live: 0,
		trips: 0,
		revenue: 0
	});
	async function load() {
		const { data: u } = await supabase.auth.getUser();
		if (!u.user) return;
		const { data } = await supabase.from("saccos").select("id,name,registration_number").eq("owner_id", u.user.id);
		setSaccos(data ?? []);
		setLoading(false);
		const { data: dashboard, error } = await supabase.rpc("get_my_sacco_dashboard");
		if (error) toast.error(error.message);
		const rows = dashboard ?? [];
		setTotals({
			vehicles: rows.reduce((n, r) => n + Number(r.vehicle_count ?? 0), 0),
			drivers: rows.reduce((n, r) => n + Number(r.driver_count ?? 0), 0),
			routes: rows.reduce((n, r) => n + Number(r.route_count ?? 0), 0),
			live: rows.reduce((n, r) => n + Number(r.live_trip_count ?? 0), 0),
			trips: rows.reduce((n, r) => n + Number(r.today_trip_count ?? 0), 0),
			revenue: rows.reduce((n, r) => n + Number(r.revenue_today ?? 0), 0)
		});
	}
	(0, import_react.useEffect)(() => {
		load();
		const channel = supabase.channel("fleet-dashboard-refresh").on("postgres_changes", {
			event: "*",
			schema: "public",
			table: "vehicles"
		}, load).on("postgres_changes", {
			event: "*",
			schema: "public",
			table: "routes"
		}, load).on("postgres_changes", {
			event: "*",
			schema: "public",
			table: "trips"
		}, load).subscribe();
		const timer = setInterval(load, 1e4);
		return () => {
			clearInterval(timer);
			supabase.removeChannel(channel);
		};
	}, []);
	async function createSacco(e) {
		e.preventDefault();
		const { data: u } = await supabase.auth.getUser();
		if (!u.user) return;
		await supabase.rpc("claim_role", { _role: "sacco_admin" });
		const { error } = await supabase.from("saccos").insert({
			name: name.trim(),
			registration_number: reg.trim() || null,
			owner_id: u.user.id
		});
		if (error) {
			toast.error(error.message);
			return;
		}
		toast.success("SACCO created");
		setName("");
		setReg("");
		setCreating(false);
		load();
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AppShell, {
		title: "SACCO dashboard",
		subtitle: "Manage your vehicles, drivers, and routes from one place.",
		accent: "primary",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "grid gap-5",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "rounded-2xl border border-border bg-surface p-6 text-sm text-muted-foreground",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", {
						className: "text-foreground",
						children: "Phase 4 active:"
					}), " open a SACCO to add vehicles, assign drivers by phone, create routes, watch live trips, and adjust fares."]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
					className: "rounded-2xl border border-border bg-surface p-6",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex items-center justify-between",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
								className: "font-display text-xl font-semibold",
								children: "Your SACCOs"
							}), !creating && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
								onClick: () => setCreating(true),
								className: "inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Plus, { className: "size-4" }), " Register SACCO"]
							})]
						}),
						creating && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
							onSubmit: createSacco,
							className: "mt-4 grid gap-3 rounded-xl bg-secondary p-4 sm:grid-cols-2",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
									className: "block sm:col-span-2",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "mb-1 block text-sm font-medium",
										children: "SACCO name"
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
										value: name,
										onChange: (e) => setName(e.target.value),
										required: true,
										className: "w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm"
									})]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
									className: "block sm:col-span-2",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "mb-1 block text-sm font-medium",
										children: "Registration # (optional)"
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
										value: reg,
										onChange: (e) => setReg(e.target.value),
										className: "w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm"
									})]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "flex gap-2 sm:col-span-2",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
										type: "submit",
										className: "rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground",
										children: "Create"
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
										type: "button",
										onClick: () => setCreating(false),
										className: "rounded-md border border-border px-4 py-2 text-sm",
										children: "Cancel"
									})]
								})
							]
						}),
						loading ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-4 text-sm text-muted-foreground",
							children: "Loading…"
						}) : saccos.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-4 text-sm text-muted-foreground",
							children: "No SACCOs yet. Register your first one to start adding vehicles."
						}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
							className: "mt-4 grid gap-3",
							children: saccos.map((s) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
								className: "grid gap-2",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
									to: "/fleet/$saccoId",
									params: { saccoId: s.id },
									className: "flex items-center justify-between rounded-xl border border-border bg-background p-4 hover:border-primary",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
										className: "font-display text-lg font-semibold",
										children: s.name
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "text-xs text-muted-foreground",
										children: ["Reg: ", s.registration_number ?? "—"]
									})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
										className: "flex gap-2 text-xs text-muted-foreground",
										children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
											className: "inline-flex items-center gap-1",
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Bus, { className: "size-3" }), " Manage fleet →"]
										})
									})]
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SubscriptionCard, { saccoId: s.id })]
							}, s.id))
						})
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "grid gap-4 md:grid-cols-3",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Card, {
							icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Bus, {}),
							title: "Vehicles",
							value: String(totals.vehicles)
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Card, {
							icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Users, {}),
							title: "Drivers",
							value: String(totals.drivers)
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Card, {
							icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Map, {}),
							title: "Routes",
							value: String(totals.routes)
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Card, {
							icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Radio, {}),
							title: "Live trips",
							value: String(totals.live)
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Card, {
							icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Bus, {}),
							title: "Trips today",
							value: String(totals.trips)
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Card, {
							icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Wallet, {}),
							title: "Revenue today",
							value: `KSh ${totals.revenue}`
						})
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-xs text-muted-foreground",
					children: "Tip: open a SACCO above to add vehicles and assign drivers (by their sign-up phone number)."
				})
			]
		})
	});
}
function Card({ icon, title, value }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "rounded-xl border border-border bg-surface p-5",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex items-center gap-2 text-sm text-muted-foreground",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "grid size-7 place-items-center rounded-md bg-accent/30 text-accent-foreground",
				children: icon
			}), title]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "mt-3 font-display text-3xl font-bold",
			children: value
		})]
	});
}
function SubscriptionCard({ saccoId }) {
	const [vehicleCount, setVehicleCount] = (0, import_react.useState)(0);
	const [fee, setFee] = (0, import_react.useState)(0);
	const [phone, setPhone] = (0, import_react.useState)("");
	const [status, setStatus] = (0, import_react.useState)("idle");
	const [subId, setSubId] = (0, import_react.useState)(null);
	(0, import_react.useEffect)(() => {
		(async () => {
			const { count } = await supabase.from("vehicles").select("id", {
				count: "exact",
				head: true
			}).eq("sacco_id", saccoId);
			const n = count ?? 0;
			setVehicleCount(n);
			const { data } = await supabase.rpc("calculate_subscription_fee", { _vehicle_count: n });
			setFee(Number(data ?? 0));
		})();
	}, [saccoId]);
	(0, import_react.useEffect)(() => {
		if (!subId) return;
		const channel = supabase.channel(`sub-${subId}`).on("postgres_changes", {
			event: "UPDATE",
			schema: "public",
			table: "sacco_subscriptions",
			filter: `id=eq.${subId}`
		}, (payload) => {
			const row = payload.new;
			setStatus(row.status);
			if (row.status === "active") toast.success("Subscription payment confirmed.");
			if (row.status === "failed") toast.error(row.failure_reason || "Payment failed. Try again.");
		}).subscribe();
		const timer = setTimeout(() => {
			setStatus((s) => s === "pending" ? "timeout" : s);
		}, 6e4);
		return () => {
			supabase.removeChannel(channel);
			clearTimeout(timer);
		};
	}, [subId]);
	async function pay() {
		if (!phone.trim()) return toast.error("Enter the M-Pesa number to pay with");
		setStatus("pending");
		const { data: sub, error: insertError } = await supabase.from("sacco_subscriptions").insert({
			sacco_id: saccoId,
			vehicle_count: vehicleCount,
			amount: fee
		}).select("id").single();
		if (insertError || !sub) {
			setStatus("idle");
			return toast.error("Could not start subscription. Try again.");
		}
		setSubId(sub.id);
		const { error } = await supabase.functions.invoke("mpesa-stk-push", { body: {
			phone,
			amount: fee,
			purpose: "sacco_subscription",
			reference_id: sub.id
		} });
		if (error) {
			setStatus("failed");
			await supabase.from("sacco_subscriptions").update({
				status: "failed",
				failure_reason: "Could not reach M-Pesa"
			}).eq("id", sub.id);
			return toast.error("Could not start payment. Check the number and try again.");
		}
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "rounded-xl border border-border bg-surface p-4",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "flex items-center justify-between",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "font-medium",
					children: "Monthly subscription"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "text-sm text-muted-foreground",
					children: [
						vehicleCount,
						" vehicle",
						vehicleCount === 1 ? "" : "s",
						" · Ksh ",
						fee.toLocaleString(),
						"/month"
					]
				})] })
			}),
			status === "active" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-3 text-sm text-primary",
				children: "✓ Active — paid for this period."
			}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-3 flex flex-col gap-2 sm:flex-row",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
					value: phone,
					onChange: (e) => setPhone(e.target.value),
					placeholder: "M-Pesa number, e.g. 07XX XXX XXX",
					disabled: status === "pending",
					className: "flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					onClick: pay,
					disabled: status === "pending",
					className: "rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50",
					children: status === "pending" ? "Check your phone..." : "Pay via M-Pesa"
				})]
			}),
			status === "failed" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-2 text-sm text-destructive",
				children: "Payment failed or was cancelled on your phone. Please try again."
			}),
			status === "timeout" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-2 text-sm text-destructive",
				children: "We didn't hear back from M-Pesa. If you weren't prompted, try again below."
			})
		]
	});
}
//#endregion
export { SaccoHome as component };
