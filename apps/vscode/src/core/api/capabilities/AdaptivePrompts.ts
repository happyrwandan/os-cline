/**
 * Adaptive Prompt System for the Model Adaptation Layer
 *
 * Different models respond better to different prompt styles.
 * This system provides model-family-specific prompt additions that
 * improve tool calling reliability for open-source models.
 *
 * Instead of one-size-fits-all prompts, we adapt the system prompt
 * based on the model's capability profile.
 */

import { ModelCapabilityProfile } from "./ModelCapabilities"

/**
 * Prompt additions for models that need explicit tool instructions
 */
const EXPLICIT_TOOL_INSTRUCTIONS = `
IMPORTANT: When you need to perform an action, you MUST call the appropriate tool. Do NOT describe what you would do - actually call the tool.

Available tools are provided to you. Use them when needed.
- To execute a command: call execute_command with the command
- To read a file: call read_file with the file path
- To write a file: call write_to_file with the path and content
- To search files: call search_files with the search pattern

Always prefer calling tools over describing actions.
`

/**
 * Prompt additions for XML tool calling models
 */
const XML_TOOL_INSTRUCTIONS = `
When you need to use a tool, output your tool call in this exact format:
<tool_call>
{"name": "tool_name", "arguments": {"param1": "value1"}}
</tool_call>

Do NOT use any other format for tool calls. Always use the tool_call tags.
`

/**
 * Prompt additions for reasoning models
 */
const REASONING_MODEL_INSTRUCTIONS = `
You have a reasoning/thinking capability. Use it to plan your approach before taking actions.
Think step by step, then call the appropriate tools to implement your plan.
`

/**
 * Prompt additions for local/small models
 */
const LOCAL_MODEL_INSTRUCTIONS = `
You are an AI coding assistant. Be concise and direct.
When you need to perform an action, call the appropriate tool immediately.
Do not explain what you will do - just do it.
If you are unsure about something, ask for clarification.
`

/**
 * Prompt additions for open models that may not follow instructions well
 */
const OPEN_MODEL_INSTRUCTIONS = `
You have access to tools that can help you accomplish tasks.
When you need to:
- Run a command → call execute_command
- Read a file → call read_file
- Write a file → call write_to_file
- Search code → call search_files

DO NOT write out what you would do. Instead, CALL THE TOOL directly.
`

/**
 * Get adaptive prompt additions based on a model's capability profile.
 *
 * These additions are appended to the system prompt to improve
 * tool calling reliability for different model families.
 */
export function getAdaptivePromptAdditions(profile: ModelCapabilityProfile): string {
	const additions: string[] = []

	// Add prompt style-specific instructions
	switch (profile.promptStyle) {
		case "reasoning":
			additions.push(REASONING_MODEL_INSTRUCTIONS)
			if (profile.toolCalling === "xml") {
				additions.push(XML_TOOL_INSTRUCTIONS)
			}
			break
		case "open-model":
			additions.push(OPEN_MODEL_INSTRUCTIONS)
			if (profile.prefersExplicitToolInstructions) {
				additions.push(EXPLICIT_TOOL_INSTRUCTIONS)
			}
			break
		case "local-model":
			additions.push(LOCAL_MODEL_INSTRUCTIONS)
			additions.push(EXPLICIT_TOOL_INSTRUCTIONS)
			break
		case "openai":
			// OpenAI-compatible models generally work well with default prompts
			if (profile.prefersExplicitToolInstructions) {
				additions.push(EXPLICIT_TOOL_INSTRUCTIONS)
			}
			break
		case "claude":
			// Claude models work well with default prompts
			break
	}

	// Add XML tool instructions if needed
	if (profile.toolCalling === "xml" && profile.promptStyle !== "reasoning") {
		additions.push(XML_TOOL_INSTRUCTIONS)
	}

	// Add explicit tool instructions for models that need them
	if (profile.prefersExplicitToolInstructions && !additions.includes(EXPLICIT_TOOL_INSTRUCTIONS)) {
		additions.push(EXPLICIT_TOOL_INSTRUCTIONS)
	}

	return additions.join("\n")
}

/**
 * Get a modified system prompt for a specific model.
 * Takes the base system prompt and adds model-specific instructions.
 */
export function getAdaptiveSystemPrompt(baseSystemPrompt: string, profile: ModelCapabilityProfile): string {
	const additions = getAdaptivePromptAdditions(profile)
	if (!additions) return baseSystemPrompt

	return `${baseSystemPrompt}\n\n---\nModel-Specific Instructions:\n${additions}`
}