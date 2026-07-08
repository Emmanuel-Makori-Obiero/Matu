import { r as __toESM } from "../_runtime.mjs";
import { t as supabase } from "./client-BnPxBFM4.mjs";
import { n as require_react } from "../_libs/@radix-ui/react-compose-refs+[...].mjs";
import { g as Link } from "../_libs/@tanstack/react-router+[...].mjs";
import { n as require_jsx_runtime } from "../_libs/radix-ui__react-context+react.mjs";
import { E as Bell, O as ArrowRight, g as MapPin, n as Wallet, s as ShieldCheck, w as Bus } from "../_libs/lucide-react.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/routes-BCqNQwIF.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function Landing() {
	const [signedIn, setSignedIn] = (0, import_react.useState)(false);
	(0, import_react.useEffect)(() => {
		supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
	}, []);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "min-h-screen bg-background",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
				className: "mx-auto flex max-w-6xl items-center justify-between px-5 py-5",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
					to: "/",
					className: "flex items-center gap-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Logo, {}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "font-display text-2xl font-bold tracking-tight",
						children: "Matu"
					})]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
					to: signedIn ? "/ride" : "/auth",
					className: "rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90",
					children: signedIn ? "Open app" : "Sign in"
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("section", {
				className: "mx-auto max-w-6xl px-5 pb-16 pt-10 md:pb-24 md:pt-16",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "grid items-center gap-12 md:grid-cols-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "mb-5 inline-flex items-center gap-2 rounded-full bg-accent/30 px-3 py-1 text-xs font-medium text-accent-foreground",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "size-2 rounded-full bg-green-500 animate-pulse" }), "24 Active Routes • 412 Passengers Today"]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h1", {
							className: "text-5xl font-display font-bold leading-[1.05] tracking-tight md:text-6xl",
							children: [
								"Never wait for",
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("br", {}),
								"a matatu again"
							]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-5 max-w-md text-lg text-muted-foreground",
							children: "Track matatus in real time, reserve your seat before leaving home, pay securely, and receive an alert before your stop. Designed for passengers, drivers and SACCOs across Kenya."
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "mt-8 flex flex-wrap gap-3",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
								to: "/auth",
								className: "inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-base font-medium text-primary-foreground shadow-soft transition hover:shadow-lift",
								children: ["Get started ", /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ArrowRight, { className: "size-4" })]
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
								href: "#how",
								className: "inline-flex items-center rounded-lg border border-border bg-surface px-6 py-3 text-base font-medium",
								children: "How it works"
							})]
						})
					] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "relative",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "absolute -inset-6 -z-10 rounded-3xl bg-gradient-to-br from-accent/40 via-primary/10 to-transparent blur-2xl" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "overflow-hidden rounded-3xl border border-border bg-surface shadow-lift",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "relative h-44 bg-primary",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "absolute inset-x-0 top-1/2 h-8 -translate-y-1/2 bg-accent" }),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
										className: "absolute left-6 top-4 font-display text-2xl font-bold text-primary-foreground",
										children: "KDA 042M"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
										className: "absolute bottom-3 right-5 rounded-md bg-surface/95 px-2 py-1 text-xs font-semibold text-foreground",
										children: "CBD → Rongai"
									})
								]
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "space-y-4 p-5",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
										icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(MapPin, { className: "size-4 text-primary" }),
										label: "Next stage",
										value: "T-Mall · 3 min"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
										icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Wallet, { className: "size-4 text-primary" }),
										label: "Fare today",
										value: "KSh 80"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, {
										icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Bus, { className: "size-4 text-primary" }),
										label: "Seats",
										value: "9 of 14 left"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
										className: "w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground",
										children: "Book a seat"
									})
								]
							})]
						})]
					})]
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("section", {
				id: "how",
				className: "bg-surface py-20",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mx-auto max-w-6xl px-5",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
							className: "text-3xl font-display font-bold md:text-4xl",
							children: "Built for everyone on the road"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-3 max-w-xl text-muted-foreground",
							children: "Three apps in one — pick how you ride, drive, or run your SACCO."
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "mt-10 grid gap-5 md:grid-cols-3",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(RoleCard, {
									title: "Passengers",
									desc: "Find matatus on your route, book a seat ahead, and get notified the moment your bus is near your stage.",
									points: [
										"Live matatu map",
										"Seat booking",
										"Near-pickup & near-stop alerts"
									]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(RoleCard, {
									title: "Drivers & Conductors",
									desc: "Set your route, agree on today's fare, and let your phone broadcast your location so passengers can find you.",
									points: [
										"Adaptive fare",
										"Add custom stages",
										"Seat & alight requests"
									],
									highlight: true
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(RoleCard, {
									title: "SACCOs",
									desc: "Manage your fleet from one dashboard. Add vehicles, assign drivers, and see every trip in real time.",
									points: [
										"Fleet manager",
										"Driver assignments",
										"M-Pesa escrow (soon)"
									]
								})
							]
						})
					]
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("section", {
				className: "mx-auto max-w-6xl px-5 py-20",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "grid gap-5 md:grid-cols-3",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Feature, {
							icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Bell, {}),
							title: "Smart alerts",
							desc: "A buzz when your matatu is 300m away. Another when your stage is next."
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Feature, {
							icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Wallet, {}),
							title: "Adaptive fares",
							desc: "Drivers and conductors agree on today's price — no surprises at the door."
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Feature, {
							icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShieldCheck, {}),
							title: "Safer rides",
							desc: "Every trip is tied to a driver, a vehicle, and a SACCO. Receipts on every fare."
						})
					]
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("footer", {
				className: "border-t border-border bg-surface",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mx-auto flex max-w-6xl flex-col items-start justify-between gap-3 px-5 py-8 text-sm text-muted-foreground md:flex-row md:items-center",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex items-center gap-2",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Logo, { small: true }),
							" ",
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "font-display font-semibold text-foreground",
								children: "Matu"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "· Built for Kenyan commuters" })
						]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
						"© ",
						(/* @__PURE__ */ new Date()).getFullYear(),
						" Matu"
					] })]
				})
			})
		]
	});
}
function Logo({ small = false }) {
	const size = small ? 24 : 32;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
		style: {
			width: size,
			height: size
		},
		className: "relative grid place-items-center overflow-hidden rounded-lg bg-primary",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 bg-accent" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Bus, { className: "relative z-10 size-4 text-primary-foreground" })]
	});
}
function Row({ icon, label, value }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex items-center justify-between",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex items-center gap-2 text-sm text-muted-foreground",
			children: [
				icon,
				" ",
				label
			]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "text-sm font-semibold",
			children: value
		})]
	});
}
function RoleCard({ title, desc, points, highlight = false }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: `rounded-2xl border p-6 transition ${highlight ? "border-primary/30 bg-primary text-primary-foreground shadow-lift" : "border-border bg-background"}`,
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
				className: `font-display text-xl font-semibold ${highlight ? "" : ""}`,
				children: title
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: `mt-2 text-sm ${highlight ? "text-primary-foreground/80" : "text-muted-foreground"}`,
				children: desc
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
				className: "mt-4 space-y-1.5 text-sm",
				children: points.map((p) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
					className: "flex items-center gap-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: `size-1.5 rounded-full ${highlight ? "bg-accent" : "bg-primary"}` }), p]
				}, p))
			})
		]
	});
}
function Feature({ icon, title, desc }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "rounded-2xl border border-border bg-surface p-6",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "grid size-10 place-items-center rounded-lg bg-accent/30 text-accent-foreground",
				children: icon
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
				className: "mt-4 font-display text-lg font-semibold",
				children: title
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-1 text-sm text-muted-foreground",
				children: desc
			})
		]
	});
}
//#endregion
export { Landing as component };
