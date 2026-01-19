/**
 * Conversation store.
 */

import { writable, get } from 'svelte/store';
import type { Message, ConversationSummary, ClarifyingOption, ActionButton, QAResult } from '../types';
import {
	sendMessage as apiSendMessage,
	sendMessageStream,
	getConversation,
	newConversation,
	listConversations,
	deleteConversation as apiDeleteConversation,
	renameConversation as apiRenameConversation,
	type ProgressEvent
} from '../api';
import { loadDashboards } from './dashboards';

// Extended message type with clarifying options, action buttons, and QA result
export interface ExtendedMessage extends Message {
	clarifying_options?: ClarifyingOption[] | null;
	action_buttons?: ActionButton[] | null;
	qa_result?: QAResult | null;
	error_context?: string | null;
}

// Current session ID
export const currentSessionId = writable<number | null>(null);

// Current session title
export const currentTitle = writable<string | null>(null);

// Messages store (with clarifying options)
export const messages = writable<ExtendedMessage[]>([]);

// Current phase
export const phase = writable<string>('intent');

// Loading state
export const conversationLoading = writable<boolean>(false);

// Last created dashboard with QA results
export interface LastDashboardInfo {
	url: string;
	slug: string | null;
	created: boolean;
	qa_result: QAResult | null;
}
export const lastDashboard = writable<LastDashboardInfo | null>(null);

// List of all conversations
export const conversationList = writable<ConversationSummary[]>([]);

// Track if conversation is complete (user clicked "Done")
export const conversationComplete = writable<boolean>(false);

// Progress tracking for streaming responses
export interface ProgressStep {
	step: string;
	status: 'pending' | 'in_progress' | 'completed' | 'failed';
	message: string;
	details?: string;
}
export const progressSteps = writable<ProgressStep[]>([]);
export const isStreaming = writable<boolean>(false);

// Human-readable step labels
const STEP_LABELS: Record<string, string> = {
	requirements: 'Analyzing request',
	feasibility: 'Checking data availability',
	sql: 'Generating SQL',
	layout: 'Building layout',
	validation: 'Validating',
	writing: 'Creating file',
	qa: 'Quality check',
	complete: 'Complete'
};

function getStepLabel(step: string): string {
	return STEP_LABELS[step] || step;
}

/**
 * Check if a response indicates the conversation is complete (has view_dashboard action).
 */
function checkConversationComplete(actionButtons: Array<{ id: string }> | null | undefined): boolean {
	if (!actionButtons) return false;
	return actionButtons.some((btn) => btn.id.startsWith('view_dashboard:'));
}

/**
 * Load the list of all conversations.
 */
export async function loadConversationList(): Promise<void> {
	try {
		const response = await listConversations();
		conversationList.set(response.conversations);
	} catch (error) {
		console.error('Failed to load conversation list:', error);
		conversationList.set([]);
	}
}

/**
 * Load existing conversation (current or by ID).
 */
export async function loadConversation(sessionId?: number): Promise<void> {
	try {
		const session = await getConversation(sessionId);
		currentSessionId.set(session.id);
		currentTitle.set(session.title);
		messages.set(session.messages);
		phase.set(session.phase);
		lastDashboard.set(null);
		conversationComplete.set(false);
	} catch (error) {
		console.error('Failed to load conversation:', error);
		messages.set([]);
		phase.set('intent');
		currentSessionId.set(null);
		currentTitle.set(null);
		conversationComplete.set(false);
	}
}

/**
 * Switch to a different conversation.
 */
export async function switchConversation(sessionId: number): Promise<void> {
	await loadConversation(sessionId);
}

/**
 * Check if an action should use streaming (for long-running operations).
 */
function shouldUseStreaming(content: string): boolean {
	if (!content.startsWith('__action:')) return false;
	const action = content.slice(9).toLowerCase();
	// Actions that trigger dashboard generation should use streaming
	return ['generate', 'generate_now', 'retry'].includes(action);
}

/**
 * Handle a progress event from the stream.
 */
function handleProgressEvent(event: ProgressEvent): void {
	progressSteps.update((steps) => {
		// Find existing step or add new one
		const existingIndex = steps.findIndex((s) => s.step === event.step);
		const newStep: ProgressStep = {
			step: event.step,
			status: event.status,
			message: event.message,
			details: event.details
		};

		if (existingIndex >= 0) {
			// Update existing step
			const updated = [...steps];
			updated[existingIndex] = newStep;
			return updated;
		} else {
			// Add new step
			return [...steps, newStep];
		}
	});
}

/**
 * Send a message and get response (with streaming support for generation).
 */
export async function sendMessage(content: string): Promise<string> {
	conversationLoading.set(true);
	lastDashboard.set(null);

	// Check if this is an action (button click) - don't show in chat
	const isAction = content.startsWith('__action:');
	const useStreaming = shouldUseStreaming(content);

	// Reset progress for streaming
	if (useStreaming) {
		progressSteps.set([]);
		isStreaming.set(true);
	}

	try {
		// Add user message immediately (unless it's an action)
		if (!isAction) {
			messages.update((msgs) => [...msgs, { role: 'user', content }]);
		}

		const sessionId = get(currentSessionId);

		if (useStreaming) {
			// Use streaming endpoint for generation actions
			return new Promise((resolve, reject) => {
				sendMessageStream(content, sessionId ?? undefined, {
					onProgress: (event) => {
						handleProgressEvent(event);
					},
					onComplete: async (response) => {
						isStreaming.set(false);

						// Update session ID and title
						currentSessionId.set(response.session_id);
						if (response.title) {
							currentTitle.set(response.title);
						}

						// Add assistant response
						messages.update((msgs) => [
							...msgs,
							{
								role: 'assistant',
								content: response.response,
								clarifying_options: response.clarifying_options,
								action_buttons: response.action_buttons,
								qa_result: response.qa_result,
								error_context: response.error_context
							}
						]);

						// Update phase
						phase.set(response.phase);

						// Track dashboard creation
						if (response.dashboard_created && response.dashboard_url) {
							lastDashboard.set({
								url: response.dashboard_url,
								slug: response.dashboard_slug,
								created: true,
								qa_result: response.qa_result
							});
							loadDashboards();
						}

						// Check if conversation is complete
						if (checkConversationComplete(response.action_buttons)) {
							conversationComplete.set(true);
						}

						// Clear progress after a short delay
						setTimeout(() => progressSteps.set([]), 2000);

						await loadConversationList();
						conversationLoading.set(false);
						resolve(response.response);
					},
					onError: (error) => {
						isStreaming.set(false);
						progressSteps.set([]);
						conversationLoading.set(false);
						reject(new Error(error));
					}
				});
			});
		} else {
			// Use regular endpoint for non-generation actions
			const response = await apiSendMessage(content, sessionId ?? undefined);

			// Update session ID and title
			currentSessionId.set(response.session_id);
			if (response.title) {
				currentTitle.set(response.title);
			}

			// Add assistant response
			messages.update((msgs) => [
				...msgs,
				{
					role: 'assistant',
					content: response.response,
					clarifying_options: response.clarifying_options,
					action_buttons: response.action_buttons,
					qa_result: response.qa_result,
					error_context: response.error_context
				}
			]);

			// Update phase
			phase.set(response.phase);

			// Track dashboard creation
			if (response.dashboard_created && response.dashboard_url) {
				lastDashboard.set({
					url: response.dashboard_url,
					slug: response.dashboard_slug,
					created: true,
					qa_result: response.qa_result
				});
				loadDashboards();
			}

			// Check if conversation is complete
			if (checkConversationComplete(response.action_buttons)) {
				conversationComplete.set(true);
			}

			await loadConversationList();
			return response.response;
		}
	} finally {
		if (!useStreaming) {
			conversationLoading.set(false);
		}
	}
}

/**
 * Start a new conversation.
 */
export async function startNewConversation(): Promise<void> {
	try {
		const session = await newConversation();
		currentSessionId.set(session.id);
		currentTitle.set(session.title);
		messages.set([]);
		phase.set('intent');
		lastDashboard.set(null);
		conversationComplete.set(false);

		// Refresh conversation list
		await loadConversationList();
	} catch (error) {
		console.error('Failed to start new conversation:', error);
	}
}

/**
 * Delete a conversation and refresh the list.
 */
export async function deleteConversation(sessionId: number): Promise<void> {
	try {
		await apiDeleteConversation(sessionId);

		// If we deleted the current conversation, start a new one
		const currentId = get(currentSessionId);
		if (currentId === sessionId) {
			await startNewConversation();
		} else {
			// Just refresh the list
			await loadConversationList();
		}
	} catch (error) {
		console.error('Failed to delete conversation:', error);
		throw error;
	}
}

/**
 * Rename a conversation.
 */
export async function renameConversation(sessionId: number, title: string): Promise<void> {
	try {
		await apiRenameConversation(sessionId, title);

		// Update current title if this is the active conversation
		const currentId = get(currentSessionId);
		if (currentId === sessionId) {
			currentTitle.set(title);
		}

		// Refresh the list
		await loadConversationList();
	} catch (error) {
		console.error('Failed to rename conversation:', error);
		throw error;
	}
}
