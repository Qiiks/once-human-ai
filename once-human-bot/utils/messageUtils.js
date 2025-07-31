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
    const firstChunk = chunks.shift(); // Get the first chunk and remove it from the array

    // Determine the channel to send subsequent messages to
    const channel = replyable.channel || (replyable.message ? replyable.message.channel : null);

    // Check if this is an interaction (slash command) or a message
    if (replyable.followUp) { // Likely an interaction
        // For interactions, we use followUp for all messages
        await replyable.followUp(firstChunk);
        for (const chunk of chunks) {
            await replyable.followUp(chunk);
        }
    } else if (replyable.edit) { // Likely a message we can edit (e.g., "Thinking...")
        await replyable.edit(firstChunk);
        // Send subsequent chunks as new messages in the same channel
        if (channel) {
            for (const chunk of chunks) {
                await channel.send(chunk);
            }
        }
    } else if (channel) { // A regular message channel, not an interaction or editable message
        await channel.send(firstChunk);
        for (const chunk of chunks) {
            await channel.send(chunk);
        }
    } else {
        console.error("Could not determine the channel to send the reply to.");
    }
}

module.exports = {
    splitMessage,
    sendReply,
};