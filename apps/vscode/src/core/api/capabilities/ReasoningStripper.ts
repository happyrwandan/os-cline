/**
 * Reasoning Content Stripper for the Model Adaptation Layer
 *
 * Many open-source models include reasoning/thinking content in their
 * responses that can interfere with tool parsing. This module:
 *
 * 1. Strips reasoning fields from API responses before tool parsing
 * 2. Separates reasoning from answer content for display
 * 3. Prevents reasoning markers from leaking into conversation history
 *
 * Supported reasoning field names:
 * - reasoning_content (DeepSeek, Qwen, Kimi, GLM, LongCat)
 * - thinking (Claude, some Anthropic-compatible)
 * - analysis (some models)
 * - scratchpad (some models)
 */

import { ModelCapabilityProfile } from "./ModelCapabilities"
import { Logger } from "@/shared/services/Logger"

/**
 * Known reasoning field names across different model providers
 */
export const KNOWN_REASONING_FIELDS = [
	"reasoning_content",  // DeepSeek, Qwen, Kimi, GLM, LongCat, MiMo
	"thinking",           // Claude, Anthropic-compatible
	"analysis",           // Some models
	"scratchpad",         // Some models
	"thought",            // Some models
	"inner_monologue",    // Some models
] as const

/**
 * Reasoning channels - separates thinking from answer
 */
export interface ReasoningChannels {
	/** The reasoning/thinking content */
	reasoning?: string
	/** The actual answer content */
	answer?: string
	/** The field name the reasoning was found in */
	reasoningField?: string
}

/**
 * Strip reasoning content from a streaming chunk.
 * Used in the OpenRouter and OpenAI-compatible provider handlers
 * to prevent reasoning tokens from interfering with tool call parsing.
 */
export function stripReasoningFromChunk(
	chunk: any,
	profile: ModelCapabilityProfile,
): { cleanedChunk: any; reasoningContent?: string } {
	if (!profile.stripReasoningBeforeToolParsing) {
		return { cleanedChunk: chunk }
	}

	if (!chunk || typeof chunk !== "object") {
		return { cleanedChunk: chunk }
	}

	let reasoningContent: string | undefined

	// Check for reasoning in delta (streaming format)
	if (chunk.choices?.[0]?.delta) {
		const delta = chunk.choices[0].delta

		// Check known reasoning fields
		for (const field of KNOWN_REASONING_FIELDS) {
			if (field in delta && delta[field]) {
				reasoningContent = typeof delta[field] === "string"
					? delta[field]
					: JSON.stringify(delta[field])

				// Remove from delta to prevent interference with tool parsing
				delete delta[field]
				break
			}
		}
	}

	// Check for reasoning in message (non-streaming format)
	if (chunk.choices?.[0]?.message) {
		const message = chunk.choices[0].message

		for (const field of KNOWN_REASONING_FIELDS) {
			if (field in message && message[field]) {
				reasoningContent = typeof message[field] === "string"
					? message[field]
					: JSON.stringify(message[field])

				delete message[field]
				break
			}
		}
	}

	// Check top-level response fields
	for (const field of KNOWN_REASONING_FIELDS) {
		if (field in chunk && chunk[field]) {
			if (!reasoningContent) {
				reasoningContent = typeof chunk[field] === "string"
					? chunk[field]
					: JSON.stringify(chunk[field])
			}
			delete chunk[field]
		}
	}

	return { cleanedChunk: chunk, reasoningContent }
}

/**
 * Separate reasoning from answer content in a complete response.
 * Useful for displaying reasoning separately in the UI.
 */
export function separateReasoningFromResponse(response: any): ReasoningChannels {
	const channels: ReasoningChannels = {}

	if (!response || typeof response !== "object") {
		channels.answer = typeof response === "string" ? response : ""
		return channels
	}

	// Check for reasoning in various locations
	for (const field of KNOWN_REASONING_FIELDS) {
		// Top-level
		if (response[field]) {
			channels.reasoning = typeof response[field] === "string"
				? response[field]
				: JSON.stringify(response[field])
			channels.reasoningField = field
			break
		}

		// In choices[0].message
		if (response.choices?.[0]?.message?.[field]) {
			const value = response.choices[0].message[field]
			channels.reasoning = typeof value === "string" ? value : JSON.stringify(value)
			channels.reasoningField = field
			break
		}

		// In content blocks (Anthropic format)
		if (Array.isArray(response.content)) {
			const thinkingBlock = response.content.find(
				(block: any) => block.type === "thinking" || block.type === "reasoning"
			)
			if (thinkingBlock) {
				channels.reasoning = thinkingBlock.thinking || thinkingBlock.reasoning || ""
				channels.reasoningField = "content_block"
				break
			}
		}
	}

	// Extract answer content
	if (typeof response.content === "string") {
		channels.answer = response.content
	} else if (Array.isArray(response.content)) {
		channels.answer = response.content
			.filter((block: any) => block.type === "text")
			.map((block: any) => block.text)
			.join("\n")
	} else if (response.choices?.[0]?.message?.content) {
		channels.answer = response.choices[0].message.content
	}

	return channels
}

/**
 * Check if a response contains reasoning content
 */
export function hasReasoningContent(response: any): boolean {
	if (!response || typeof response !== "object") return false

	for (const field of KNOWN_REASONING_FIELDS) {
		if (response[field] || response.choices?.[0]?.message?.[field]) {
			return true
		}
	}

	if (Array.isArray(response.content)) {
		return response.content.some(
			(block: any) => block.type === "thinking" || block.type === "reasoning"
		)
	}

	return false
}