import * as fs from "node:fs/promises"
import * as path from "node:path"
import * as os from "node:os"
import { Logger } from "@/shared/services/Logger"
import { type ModelInfo, openRouterDefaultModelInfo } from "@shared/api"

/**
 * Schema version for the config file
 */
export const CONFIG_SCHEMA_VERSION = "v1"

/**
 * A single model entry in the config file
 */
export interface ClineConfigModel {
	/** Display name for the model (e.g., "DeepSeek V4 Pro") */
	name: string
	/** Provider type - currently only "openrouter" is supported */
	provider: "openrouter" | string
	/** Model ID on the provider (e.g., "deepseek/deepseek-v4-pro") */
	model: string
	/** API key for the provider (optional - falls back to OpenRouter API key in settings) */
	apiKey?: string
	/** Context window size in tokens (optional) */
	contextWindow?: number
	/** Max output tokens (optional) */
	maxTokens?: number
	/** Whether the model supports images (optional) */
	supportsImages?: boolean
	/** Whether the model supports prompt caching (optional) */
	supportsPromptCache?: boolean
	/** Whether the model supports reasoning/thinking (optional) */
	supportsReasoning?: boolean
	/** Input price per million tokens (optional) */
	inputPrice?: number
	/** Output price per million tokens (optional) */
	outputPrice?: number
	/** Temperature setting (optional) */
	temperature?: number
	/** Description of the model (optional) */
	description?: string
}

/**
 * The top-level config file structure
 */
export interface ClineConfig {
	/** Schema version */
	schema: string
	/** List of model configurations */
	models: ClineConfigModel[]
}

/**
 * Default config with popular open-source models via OpenRouter
 */
export const DEFAULT_CONFIG: ClineConfig = {
	schema: CONFIG_SCHEMA_VERSION,
	models: [
		{
			name: "DeepSeek: DeepSeek V4 Pro",
			provider: "openrouter",
			model: "deepseek/deepseek-v4-pro",
			contextWindow: 128_000,
			supportsImages: true,
			supportsPromptCache: true,
			supportsReasoning: true,
			description: "DeepSeek V4 Pro - Advanced reasoning and coding model",
		},
		{
			name: "Z-AI: GLM 5.1",
			provider: "openrouter",
			model: "z-ai/glm-5.1",
			contextWindow: 128_000,
			supportsImages: true,
			supportsPromptCache: false,
			description: "GLM 5.1 by Z-AI - General language model",
		},
		{
			name: "Qwen: Qwen3.7 Max",
			provider: "openrouter",
			model: "qwen/qwen3.7-max",
			contextWindow: 128_000,
			supportsImages: true,
			supportsPromptCache: true,
			supportsReasoning: true,
			description: "Qwen 3.7 Max - Alibaba's flagship model",
		},
		{
			name: "Qwen: Qwen3.6 Max Preview",
			provider: "openrouter",
			model: "qwen/qwen3.6-max-preview",
			contextWindow: 128_000,
			supportsImages: true,
			supportsPromptCache: true,
			supportsReasoning: true,
			description: "Qwen 3.6 Max Preview - Alibaba's preview model",
		},
		{
			name: "Moonshot: Kimi K2.6",
			provider: "openrouter",
			model: "moonshotai/kimi-k2.6",
			contextWindow: 128_000,
			supportsImages: true,
			supportsPromptCache: true,
			supportsReasoning: true,
			description: "Kimi K2.6 by Moonshot AI - Advanced reasoning model",
		},
		{
			name: "Xiaomi: MiMo 7B",
			provider: "openrouter",
			model: "xiaomi/mimo-7b",
			contextWindow: 32_000,
			supportsImages: false,
			supportsPromptCache: false,
			description: "MiMo 7B by Xiaomi - Compact reasoning model",
		},
	],
}

/**
 * Get the path to the Cline config file
 */
export function getConfigFilePath(): string {
	return path.join(os.homedir(), ".cline", "config.yaml")
}

/**
 * Check if a file exists at the given path
 */
async function fileExists(filePath: string): Promise<boolean> {
	try {
		await fs.access(filePath)
		return true
	} catch {
		return false
	}
}

/**
 * Ensure the config directory exists
 */
async function ensureConfigDir(): Promise<void> {
	const configDir = path.dirname(getConfigFilePath())
	if (!(await fileExists(configDir))) {
		await fs.mkdir(configDir, { recursive: true })
	}
}

/**
 * Simple YAML parser for our config format.
 * We avoid adding js-yaml dependency by implementing a minimal parser
 * that handles our flat structure.
 */
export function parseYamlConfig(yamlContent: string): ClineConfig {
	const config: ClineConfig = {
		schema: CONFIG_SCHEMA_VERSION,
		models: [],
	}

	let currentModel: Partial<ClineConfigModel> | null = null

	for (const line of yamlContent.split("\n")) {
		const trimmed = line.trim()

		// Skip empty lines and comments
		if (!trimmed || trimmed.startsWith("#")) {
			continue
		}

		// Schema version
		if (trimmed.startsWith("schema:")) {
			config.schema = trimmed.split(":").slice(1).join(":").trim()
			continue
		}

		// New model entry (starts with "- name:")
		if (trimmed.startsWith("- name:")) {
			// Save previous model if any
			if (currentModel && currentModel.name && currentModel.model) {
				config.models.push(currentModel as ClineConfigModel)
			}
			currentModel = {
				name: extractValue(trimmed, "- name:"),
			}
			continue
		}

		// Model properties (indented under a model entry)
		if (currentModel !== null) {
			if (trimmed.startsWith("provider:")) {
				currentModel.provider = extractValue(trimmed, "provider:")
			} else if (trimmed.startsWith("model:")) {
				currentModel.model = extractValue(trimmed, "model:")
			} else if (trimmed.startsWith("apiKey:")) {
				currentModel.apiKey = extractValue(trimmed, "apiKey:")
			} else if (trimmed.startsWith("contextWindow:")) {
				currentModel.contextWindow = Number(extractValue(trimmed, "contextWindow:"))
			} else if (trimmed.startsWith("maxTokens:")) {
				currentModel.maxTokens = Number(extractValue(trimmed, "maxTokens:"))
			} else if (trimmed.startsWith("supportsImages:")) {
				currentModel.supportsImages = extractValue(trimmed, "supportsImages:") === "true"
			} else if (trimmed.startsWith("supportsPromptCache:")) {
				currentModel.supportsPromptCache = extractValue(trimmed, "supportsPromptCache:") === "true"
			} else if (trimmed.startsWith("supportsReasoning:")) {
				currentModel.supportsReasoning = extractValue(trimmed, "supportsReasoning:") === "true"
			} else if (trimmed.startsWith("inputPrice:")) {
				currentModel.inputPrice = Number(extractValue(trimmed, "inputPrice:"))
			} else if (trimmed.startsWith("outputPrice:")) {
				currentModel.outputPrice = Number(extractValue(trimmed, "outputPrice:"))
			} else if (trimmed.startsWith("temperature:")) {
				currentModel.temperature = Number(extractValue(trimmed, "temperature:"))
			} else if (trimmed.startsWith("description:")) {
				currentModel.description = extractValue(trimmed, "description:")
			}
		}
	}

	// Don't forget the last model
	if (currentModel && currentModel.name && currentModel.model) {
		config.models.push(currentModel as ClineConfigModel)
	}

	return config
}

/**
 * Extract a value from a YAML line, handling quoted strings
 */
function extractValue(line: string, prefix: string): string {
	const raw = line.substring(prefix.length).trim()
	// Remove quotes if present
	if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
		return raw.slice(1, -1)
	}
	return raw
}

/**
 * Convert a ClineConfig to YAML string
 */
export function configToYaml(config: ClineConfig): string {
	const lines: string[] = [
		"# Cline Configuration File",
		"# Edit this file to add custom AI models via OpenRouter or other providers.",
		"# After saving, models will appear in the OpenRouter model picker.",
		"#",
		"# Provider options: openrouter (more coming soon)",
		"#",
		"# To get an OpenRouter API key, visit: https://openrouter.ai/settings/keys",
		"#",
		`schema: ${config.schema}`,
		"models:",
	]

	for (const model of config.models) {
		lines.push(`  - name: "${model.name}"`)
		lines.push(`    provider: ${model.provider}`)
		lines.push(`    model: ${model.model}`)
		if (model.apiKey) {
			lines.push(`    apiKey: ${model.apiKey}`)
		}
		if (model.contextWindow !== undefined) {
			lines.push(`    contextWindow: ${model.contextWindow}`)
		}
		if (model.maxTokens !== undefined) {
			lines.push(`    maxTokens: ${model.maxTokens}`)
		}
		if (model.supportsImages !== undefined) {
			lines.push(`    supportsImages: ${model.supportsImages}`)
		}
		if (model.supportsPromptCache !== undefined) {
			lines.push(`    supportsPromptCache: ${model.supportsPromptCache}`)
		}
		if (model.supportsReasoning !== undefined) {
			lines.push(`    supportsReasoning: ${model.supportsReasoning}`)
		}
		if (model.inputPrice !== undefined) {
			lines.push(`    inputPrice: ${model.inputPrice}`)
		}
		if (model.outputPrice !== undefined) {
			lines.push(`    outputPrice: ${model.outputPrice}`)
		}
		if (model.temperature !== undefined) {
			lines.push(`    temperature: ${model.temperature}`)
		}
		if (model.description) {
			lines.push(`    description: "${model.description}"`)
		}
		lines.push("")
	}

	return lines.join("\n")
}

/**
 * Load the config file, creating a default one if it doesn't exist
 */
export async function loadClineConfig(): Promise<ClineConfig> {
	const configPath = getConfigFilePath()

	try {
		if (!(await fileExists(configPath))) {
			// Create default config
			await ensureConfigDir()
			await fs.writeFile(configPath, configToYaml(DEFAULT_CONFIG), "utf-8")
			Logger.log("[Cline Config] Created default config file at:", configPath)
			return { ...DEFAULT_CONFIG }
		}

		const content = await fs.readFile(configPath, "utf-8")
		const config = parseYamlConfig(content)
		Logger.log(`[Cline Config] Loaded ${config.models.length} models from config`)
		return config
	} catch (error) {
		Logger.error("[Cline Config] Error loading config:", error)
		return { ...DEFAULT_CONFIG }
	}
}

/**
 * Convert config models to ModelInfo records for the OpenRouter model list
 */
export function configModelsToModelInfo(models: ClineConfigModel[]): Record<string, ModelInfo> {
	const result: Record<string, ModelInfo> = {}

	for (const model of models) {
		// Only include OpenRouter models (they'll be added to the OpenRouter model picker)
		if (model.provider === "openrouter") {
			result[model.model] = {
				name: model.name,
				maxTokens: model.maxTokens || openRouterDefaultModelInfo.maxTokens,
				contextWindow: model.contextWindow || openRouterDefaultModelInfo.contextWindow,
				supportsImages: model.supportsImages ?? openRouterDefaultModelInfo.supportsImages,
				supportsPromptCache: model.supportsPromptCache ?? false,
				supportsReasoning: model.supportsReasoning,
				inputPrice: model.inputPrice,
				outputPrice: model.outputPrice,
				temperature: model.temperature,
				description: model.description,
			}
		}
	}

	return result
}

/**
 * Get the API key from config for a specific model (if defined)
 */
export function getConfigApiKey(modelId: string, config: ClineConfig): string | undefined {
	const model = config.models.find((m) => m.model === modelId)
	return model?.apiKey
}

/**
 * Save the config file
 */
export async function saveClineConfig(config: ClineConfig): Promise<void> {
	await ensureConfigDir()
	const configPath = getConfigFilePath()
	await fs.writeFile(configPath, configToYaml(config), "utf-8")
	Logger.log("[Cline Config] Saved config with", config.models.length, "models")
}

/**
 * Open the config file in the VS Code editor
 * This function should only be called from the extension host context
 */
export async function openClineConfig(): Promise<void> {
	const configPath = getConfigFilePath()

	// Ensure config file exists
	if (!(await fileExists(configPath))) {
		await ensureConfigDir()
		await fs.writeFile(configPath, configToYaml(DEFAULT_CONFIG), "utf-8")
	}

	// Use dynamic import for vscode since this file is shared
	const vscode = await import("vscode")
	const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(configPath))
	await vscode.window.showTextDocument(doc)
}
