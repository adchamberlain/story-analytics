/**
 * Conversation store.
 */

import { writable, get } from 'svelte/store';
import type { Message, ConversationSummary, ClarifyingOption, ActionButton, QAResult } from '../types';
import {
	sendMessage as apiSendMessage,
	getConversation,
	newConversation,
	listConversations,
	deleteConversation as apiDeleteConversation,
	renameConversation as apiRenameConversation
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
	} catch (error) {
		console.error('Failed to load conversation:', error);
		messages.set([]);
		phase.set('intent');
		currentSessionId.set(null);
		currentTitle.set(null);
	}
}

/**
 * Switch to a different conversation.
 */
export async function switchConversation(sessionId: number): Promise<void> {
	await loadConversation(sessionId);
}

/**
 * Send a message and get response.
 */
export async function sendMessage(content: string): Promise<string> {
	conversationLoading.set(true);
	lastDashboard.set(null);

	// Check if this is an action (button click) - don't show in chat
	const isAction = content.startsWith('__action:');

	try {
		// Add user message immediately (unless it's an action)
		if (!isAction) {
			messages.update((msgs) => [...msgs, { role: 'user', content }]);
		}

		// Send to API with current session ID
		const sessionId = get(currentSessionId);
		const response = await apiSendMessage(content, sessionId ?? undefined);

		// Update session ID and title (in case a new one was created or title was generated)
		currentSessionId.set(response.session_id);
		if (response.title) {
			currentTitle.set(response.title);
		}

		// Add assistant response with clarifying options, action buttons, and QA result
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

		// Track dashboard creation with QA results
		if (response.dashboard_created && response.dashboard_url) {
			lastDashboard.set({
				url: response.dashboard_url,
				slug: response.dashboard_slug,
				created: true,
				qa_result: response.qa_result
			});
			// Refresh dashboard list in sidebar
			loadDashboards();
		}

		// Refresh conversation list to get updated titles
		await loadConversationList();

		return response.response;
	} finally {
		conversationLoading.set(false);
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
