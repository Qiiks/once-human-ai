function splitMessage(content, maxLength = 2000) {
    if (content.length <= maxLength) {
        return [content];
    }

    const chunks = [];
    let tempStr = content;
    while (tempStr.length > 0) {
        if (tempStr.length <= maxLength) {
            chunks.push(tempStr);
            break;
        }
        // Find the last newline before the maxLength character limit
        let splitIndex = tempStr.lastIndexOf('\n', maxLength);
        // If no newline is found, find the last space
        if (splitIndex === -1) {
            splitIndex = tempStr.lastIndexOf(' ', maxLength);
        }
        // If no space is found, just split at maxLength
        if (splitIndex === -1) {
            splitIndex = maxLength;
        }
        chunks.push(tempStr.substring(0, splitIndex));
        tempStr = tempStr.substring(splitIndex).trim();
    }
    return chunks;
}

async function sendReply(replyable, content) {
    const chunks = splitMessage(content);

    // Check if this is an interaction (slash command) or a message
    if (replyable.followUp) { // Likely an interaction
        await replyable.followUp(chunks);
    } else if (replyable.edit) { // Likely a message we can edit (e.g., "Thinking...")
        await replyable.edit(chunks);
    } else { // A regular message channel
        await replyable.send(chunks);
    }

    // Send the rest of the chunks as new messages
    const channel = replyable.channel || (replyable.message ? replyable.message.channel : null);
    if (channel) {
        for (let i = 1; i < chunks.length; i++) {
            await channel.send(chunks[i]);
        }
    }
}

module.exports = {
    splitMessage,
    sendReply,
};