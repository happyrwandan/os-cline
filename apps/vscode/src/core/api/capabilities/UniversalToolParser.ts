/**
 * Universal Tool Parser for the Model Adaptation Layer
 *
 * Normalizes tool calls from any model output format into a single
 * NormalizedToolCall interface. Supports:
 * - OpenAI native tool_calls
 * - Anthropic tool_use content blocks
 * - XML-formatted tool calls (DeepSeek-R1 style)
 * - JSON action blocks (Llama/LangChain style)
 * - ReAct style commands
 *
 * This ensures Cline can work with any model regardless of its
 * tool calling format.
 */

import { Logger } from "@/shared/services/Logger"

/**
 * Normalized tool call - the universal format all tool calls are converted to
 */
export interface NormalizedToolCall {
	/** Unique ID for this tool call */
	id: string
	/** Name of the tool to call */
	name: string
	/** Arguments to pass to the tool (parsed object) */
	arguments: Record<string, any>
	/** The raw format this was parsed from */
	sourceFormat: "native" | "xml" | "json" | "react" | "text"
}

/**
 * Parse tool calls from an OpenAI-format response (native tool_calls)
 */
function parseOpenAIToolCalls(response: any): NormalizedToolCall[] {
	if (!response?.tool_calls?.length) return []

	return response.tool_calls
		.filter((tc: any) => tc?.type === "function" && tc.function)
		.map((tc: any): NormalizedToolCall => {
			let parsedArgs = {}
			try {
				parsedArgs = typeof tc.function.arguments === "string"
					? JSON.parse(tc.function.arguments)
					: tc.function.arguments || {}
			} catch {
				Logger.error(`[UniversalToolParser] Failed to parse tool arguments for ${tc.function?.name}`)
			}
			return {
				id: tc.id || generateToolCallId(),
				name: tc.function.name || "_unknown_",
				arguments: parsedArgs,
				sourceFormat: "native",
			}
		})
}

/**
 * Parse tool calls from an Anthropic-format response (tool_use content blocks)
 */
function parseAnthropicToolUse(response: any): NormalizedToolCall[] {
	if (!response?.content?.length) return []

	return response.content
		.filter((block: any) => block.type === "tool_use")
		.map((block: any): NormalizedToolCall => ({
			id: block.id || generateToolCallId(),
			name: block.name || "_unknown_",
			arguments: block.input || {},
			sourceFormat: "native",
		}))
}

/**
 * Parse XML-formatted tool calls from text content.
 * Handles formats like:
 *   <tool_call>
 *   {"name": "execute_command", "arguments": {"command": "ls"}}
 *   </tool_call>
 *
 *   <function_call>
 *   {"name": "read_file", "arguments": {"path": "/tmp/test.txt"}}
 *   </function_call>
 *
 *   <tool>
 *   {"name": "write_to_file", "arguments": {"path": "/tmp/out.txt", "content": "hello"}}
 *   </tool>
 */
function parseXmlToolCalls(text: string): NormalizedToolCall[] {
	const results: NormalizedToolCall[] = []

	// Match various XML tool call formats
	const xmlPatterns = [
		/<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g,
		/<function_call>\s*([\s\S]*?)\s*<\/function_call>/g,
		/<tool>\s*([\s\S]*?)\s*<\/tool>/g,
		/<invoke>\s*([\s\S]*?)\s*<\/invoke>/g,
	]

	for (const pattern of xmlPatterns) {
		let match: RegExpExecArray | null
		while ((match = pattern.exec(text)) !== null) {
			try {
				const content = match[1].trim()
				const parsed = JSON.parse(content)
				results.push({
					id: generateToolCallId(),
					name: parsed.name || parsed.function?.name || "_unknown_",
					arguments: parsed.arguments || parsed.parameters || parsed.function?.arguments || {},
					sourceFormat: "xml",
				})
			} catch {
				// Try name-only format: <tool_call>tool_name</tool_call>
				const content = match[1].trim()
				if (content && !content.startsWith("{")) {
					results.push({
						id: generateToolCallId(),
						name: content,
						arguments: {},
						sourceFormat: "xml",
					})
				}
			}
		}
	}

	return results
}

/**
 * Parse JSON action blocks from text content.
 * Handles formats like:
 *   {"action": "terminal", "command": "ls -la"}
 *   {"tool": "read_file", "path": "/tmp/test.txt"}
 */
function parseJsonActionBlocks(text: string): NormalizedToolCall[] {
	const results: NormalizedToolCall[] = []

	// Match JSON objects that look like action/tool calls
	const jsonPattern = /```json\s*([\s\S]*?)\s*```/g
	let match: RegExpExecArray | null
	while ((match = jsonPattern.exec(text)) !== null) {
		try {
			const parsed = JSON.parse(match[1].trim())
			if (parsed.action || parsed.tool || parsed.name) {
				results.push({
					id: generateToolCallId(),
					name: parsed.action || parsed.tool || parsed.name,
					arguments: parsed.arguments || parsed.params || parsed,
					sourceFormat: "json",
				})
			}
		} catch {
			// Not valid JSON, skip
		}
	}

	return results
}

/**
 * Parse ReAct-style tool calls from text content.
 * Handles formats like:
 *   Action: execute_command
 *   Action Input: {"command": "ls -la"}
 *
 *   Thought: I need to read the file
 *   Action: read_file
 *   Action Input: /tmp/test.txt
 */
function parseReActToolCalls(text: string): NormalizedToolCall[] {
	const results: NormalizedToolCall[] = []
	const reactPattern = /Action:\s*(\w+)\s*\n\s*Action Input:\s*([\s\S]*?)(?=\n\s*(?:Action:|Observation:|$))/gi

	let match: RegExpExecArray | null
	while ((match = reactPattern.exec(text)) !== null) {
		const name = match[1].trim()
		let args: Record<string, any> = {}
		try {
			args = JSON.parse(match[2].trim())
		} catch {
			// If not JSON, treat as a single string argument
			args = { input: match[2].trim() }
		}
		results.push({
			id: generateToolCallId(),
			name,
			arguments: args,
			sourceFormat: "react",
		})
	}

	return results
}

/**
 * Parse text content that looks like a tool call intent.
 * This is the fallback for models that describe tool calls in natural language
 * instead of structured formats.
 *
 * Handles patterns like:
 *   "I'll run the command: ls -la"
 *   "Let me read the file /tmp/test.txt"
 *   "I need to write to /tmp/out.txt with content: hello"
 */
function parseTextToolIntents(text: string): NormalizedToolCall[] {
	const results: NormalizedToolCall[] = []

	// Command execution intent
	const commandPatterns = [
		/(?:run|execute|type|enter)\s+(?:the\s+)?(?:command|cmd):\s*`?([^`\n]+)`?/gi,
		/(?:I'll|I will|let me|I need to)\s+(?:run|execute)\s+(?:the\s+)?(?:command|cmd):\s*`?([^`\n]+)`?/gi,
	]

	for (const pattern of commandPatterns) {
		let match: RegExpExecArray | null
		while ((match = pattern.exec(text)) !== null) {
			results.push({
				id: generateToolCallId(),
				name: "execute_command",
				arguments: { command: match[1].trim() },
				sourceFormat: "text",
			})
		}
	}

	return results
}

/**
 * Generate a unique tool call ID
 */
function generateToolCallId(): string {
	return `call_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

/**
 * Universal Tool Parser
 *
 * Main entry point for parsing tool calls from any model response.
 * Tries each format in order of reliability and returns the first
 * successful parse.
 */
export class UniversalToolParser {
	/**
	 * Parse tool calls from a model response.
	 *
	 * @param response - The raw model response object or text string
	 * @param preferredFormat - Optional hint about the expected format
	 * @returns Array of normalized tool calls
	 */
	static parse(response: any, preferredFormat?: string): NormalizedToolCall[] {
		// 1. Try OpenAI native tool_calls
		if (response?.tool_calls?.length) {
			const result = parseOpenAIToolCalls(response)
			if (result.length > 0) return result
		}

		// 2. Try Anthropic tool_use content blocks
		if (response?.content?.some?.((x: any) => x.type === "tool_use")) {
			const result = parseAnthropicToolUse(response)
			if (result.length > 0) return result
		}

		// 3. Get text content for text-based parsing
		const textContent = typeof response === "string"
			? response
			: response?.content
				? (typeof response.content === "string"
					? response.content
					: Array.isArray(response.content)
						? response.content
							.filter((c: any) => c.type === "text")
							.map((c: any) => c.text)
							.join("\n")
						: "")
				: response?.choices?.[0]?.message?.content || ""

		if (!textContent) return []

		// 4. Try XML tool calls
		const xmlResults = parseXmlToolCalls(textContent)
		if (xmlResults.length > 0) return xmlResults

		// 5. Try JSON action blocks
		const jsonResults = parseJsonActionBlocks(textContent)
		if (jsonResults.length > 0) return jsonResults

		// 6. Try ReAct style
		const reactResults = parseReActToolCalls(textContent)
		if (reactResults.length > 0) return reactResults

		// 7. Try text intent parsing (lowest confidence)
		if (preferredFormat === "text") {
			const textResults = parseTextToolIntents(textContent)
			if (textResults.length > 0) return textResults
		}

		return []
	}

	/**
	 * Check if a text response contains tool calls in any format
	 */
	static containsToolCalls(text: string): boolean {
		return (
			/<tool_call>/.test(text) ||
			/<function_call>/.test(text) ||
			/<tool>/.test(text) ||
			/<invoke>/.test(text) ||
			/Action:\s*\w+/i.test(text) ||
			/"action"\s*:/.test(text) ||
			/"tool"\s*:/.test(text)
		)
	}

	/**
	 * Strip reasoning content from a response before tool parsing.
	 * Removes fields like reasoning_content, thinking, analysis, scratchpad
	 * that some models include in their responses.
	 */
	static stripReasoningContent(response: any, reasoningFieldNames: string[] = ["reasoning_content", "thinking", "analysis", "scratchpad"]): any {
		if (!response || typeof response !== "object") return response

		const cleaned = { ...response }

		// Strip from top-level response
		for (const field of reasoningFieldNames) {
			if (field in cleaned) {
				delete cleaned[field]
			}
		}

		// Strip from content blocks (Anthropic format)
		if (Array.isArray(cleaned.content)) {
			cleaned.content = cleaned.content.filter((block: any) =>
				block.type !== "thinking" && block.type !== "reasoning"
			)
		}

		// Strip from choices (OpenAI format)
		if (cleaned.choices?.[0]?.message) {
			for (const field of reasoningFieldNames) {
				if (field in cleaned.choices[0].message) {
					delete cleaned.choices[0].message[field]
				}
			}
		}

		return cleaned
	}
}