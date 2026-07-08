import { r as __toESM } from "../_runtime.mjs";
import { t as supabase } from "./client-BnPxBFM4.mjs";
import { n as require_react } from "../_libs/@radix-ui/react-compose-refs+[...].mjs";
import { _ as useNavigate, g as Link } from "../_libs/@tanstack/react-router+[...].mjs";
import { n as require_jsx_runtime } from "../_libs/radix-ui__react-context+react.mjs";
import { n as toast } from "../_libs/sonner.mjs";
import { A as ArrowLeft, w as Bus } from "../_libs/lucide-react.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/auth-Dl0riGiQ.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var ROLE_HOME = {
	passenger: "/ride",
	driver: "/drive",
	conductor: "/drive",
	sacco_admin: "/fleet"
};
async function fetchPrimaryRole(userId) {
	const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
	if (error || !data || data.length === 0) return "passenger";
	for (const r of [
		"sacco_admin",
		"driver",
		"conductor",
		"passenger"
	]) if (data.some((d) => d.role === r)) return r;
	return "passenger";
}
async function homePathForUser(userId) {
	return ROLE_HOME[await fetchPrimaryRole(userId)];
}
var ROLE_OPTIONS = [
	{
		value: "passenger",
		label: "Passenger",
		desc: "Find a matatu, book a seat"
	},
	{
		value: "driver",
		label: "Driver / Conductor",
		desc: "Pick up passengers on your route"
	},
	{
		value: "sacco_admin",
		label: "SACCO Admin",
		desc: "Manage your fleet & drivers"
	}
];
function AuthPage() {
	const navigate = useNavigate();
	const [mode, setMode] = (0, import_react.useState)("signin");
	const [email, setEmail] = (0, import_react.useState)("");
	const [password, setPassword] = (0, import_react.useState)("");
	const [fullName, setFullName] = (0, import_react.useState)("");
	const [phone, setPhone] = (0, import_react.useState)("");
	const [role, setRole] = (0, import_react.useState)("passenger");
	const [loading, setLoading] = (0, import_react.useState)(false);
	(0, import_react.useEffect)(() => {
		supabase.auth.getSession().then(async ({ data }) => {
			if (data.session?.user) {
				const home = await homePathForUser(data.session.user.id);
				navigate({
					to: home,
					replace: true
				});
			}
		});
	}, [navigate]);
	async function handleSubmit(e) {
		e.preventDefault();
		setLoading(true);
		try {
			if (mode === "signup") {
				const { data, error } = await supabase.auth.signUp({
					email: email.trim(),
					password,
					options: {
						emailRedirectTo: window.location.origin,
						data: {
							full_name: fullName.trim(),
							phone: phone.trim(),
							role
						}
					}
				});
				if (error) throw error;
				toast.success("Welcome to Matu!");
				if (data.session?.user) {
					await supabase.rpc("claim_role", { _role: role });
					const home = await homePathForUser(data.session.user.id);
					navigate({
						to: home,
						replace: true
					});
				}
			} else {
				const { data, error } = await supabase.auth.signInWithPassword({
					email: email.trim(),
					password
				});
				if (error) throw error;
				if (data.user) {
					const home = await homePathForUser(data.user.id);
					toast.success("Karibu tena!");
					navigate({
						to: home,
						replace: true
					});
				}
			}
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Something went wrong");
		} finally {
			setLoading(false);
		}
	}
	async function handleGoogle() {
		setLoading(true);
		try {
			const { error } = await supabase.auth.signInWithOAuth({
				provider: "google",
				options: { redirectTo: window.location.origin + "/auth" }
			});
			if (error) {
				toast.error("Google sign-in failed");
				setLoading(false);
			}
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Google sign-in failed");
			setLoading(false);
		}
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "min-h-screen bg-background",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
			className: "mx-auto flex max-w-6xl items-center justify-between px-5 py-5",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
				to: "/",
				className: "inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ArrowLeft, { className: "size-4" }), " Back"]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
				to: "/",
				className: "flex items-center gap-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
					className: "relative grid size-8 place-items-center overflow-hidden rounded-lg bg-primary",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 bg-accent" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Bus, { className: "relative z-10 size-4 text-primary-foreground" })]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "font-display text-xl font-bold",
					children: "Matu"
				})]
			})]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
			className: "mx-auto grid max-w-md gap-6 px-5 py-8 md:py-14",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "text-center",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
						className: "font-display text-3xl font-bold",
						children: mode === "signup" ? "Join Matu" : "Welcome back"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-2 text-sm text-muted-foreground",
						children: mode === "signup" ? "Tell us how you'll use Matu." : "Sign in to keep moving."
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					onClick: handleGoogle,
					disabled: loading,
					className: "flex items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 py-3 text-sm font-medium transition hover:bg-secondary disabled:opacity-50",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(GoogleIcon, {}), " Continue with Google"]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-center gap-3 text-xs text-muted-foreground",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "h-px flex-1 bg-border" }),
						" or email",
						" ",
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "h-px flex-1 bg-border" })
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
					onSubmit: handleSubmit,
					className: "space-y-3",
					children: [
						mode === "signup" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
							label: "Full name",
							value: fullName,
							onChange: setFullName,
							required: true
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
							label: "Phone (M-Pesa)",
							value: phone,
							onChange: setPhone,
							placeholder: "07XX XXX XXX"
						})] }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
							label: "Email",
							type: "email",
							value: email,
							onChange: setEmail,
							required: true
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
							label: "Password",
							type: "password",
							value: password,
							onChange: setPassword,
							required: true,
							minLength: 6
						}),
						mode === "signup" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("fieldset", {
							className: "space-y-2 pt-2",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("legend", {
								className: "text-sm font-medium",
								children: "I am a…"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "grid gap-2",
								children: ROLE_OPTIONS.map((opt) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
									className: `flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition ${role === opt.value ? "border-primary bg-primary/5" : "border-border hover:bg-secondary"}`,
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
										type: "radio",
										name: "role",
										value: opt.value,
										checked: role === opt.value,
										onChange: () => setRole(opt.value),
										className: "mt-0.5 accent-primary"
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "block font-medium text-foreground",
										children: opt.label
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "block text-xs text-muted-foreground",
										children: opt.desc
									})] })]
								}, opt.value))
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "submit",
							disabled: loading,
							className: "w-full rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50",
							children: loading ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"
						})
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
					className: "text-center text-sm text-muted-foreground",
					children: [
						mode === "signup" ? "Already have an account?" : "New to Matu?",
						" ",
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							onClick: () => setMode(mode === "signup" ? "signin" : "signup"),
							className: "font-medium text-primary hover:underline",
							children: mode === "signup" ? "Sign in" : "Create one"
						})
					]
				})
			]
		})]
	});
}
function Input({ label, value, onChange, type = "text", required, placeholder, minLength }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
		className: "block",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "mb-1 block text-sm font-medium",
			children: label
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
			type,
			value,
			onChange: (e) => onChange(e.target.value),
			required,
			placeholder,
			minLength,
			className: "w-full rounded-lg border border-input bg-surface px-3 py-2.5 text-sm outline-none ring-ring focus:ring-2"
		})]
	});
}
function GoogleIcon() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", {
		width: "18",
		height: "18",
		viewBox: "0 0 24 24",
		"aria-hidden": true,
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
				fill: "#4285F4",
				d: "M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
				fill: "#34A853",
				d: "M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
				fill: "#FBBC05",
				d: "M5.84 14.1A6.99 6.99 0 015.46 12c0-.73.13-1.44.36-2.1V7.07H2.18A11 11 0 001 12c0 1.77.42 3.44 1.18 4.93l3.66-2.83z"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
				fill: "#EA4335",
				d: "M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.83C6.71 7.31 9.14 5.38 12 5.38z"
			})
		]
	});
}
//#endregion
export { AuthPage as component };
