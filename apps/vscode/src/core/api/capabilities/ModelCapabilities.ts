/**
 * Model Capability Registry for Universal Model Adaptation Layer
 *
 * This system replaces hardcoded provider-based capability detection with
 * per-model capability metadata. It supports:
 * - Native tool calling (OpenAI, Anthropic formats)
 * - XML tool fallback (DeepSeek-R1 style)
 * - JSON action blocks (Llama style)
 * - ReAct style commands
 * - Reasoning/thinking mode detection
 * - Automatic capability discovery
 */

/**
 * Tool calling mode supported by a model
 */
export type ToolCallingMode =
	| "native"    // OpenAI tool_calls or Anthropic tool_use
	| "xml"       // XML-formatted tool calls (e.g., DeepSeek-R1)
	| "json"      // JSON action blocks (e.g., {"action": "terminal", "command": "ls"})
	| "react"     // ReAct style: Action: tool_name[arguments]
	| "none"      // Model cannot call tools; prompt-only mode

/**
 * Model capability profile
 */
export interface ModelCapabilityProfile {
	/** The model ID this profile describes */
	modelId: string

	/** Tool calling mode */
	toolCalling: ToolCallingMode

	/** Whether the model supports reasoning/thinking tokens */
	reasoning: boolean

	/** Context window size in tokens */
	contextWindow: number

	/** Whether the model supports system messages */
	supportsSystemMessages: boolean

	/** Whether the model supports parallel tool calls */
	supportsParallelTools: boolean

	/** Whether the model supports image inputs */
	supportsImages: boolean

	/** Whether the model supports prompt caching */
	supportsPromptCache: boolean

	/** Whether the model needs explicit tool instructions in the prompt */
	prefersExplicitToolInstructions: boolean

	/** Reasoning content field name (e.g., "reasoning_content", "thinking", "analysis") */
	reasoningFieldName?: string

	/** Whether the model's reasoning should be stripped before tool parsing */
	stripReasoningBeforeToolParsing: boolean

	/** Custom system prompt additions for this model family */
	promptStyle?: "claude" | "openai" | "reasoning" | "open-model" | "local-model"

	/** Whether capability was auto-detected (vs hardcoded) */
	autoDetected?: boolean

	/** Last time capabilities were verified */
	lastVerified?: number
}

/**
 * Default capability profiles for known models
 */
const KNOWN_MODEL_PROFILES: Record<string, Partial<ModelCapabilityProfile>> = {
	// DeepSeek models
	"deepseek-v4-pro": {
		toolCalling: "native",
		reasoning: true,
		supportsParallelTools: true,
		reasoningFieldName: "reasoning_content",
		stripReasoningBeforeToolParsing: true,
		promptStyle: "openai",
	},
	"deepseek-r1": {
		toolCalling: "xml",
		reasoning: true,
		supportsParallelTools: false,
		reasoningFieldName: "reasoning_content",
		stripReasoningBeforeToolParsing: true,
		prefersExplicitToolInstructions: true,
		promptStyle: "reasoning",
	},
	"deepseek-chat": {
		toolCalling: "native",
		reasoning: false,
		supportsParallelTools: true,
		promptStyle: "openai",
	},

	// Qwen models
	"qwen3.7-max": {
		toolCalling: "native",
		reasoning: true,
		supportsParallelTools: true,
		reasoningFieldName: "reasoning_content",
		stripReasoningBeforeToolParsing: true,
		promptStyle: "openai",
	},
	"qwen3.6-max-preview": {
		toolCalling: "native",
		reasoning: true,
		supportsParallelTools: true,
		reasoningFieldName: "reasoning_content",
		stripReasoningBeforeToolParsing: true,
		promptStyle: "openai",
	},
	"qwen3-coder": {
		toolCalling: "native",
		reasoning: true,
		supportsParallelTools: true,
		promptStyle: "openai",
	},

	// Kimi/Moonshot models
	"kimi-k2.6": {
		toolCalling: "native",
		reasoning: true,
		supportsParallelTools: true,
		reasoningFieldName: "reasoning_content",
		stripReasoningBeforeToolParsing: true,
		promptStyle: "openai",
	},
	"moonshot": {
		toolCalling: "native",
		reasoning: false,
		supportsParallelTools: true,
		promptStyle: "openai",
	},

	// GLM models
	"glm-5.1": {
		toolCalling: "native",
		reasoning: true,
		supportsParallelTools: true,
		reasoningFieldName: "reasoning_content",
		stripReasoningBeforeToolParsing: true,
		promptStyle: "openai",
	},

	// Xiaomi MiMo
	"mimo-7b": {
		toolCalling: "native",
		reasoning: true,
		supportsParallelTools: false,
		reasoningFieldName: "reasoning_content",
		stripReasoningBeforeToolParsing: true,
		promptStyle: "open-model",
	},

	// LongCat
	"longcat-2.0": {
		toolCalling: "native",
		reasoning: true,
		supportsParallelTools: true,
		reasoningFieldName: "reasoning_content",
		stripReasoningBeforeToolParsing: true,
		promptStyle: "openai",
	},

	// Llama models
	"llama": {
		toolCalling: "native",
		reasoning: false,
		supportsParallelTools: true,
		promptStyle: "open-model",
	},

	// Mistral models
	"mistral": {
		toolCalling: "native",
		reasoning: false,
		supportsParallelTools: true,
		promptStyle: "openai",
	},

	// Yi models
	"yi": {
		toolCalling: "native",
		reasoning: false,
		supportsParallelTools: false,
		promptStyle: "open-model",
	},
}

/**
 * Default capability profile for unknown models
 */
const DEFAULT_PROFILE: ModelCapabilityProfile = {
	modelId: "unknown",
	toolCalling: "native",
	reasoning: false,
	contextWindow: 128000,
	supportsSystemMessages: true,
	supportsParallelTools: false,
	supportsImages: false,
	supportsPromptCache: false,
	prefersExplicitToolInstructions: false,
	stripReasoningBeforeToolParsing: false,
	promptStyle: "open-model",
}

/**
 * Model Capability Registry
 *
 * Manages capability profiles for all models. Supports:
 * - Hardcoded profiles for known models
 * - Auto-detected profiles from capability discovery
 * - User-configured profiles from config.yaml
 * - Fuzzy matching of model IDs (e.g., "deepseek/deepseek-v4-pro" matches "deepseek-v4-pro")
 */
export class ModelCapabilityRegistry {
	private profiles: Map<string, ModelCapabilityProfile> = new Map()
	private static instance: ModelCapabilityRegistry

	private constructor() {
		// Load hardcoded profiles
		for (const [key, profile] of Object.entries(KNOWN_MODEL_PROFILES)) {
			this.profiles.set(key, {
				...DEFAULT_PROFILE,
				...profile,
				modelId: key,
			})
		}
	}

	static getInstance(): ModelCapabilityRegistry {
		if (!ModelCapabilityRegistry.instance) {
			ModelCapabilityRegistry.instance = new ModelCapabilityRegistry()
		}
		return ModelCapabilityRegistry.instance
	}

	/**
	 * Get capability profile for a model ID.
	 * Uses fuzzy matching: strips provider prefixes (e.g., "deepseek/" from "deepseek/deepseek-v4-pro")
	 */
	getProfile(modelId: string): ModelCapabilityProfile {
		// Exact match
		const exact = this.profiles.get(modelId)
		if (exact) return exact

		// Fuzzy match: try stripping provider prefix
		const stripped = modelId.includes("/") ? modelId.split("/").pop()! : modelId
		const strippedLower = stripped.toLowerCase()

		// Try matching against known profiles
		for (const [key, profile] of this.profiles.entries()) {
			if (strippedLower.includes(key.toLowerCase()) || key.toLowerCase().includes(strippedLower)) {
				return { ...profile, modelId }
			}
		}

		// Return default with the model ID
		return { ...DEFAULT_PROFILE, modelId }
	}

	/**
	 * Register a new capability profile (from auto-detection or user config)
	 */
	registerProfile(profile: ModelCapabilityProfile): void {
		this.profiles.set(profile.modelId, profile)
	}

	/**
	 * Check if a model supports native tool calling
	 */
	supportsNativeToolCalling(modelId: string): boolean {
		return this.getProfile(modelId).toolCalling === "native"
	}

	/**
	 * Check if a model needs XML fallback for tool calling
	 */
	needsXmlToolFallback(modelId: string): boolean {
		return this.getProfile(modelId).toolCalling === "xml"
	}

	/**
	 * Check if a model supports reasoning/thinking tokens
	 */
	supportsReasoning(modelId: string): boolean {
		return this.getProfile(modelId).reasoning
	}

	/**
	 * Get the reasoning field name for a model
	 */
	getReasoningFieldName(modelId: string): string | undefined {
		return this.getProfile(modelId).reasoningFieldName
	}

	/**
	 * Check if reasoning should be stripped before tool parsing
	 */
	shouldStripReasoningBeforeToolParsing(modelId: string): boolean {
		return this.getProfile(modelId).stripReasoningBeforeToolParsing
	}

	/**
	 * Get the prompt style for a model
	 */
	getPromptStyle(modelId: string): string {
		return this.getProfile(modelId).promptStyle || "open-model"
	}

	/**
	 * Get all registered profiles
	 */
	getAllProfiles(): ModelCapabilityProfile[] {
		return Array.from(this.profiles.values())
	}
}