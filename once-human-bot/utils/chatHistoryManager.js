const chatState = new Map();
const SUMMARIZE_THRESHOLD = 8; // Summarize after 8 messages (4 user, 4 bot)

// Helper function to get the current state for a channel
function _getChannelState(channelId) {
    if (!chatState.has(channelId)) {
        chatState.set(channelId, {
            summary: "The conversation has just begun.",
            recentMessages: [],
            isSummarizing: false,
        });
    }
    return chatState.get(channelId);
}

// New getHistory function that combines summary and recent messages
function getHistory(channelId) {
    const state = _getChannelState(channelId);

    // If there are no recent messages, we can't inject a summary. Return an empty history.
    if (state.recentMessages.length === 0) {
        return [];
    }

    // Create a deep copy to avoid mutating the original state
    const history = JSON.parse(JSON.stringify(state.recentMessages));

    // Find the first user message to prepend the summary to.
    const firstUserMessageIndex = history.findIndex(msg => msg.role === 'user');

    if (firstUserMessageIndex !== -1) {
        // Prepend the summary to the first user message's content
        const summaryText = `(This is a summary of our conversation so far: ${state.summary})\n\n`;
        history[firstUserMessageIndex].parts[0].text = summaryText + history[firstUserMessageIndex].parts[0].text;
    }
    // If there's no user message, we just return the history as-is. The API call will fail if it doesn't start with a user message,
    // but the calling code is responsible for ensuring a valid history structure. This function's job is just to inject the summary correctly.

    return history;
}

// New addMessage function that triggers summarization
async function addMessage(channelId, role, author, content, client) {
    const state = _getChannelState(channelId);

    const messageContent = (role === 'user') ? `${author}: ${content}` : content;
    state.recentMessages.push({ role, parts: [{ text: messageContent }] });

    // Non-blocking summarization trigger
    if (state.recentMessages.length >= SUMMARIZE_THRESHOLD && !state.isSummarizing) {
        _summarizeAndStore(channelId, client);
    }
}

// The core summarization logic
async function _summarizeAndStore(channelId, client) {
    const state = _getChannelState(channelId);
    state.isSummarizing = true;
    console.log(`[History] Summarization triggered for channel ${channelId}`);

    try {
        const summarizationPrompt = `
You are a conversation summarizer. Condense the following chat history into a single, concise paragraph.
Focus on key topics, user questions, and important entities mentioned.
Do not add any conversational fluff. Just provide the summary.

Previous Summary:
${state.summary}

Recent Messages to Summarize:
${state.recentMessages.map(msg => `${msg.role}: ${msg.parts[0].text}`).join('\n')}
`;

        // Use a cost-effective model for summarization
        const model = client.geminiFallback; // or a specific cheap model
        const result = await model.generateContent(summarizationPrompt);
        const newSummary = result.response.text();

        // Update the state
        state.summary = newSummary;
        state.recentMessages = []; // Clear the recent messages
        console.log(`[History] Summarization complete for channel ${channelId}`);

    } catch (error) {
        console.error(`[History] Summarization failed for channel ${channelId}:`, error);
        // Optional: Decide how to handle failure, e.g., try again later or just keep growing the recent history for now.
    } finally {
        state.isSummarizing = false; // Allow future summarizations
    }
}

function clearHistory(channelId) {
    chatState.delete(channelId);
}

module.exports = { getHistory, addMessage, clearHistory };
