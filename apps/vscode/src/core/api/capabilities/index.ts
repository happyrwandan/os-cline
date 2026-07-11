/**
 * Universal Model Adaptation Layer
 *
 * This module provides a model-agnostic capability system for Cline.
 * Instead of hardcoding provider-based assumptions about model behavior,
 * it uses per-model capability profiles to adapt tool calling, reasoning
 * handling, and prompt construction.
 *
 * Architecture:
 *
 *   Cline Agent Core
 *         |
 *   Model Adaptation Layer (this module)
 *         |
 *   +-----+-----+-----+
 *   |     |     |     |
 * Claude  GPT  Open  Local
 *                Model  vLLM
 *
 * Key components:
 * - ModelCapabilityRegistry: Per-model capability profiles
 * - UniversalToolParser: Normalize all tool call formats
 * - CapabilityDiscovery: Auto-detect model capabilities
 * - AdaptivePrompts: Model-family-specific prompt additions
 * - ReasoningStripper: Handle reasoning/thinking tokens
 */

export { ModelCapabilityRegistry } from "./ModelCapabilities"
export type { ModelCapabilityProfile, ToolCallingMode } from "./ModelCapabilities"

export { UniversalToolParser } from "./UniversalToolParser"
export type { NormalizedToolCall } from "./UniversalToolParser"

export { CapabilityDiscovery } from "./CapabilityDiscovery"
export type { CapabilityDiscoveryResult } from "./CapabilityDiscovery"

export { getAdaptivePromptAdditions, getAdaptiveSystemPrompt } from "./AdaptivePrompts"

export {
	stripReasoningFromChunk,
	separateReasoningFromResponse,
	hasReasoningContent,
	KNOWN_REASONING_FIELDS,
} from "./ReasoningStripper"
export type { ReasoningChannels } from "./ReasoningStripper"