/**
 * Automatic Capability Discovery for the Model Adaptation Layer
 *
 * When a user configures a new model, this system automatically tests
 * the model's capabilities by sending a probe request. It detects:
 * - Whether the model supports native tool calling
 * - What format tool calls come in (native, XML, JSON, ReAct)
 * - Whether the model supports reasoning/thinking tokens
 * - Whether the model supports streaming
 *
 * This removes the need for guessing or hardcoding model capabilities.
 */

import { Logger } from "@/shared/services/Logger"
import { ModelCapabilityProfile, ToolCallingMode } from "./ModelCapabilities"
import { ModelCapabilityRegistry } from "./ModelCapabilities"
import { UniversalToolParser } from "./UniversalToolParser"

/**
 * Result of a capability discovery probe
 */
export interface CapabilityDiscoveryResult {
	/** Whether the model supports native tool calling */
	supportsNativeToolCalling: boolean
	/** Detected tool calling mode */
	toolCallingMode: ToolCallingMode
	/** Whether the model supports reasoning/thinking */
	supportsReasoning: boolean
	/** Detected reasoning field name */
	reasoningFieldName?: string
	/** Whether the model supports streaming */
	supportsStreaming: boolean
	/** Whether the probe was successful */
	probeSuccessful: boolean
	/** Error message if probe failed */
	error?: string
	/** Time taken for the probe in ms */
	probeDurationMs: number
}

/**
 * Test tool definition used for capability probing
 */
const PROBE_TOOL = {
	type: "function" as const,
	function: {
		name: "test_capability",
		description: "A test function to verify tool calling capability",
		parameters: {
			type: "object",
			properties: {
				message: {
					type: "string",
					description: "A test message",
				},
			},
			required: ["message"],
		},
	},
}

/**
 * Test messages for capability probing
 */
const PROBE_MESSAGES = [
	{
		role: "user" as const,
		content: "Please call the test_capability function with the message 'hello'. You must use the provided tool.",
	},
]

/**
 * Capability Discovery
 *
 * Automatically tests a model's capabilities by sending a probe request
 * and analyzing the response format.
 */
export class CapabilityDiscovery {
	/**
	 * Run a capability discovery probe against a model.
	 *
	 * @param createMessageFn - Function to call the model (same as ApiHandler.createMessage)
	 * @param modelId - The model ID being tested
	 * @returns Discovery result
	 */
	static async probe(
		createMessageFn: (systemPrompt: string, messages: any[], tools?: any[]) => AsyncGenerator<any>,
		modelId: string,
	): Promise<CapabilityDiscoveryResult> {
		const startTime = Date.now()
		const result: CapabilityDiscoveryResult = {
			supportsNativeToolCalling: false,
			toolCallingMode: "none",
			supportsReasoning: false,
			supportsStreaming: false,
			probeSuccessful: false,
			probeDurationMs: 0,
		}

		try {
			// Send probe with tools
			const stream = createMessageFn(
				"You are a helpful assistant. Please use the provided tools when asked.",
				PROBE_MESSAGES,
				[PROBE_TOOL] as any,
			)

			let fullText = ""
			let hasToolCalls = false
			let hasReasoning = false
			let reasoningFieldName: string | undefined
			let hasStreaming = false
			let chunkCount = 0

			for await (const chunk of stream) {
				chunkCount++
				if (chunkCount > 1) hasStreaming = true

				if (chunk.type === "tool_calls") {
					hasToolCalls = true
					// Native tool calls detected
					result.supportsNativeToolCalling = true
					result.toolCallingMode = "native"
				} else if (chunk.type === "text") {
					fullText += chunk.text || ""
				} else if (chunk.type === "reasoning") {
					hasReasoning = true
				}
			}

			// If no native tool calls, check text for other formats
			if (!hasToolCalls && fullText) {
				const parsedCalls = UniversalToolParser.parse({ content: fullText })
				if (parsedCalls.length > 0) {
					result.toolCallingMode = parsedCalls[0].sourceFormat as ToolCallingMode
				} else if (UniversalToolParser.containsToolCalls(fullText)) {
					// Contains tool-like patterns but couldn't parse
					result.toolCallingMode = "xml"
				} else {
					// Model responded with text but no tool calls
					result.toolCallingMode = "none"
				}
			}

			result.supportsReasoning = hasReasoning
			result.supportsStreaming = hasStreaming
			result.probeSuccessful = true

			// Register the discovered profile
			const registry = ModelCapabilityRegistry.getInstance()
			const existingProfile = registry.getProfile(modelId)

			registry.registerProfile({
				...existingProfile,
				modelId,
				toolCalling: result.toolCallingMode,
				reasoning: result.supportsReasoning,
				reasoningFieldName,
				autoDetected: true,
				lastVerified: Date.now(),
			})

			Logger.log(
				`[CapabilityDiscovery] Model ${modelId}: toolCalling=${result.toolCallingMode}, reasoning=${result.supportsReasoning}, streaming=${result.supportsStreaming}`,
			)
		} catch (error: any) {
			result.error = error.message
			Logger.error(`[CapabilityDiscovery] Probe failed for ${modelId}:`, error)
		}

		result.probeDurationMs = Date.now() - startTime
		return result
	}

	/**
	 * Quick check: send a minimal request to detect if the model
	 * supports native tool calling. This is faster than a full probe.
	 */
	static async quickProbe(
		createMessageFn: (systemPrompt: string, messages: any[], tools?: any[]) => AsyncGenerator<any>,
	): Promise<boolean> {
		try {
			const stream = createMessageFn(
				"Use the provided tool.",
				PROBE_MESSAGES,
				[PROBE_TOOL] as any,
			)

			for await (const chunk of stream) {
				if (chunk.type === "tool_calls") {
					return true
				}
			}
			return false
		} catch {
			return false
		}
	}
}