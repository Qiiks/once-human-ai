const chatHistoryMap = new Map();

function getHistory(channelId) {
    return chatHistoryMap.get(channelId) || [];
}

function addMessage(channelId, role, content) {
    const history = getHistory(channelId);
    history.push({ role, parts: [{ text: content }] });

    if (history.length > 10) {
        history.splice(0, history.length - 10); // Keep only the last 10 messages
    }

    chatHistoryMap.set(channelId, history);
}

function clearHistory(channelId) {
    chatHistoryMap.delete(channelId);
}

module.exports = { getHistory, addMessage, clearHistory };
