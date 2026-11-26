import { defineTool } from "@deepseek-ai/dsh-tools";

/** Cordis plugin name. */
const name = "provider-inventory";
/** Services used by the tool. */
const inject = ["tools", "llm", "pluginManager"];

/** Extract a plain English-or-single string from LocalizedText. */
function plainText(value) {
	if (typeof value === "string") return value;
	if (typeof value === "object" && value !== null && typeof value.en === "string") return value.en;
	return undefined;
}

/** Project one PluginInventoryEntry into a compact JSON row. */
function pluginRow(entry) {
	const title = plainText(entry.meta?.title);
	return {
		entryId: entry.entryId,
		moduleName: entry.moduleName,
		...title === undefined || title === "" ? {} : { title },
		enabled: entry.enabled,
		fiberPhase: entry.fiberPhase,
		...entry.diagnostic === undefined ? {} : { diagnostic: entry.diagnostic },
		...entry.readOnlyReason === undefined ? {} : { readOnlyReason: entry.readOnlyReason },
	};
}

/** Page a slice of items with offset/limit semantics. */
function page(items, offset, limit) {
	const entries = items.slice(offset, offset + limit);
	return {
		total: items.length,
		entries,
		nextOffset: offset + entries.length < items.length ? offset + entries.length : null,
	};
}

/** Validate a user-supplied offset/limit pair; defaults 0 and 25. */
function checkedPaging(args) {
	const offset = args.offset ?? 0;
	const limit = args.limit ?? 25;
	if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
		throw new Error("offset must be a non-negative integer and limit must be an integer from 1 to 100");
	}
	return { offset, limit };
}

/** Fetch model ids for every provider, recording per-provider failures. */
async function loadModelIds(ctx, providers, signal) {
	const results = [];
	for (const provider of providers) {
		signal.throwIfAborted();
		try {
			const models = await ctx.llm.listModels(provider.id);
			results.push({ provider: provider.id, ids: models.map((m) => m.id) });
		} catch (error) {
			results.push({ provider: provider.id, ids: undefined, error: String(error?.message ?? error) });
		}
	}
	return results;
}

/** Stringify an unknown error. */
function errorText(error) {
	return String(error?.message ?? error);
}

/**
 * Register the read-only provider inventory tool for this composition.
 * @param ctx - context providing the tool registry, llm runtime, and plugin manager.
 */
function apply(ctx) {
	ctx.tools.register(defineTool({
		name: "provider_inventory",
		description: "Read-only inventory of this profile's model providers. Call when asked what providers or models are available, or when debugging provider configuration. Overview lists every provider with its display name, settings namespace, and model count, plus configured providers that have no live adapter. Models pages one provider's model ids. Plugins lists installed plugin entries, optionally filtered by a keyword, to spot provider bundles worth disabling. Diagnostics reports duplicate display names, configuration mismatches, per-provider errors, and model ids reachable through two or more providers, each with a suggested next step. Nothing is modified.",
		parameters: {
			action: { type: "string", enum: ["overview", "models", "plugins", "diagnostics"], description: "Report to produce. Defaults to overview." },
			provider: { type: "string", description: "Provider id for action models, as listed by overview. Required for models." },
			keyword: { type: "string", description: "Substring matched against plugin module names and titles for action plugins. Omit to list all." },
			offset: { type: "number", description: "Zero-based list offset for actions models and plugins; defaults to 0." },
			limit: { type: "number", description: "Page size from 1 to 100 for actions models and plugins; defaults to 25." }
		},
		output: {
			schema: { type: "json" },
			render: (_args, value) => [{ type: "text", text: JSON.stringify(value, null, 2) }]
		},
		isConcurrencySafe: () => true,
		timeoutMs: 60000,
		async execute(args, exec) {
			const signal = exec.signal;
			switch (args.action ?? "overview") {
				case "overview": {
					const providers = ctx.llm.listProviders();
					const configurable = ctx.llm.listConfigurableProviders();
					const byId = new Map(configurable.map((c) => [c.provider, c]));
					const rows = [];
					for (const p of providers) {
						signal.throwIfAborted();
						const c = byId.get(p.id);
						const row = {
							id: p.id,
							name: p.name,
							configured: c !== undefined,
							...c === undefined ? {} : {
								displayName: c.displayName,
								settingsNs: c.settingsNs,
								...c.declared === undefined ? {} : { declared: c.declared },
								...c.defaultBaseURL === undefined ? {} : { defaultBaseURL: c.defaultBaseURL },
								...c.error === undefined ? {} : { configError: c.error }
							}
						};
						try {
							row.modelCount = (await ctx.llm.listModels(p.id)).length;
						} catch (error) {
							row.modelsError = errorText(error);
						}
						rows.push(row);
					}
					const live = new Set(providers.map((p) => p.id));
					const configurableWithoutAdapter = configurable
						.filter((c) => !live.has(c.provider))
						.map((c) => ({
							provider: c.provider,
							displayName: c.displayName,
							settingsNs: c.settingsNs,
							...c.declared === undefined ? {} : { declared: c.declared },
							...c.error === undefined ? {} : { configError: c.error }
						}));
					return {
						providerCount: rows.length,
						configurableCount: configurable.length,
						providers: rows,
						configurableWithoutAdapter
					};
				}
				case "models": {
					if (args.provider === undefined) throw new Error("provider is required for action models");
					const providers = ctx.llm.listProviders();
					const info = providers.find((p) => p.id === args.provider);
					if (info === undefined) {
						return { error: "unknown-provider", provider: args.provider, knownProviders: providers.map((p) => p.id) };
					}
					const { offset, limit } = checkedPaging(args);
					const models = await ctx.llm.listModels(args.provider);
					const entries = models.slice(offset, offset + limit).map((m) => ({
						id: m.id,
						name: m.name,
						...m.description === undefined ? {} : { description: m.description },
						...m.inputModalities === undefined ? {} : { inputModalities: m.inputModalities },
						...m.badge === undefined ? {} : { badge: m.badge }
					}));
					return {
						provider: info.id,
						name: info.name,
						total: models.length,
						entries,
						nextOffset: offset + entries.length < models.length ? offset + entries.length : null
					};
				}
				case "plugins": {
					const plugins = await ctx.pluginManager.listPlugins();
					const lowered = args.keyword === undefined ? undefined : args.keyword.toLowerCase();
					const filtered = lowered === undefined
						? plugins
						: plugins.filter((p) => p.moduleName.toLowerCase().includes(lowered)
							|| (plainText(p.meta?.title) ?? "").toLowerCase().includes(lowered));
					const { offset, limit } = checkedPaging(args);
					return page(filtered.map(pluginRow), offset, limit);
				}
				case "diagnostics": {
					const providers = ctx.llm.listProviders();
					const configurable = ctx.llm.listConfigurableProviders();
					const nameGroups = new Map();
					for (const c of configurable) {
						const key = (c.displayName ?? "").toLowerCase();
						const group = nameGroups.get(key);
						if (group === undefined) nameGroups.set(key, [c.provider]);
						else group.push(c.provider);
					}
					const duplicateDisplayNames = [...nameGroups.entries()]
						.filter(([key, owners]) => key !== "" && owners.length > 1)
						.map(([key, owners]) => ({ displayName: key, providers: owners }));
					const liveIds = new Set(providers.map((p) => p.id));
					const configurableIds = new Set(configurable.map((c) => c.provider));
					const configuredButNoAdapter = configurable.filter((c) => !liveIds.has(c.provider)).map((c) => c.provider);
					const adapterWithoutConfig = providers.filter((p) => !configurableIds.has(p.id)).map((p) => p.id);
					const configErrors = configurable.filter((c) => c.error !== undefined).map((c) => ({ provider: c.provider, error: c.error }));
					const modelIds = await loadModelIds(ctx, providers, signal);
					const modelFetchErrors = modelIds.filter((r) => r.ids === undefined).map((r) => ({ provider: r.provider, error: r.error }));
					const owners = new Map();
					for (const r of modelIds) {
						if (r.ids === undefined) continue;
						for (const id of r.ids) {
							const list = owners.get(id);
							if (list === undefined) owners.set(id, [r.provider]);
							else list.push(r.provider);
						}
					}
					const sharedAll = [...owners.entries()]
						.filter(([, providerList]) => providerList.length > 1)
						.map(([id, providerList]) => ({ modelId: id, providers: providerList }))
						.sort((a, b) => b.providers.length - a.providers.length || a.modelId.localeCompare(b.modelId));
					const hints = [];
					if (duplicateDisplayNames.length > 0) hints.push("duplicateDisplayNames: the same display name is registered by several providers; rename or disable one in its plugin settings to avoid ambiguous model selection.");
					if (configuredButNoAdapter.length > 0) hints.push("configuredButNoAdapter: these providers have settings but no active adapter plugin; enable the matching plugin via plugin_manager set_plugin, or clear the settings to declutter.");
					if (adapterWithoutConfig.length > 0) hints.push("adapterWithoutConfig: these adapters have no settings entry; add credentials in the provider settings page if you intend to use them.");
					if (configErrors.length > 0) hints.push("configErrors: fix or remove the reported settings values to clear the errors.");
					if (modelFetchErrors.length > 0) hints.push("modelFetchErrors: the provider adapter failed to list models; check its credentials or disable the plugin.");
					if (sharedAll.length > 0) hints.push("sharedModelIds: the same model id is reachable through several providers; pick the provider explicitly or disable the redundant one.");
					return {
						providerCount: providers.length,
						duplicateDisplayNames,
						configuredButNoAdapter,
						adapterWithoutConfig,
						configErrors,
						modelFetchErrors,
						sharedModelIdCount: sharedAll.length,
						sharedModelIds: sharedAll.slice(0, 50),
						hints
					};
				}
				/* v8 ignore next -- tool JSON validation rejects actions outside the declared enum */
				default: return undefined;
			}
		}
	}));
}

export { apply, inject, name };
