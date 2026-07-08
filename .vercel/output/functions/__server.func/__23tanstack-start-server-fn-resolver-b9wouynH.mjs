//#region node_modules/.nitro/vite/services/ssr/assets/__23tanstack-start-server-fn-resolver-b9wouynH.js
var manifest = { "7f771bda0e6e12e865f03fc21b8a7a99d90e9aab4714996ddcb9527e7f1994c4": {
	functionName: "assignSaccoDriver_createServerFn_handler",
	importer: () => import("./_ssr/fleet.functions-DomVA74-.mjs")
} };
async function getServerFnById(id, access) {
	const serverFnInfo = manifest[id];
	if (!serverFnInfo) throw new Error("Server function info not found for " + id);
	const fnModule = serverFnInfo.module ?? await serverFnInfo.importer();
	if (!fnModule) throw new Error("Server function module not resolved for " + id);
	const action = fnModule[serverFnInfo.functionName];
	if (!action) throw new Error("Server function module export not resolved for serverFn ID: " + id);
	return action;
}
//#endregion
export { getServerFnById as t };
