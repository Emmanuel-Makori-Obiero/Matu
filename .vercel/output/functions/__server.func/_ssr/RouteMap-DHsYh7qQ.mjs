import { r as __toESM } from "../_runtime.mjs";
import { n as require_react } from "../_libs/@radix-ui/react-compose-refs+[...].mjs";
import { n as require_jsx_runtime } from "../_libs/radix-ui__react-context+react.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/RouteMap-DHsYh7qQ.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var loader = null;
function loadGoogleMaps() {
	if (typeof window === "undefined") return Promise.reject(/* @__PURE__ */ new Error("SSR"));
	const windowWithGoogle = window;
	if (windowWithGoogle.google?.maps) return Promise.resolve(windowWithGoogle.google);
	if (loader) return loader;
	const key = "AIzaSyBmE7tubOjcq1SyFXcZwm998UQD98FQAe4";
	const channel = "your-tracking-id-if-you-have-one";
	loader = new Promise((resolve, reject) => {
		const windowWithInit = window;
		windowWithInit.__matuInitMap = () => resolve(windowWithGoogle.google);
		const s = document.createElement("script");
		s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&loading=async&callback=__matuInitMap&channel=${channel}`;
		s.async = true;
		s.defer = true;
		s.onerror = () => reject(/* @__PURE__ */ new Error("Failed to load Google Maps"));
		document.head.appendChild(s);
	});
	return loader;
}
var NAIROBI_CENTER = {
	lat: -1.286389,
	lng: 36.817223
};
function RouteMap({ stages, vehicles = [], onMapClick, className }) {
	const ref = (0, import_react.useRef)(null);
	const mapRef = (0, import_react.useRef)(null);
	const stageMarkers = (0, import_react.useRef)([]);
	const vehicleMarkers = (0, import_react.useRef)({});
	const [ready, setReady] = (0, import_react.useState)(false);
	(0, import_react.useEffect)(() => {
		let cancelled = false;
		loadGoogleMaps().then((g) => {
			if (cancelled || !ref.current) return;
			const first = stages[0];
			const map = new g.maps.Map(ref.current, {
				center: first ? {
					lat: first.lat,
					lng: first.lng
				} : NAIROBI_CENTER,
				zoom: 12,
				disableDefaultUI: true,
				zoomControl: true
			});
			mapRef.current = map;
			setReady(true);
			if (onMapClick) map.addListener("click", (e) => {
				if (e.latLng) onMapClick(e.latLng.lat(), e.latLng.lng());
			});
		});
		return () => {
			cancelled = true;
		};
	}, []);
	(0, import_react.useEffect)(() => {
		const map = mapRef.current;
		const windowWithGoogle = window;
		if (!map || !ready || !windowWithGoogle.google) return;
		const g = windowWithGoogle.google;
		stageMarkers.current.forEach((m) => m.setMap(null));
		stageMarkers.current = stages.map((s, i) => new g.maps.Marker({
			position: {
				lat: s.lat,
				lng: s.lng
			},
			map,
			label: {
				text: String(i + 1),
				color: "#fff",
				fontSize: "11px"
			},
			title: s.name
		}));
		if (stages.length > 1) {
			new g.maps.Polyline({
				path: stages.map((s) => ({
					lat: s.lat,
					lng: s.lng
				})),
				strokeColor: "#0a5f3d",
				strokeOpacity: .9,
				strokeWeight: 3,
				map
			});
			const bounds = new g.maps.LatLngBounds();
			stages.forEach((s) => bounds.extend({
				lat: s.lat,
				lng: s.lng
			}));
			map.fitBounds(bounds, 40);
		}
	}, [stages, ready]);
	(0, import_react.useEffect)(() => {
		const map = mapRef.current;
		const windowWithGoogle = window;
		if (!map || !ready || !windowWithGoogle.google) return;
		const g = windowWithGoogle.google;
		const seen = /* @__PURE__ */ new Set();
		vehicles.forEach((v) => {
			seen.add(v.id);
			const icon = v.heading != null && !Number.isNaN(v.heading) ? {
				path: g.maps.SymbolPath.FORWARD_CLOSED_ARROW,
				scale: 6,
				rotation: v.heading,
				fillColor: "#f4c430",
				fillOpacity: 1,
				strokeColor: "#0a5f3d",
				strokeWeight: 2
			} : {
				path: g.maps.SymbolPath.CIRCLE,
				scale: 9,
				fillColor: "#f4c430",
				fillOpacity: 1,
				strokeColor: "#0a5f3d",
				strokeWeight: 2
			};
			const existing = vehicleMarkers.current[v.id];
			if (existing) {
				existing.setPosition({
					lat: v.lat,
					lng: v.lng
				});
				existing.setIcon(icon);
			} else vehicleMarkers.current[v.id] = new g.maps.Marker({
				position: {
					lat: v.lat,
					lng: v.lng
				},
				map,
				title: v.label ?? "Matatu",
				icon
			});
		});
		Object.keys(vehicleMarkers.current).forEach((id) => {
			if (!seen.has(id)) {
				vehicleMarkers.current[id].setMap(null);
				delete vehicleMarkers.current[id];
			}
		});
	}, [vehicles, ready]);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		ref,
		className: className ?? "h-[420px] w-full rounded-2xl border border-border"
	});
}
//#endregion
export { loadGoogleMaps as n, RouteMap as t };
