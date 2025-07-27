const { LocalRAGSystem } = require('../utils/localRAG');
const { getHistory, addMessage } = require('../utils/chatHistoryManager');
const axios = require('axios');

// Initialize the RAG system
const ragSystem = new LocalRAGSystem();

module.exports = {
    name: 'messageCreate',
    async execute(message, client) {
        // Ignore bot messages
        if (message.author.bot) return;

        const assignedChannelId = client.config.channelId;
        const channelId = message.channel.id;

        // Ignore messages starting with '!' in the auto-reply channel, unless it's a command for this bot.
        if (channelId === assignedChannelId && message.content.startsWith('!') && !message.content.toLowerCase().startsWith('!oh')) {
            return;
        }
        
        const isValidCommand = channelId === assignedChannelId ||
                             message.content.toLowerCase().startsWith('!oh') ||
                             message.content.startsWith('OH');
        
        // Only process commands meant for the bot
        if (!isValidCommand) return;

        // Prevent duplicate processing
        if (message.processed) return;
        message.processed = true;

        let finalResponse = null;
        let thinkingMessage = null;

        try {
            console.log('Attempting to send initial "Thinking..." message.');
            thinkingMessage = await message.channel.send('Thinking...');
            console.log('Initial "Thinking..." message sent. Message ID:', thinkingMessage.id);
            
            // Check RAG service health before proceeding
            try {
                const isHealthy = await ragSystem.checkHealth();
                if (!isHealthy) {
                    throw new Error('RAG service is not available');
                }
            } catch (error) {
                await thinkingMessage.edit('Sorry, the knowledge base is currently unavailable. Please try again later.');
                console.error('RAG service health check failed:', error);
                return;
            }

            let rawQuery = (channelId === assignedChannelId)
                ? message.content
                : message.content.substring(message.content.startsWith('!oh') ? '!oh'.length : 'OH'.length).trim();

            // --- New Reply Handling Logic ---
            if (message.reference && message.reference.messageId) {
                try {
                    const repliedToMessage = await message.channel.messages.fetch(message.reference.messageId);
                    const repliedToAuthor = repliedToMessage.author.displayName;
                    const repliedToContent = repliedToMessage.content;
                    
                    // Prepend the context of the replied-to message for the AI
                    rawQuery = `(The user is replying to @${repliedToAuthor} who said: "${repliedToContent}")\n\n${rawQuery}`;
                    console.log('Injected reply context into the query.');
                } catch (err) {
                    console.error("Could not fetch the message being replied to. Proceeding without context.", err);
                }
            }
            // --- End of New Logic ---

            // Replace user mentions with their display names for the AI
            if (message.mentions.users.size > 0) {
                message.mentions.users.forEach(user => {
                    const mention = `<@${user.id}>`;
                    // Use a regex for global replacement in case a user is mentioned multiple times
                    rawQuery = rawQuery.replace(new RegExp(mention, 'g'), `@${user.displayName}`);
                });
            }
            const query = rawQuery;
            const chatHistory = getHistory(channelId);

            // --- New YouTube URL Detection ---
            let youtubeVideoId = null;
            const youtubeRegex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
            const match = query.match(youtubeRegex);
            if (match && match[1]) {
                youtubeVideoId = match[1];
                console.log(`Extracted YouTube Video ID: ${youtubeVideoId}`);
            }
            // --- End of New Logic ---

            // --- New Attachment Handling Logic ---
            let attachmentData = null;
            if (message.attachments.size > 0) {
                const attachment = message.attachments.first();
                console.log(`Detected attachment: ${attachment.url} (${attachment.contentType})`);
                
                // Download the file content into a buffer
                const response = await axios.get(attachment.url, { responseType: 'arraybuffer' });
                const buffer = Buffer.from(response.data, 'binary');

                attachmentData = {
                    buffer: buffer,
                    mimeType: attachment.contentType
                };
                console.log('Attachment downloaded successfully.');
            }
            // --- End of New Logic ---

            console.log(`Processing query: "${query}"`);

                // Get response from local RAG system
            finalResponse = await ragSystem.retrieveAndGenerate(
                query,
                chatHistory,
                client,
                message, // Pass the entire message object for context
                youtubeVideoId, // Pass the extracted ID
                attachmentData // Pass attachment data
            );
            // Update chat history (now an async operation)
            await addMessage(channelId, 'user', message.author.username, query, client);
            await addMessage(channelId, 'model', 'Mitsuko', finalResponse, client);

            // Post-process the response to convert @DisplayName back to real pings
            let processedResponse = finalResponse;
            const mentionRegex = /@(\w+)/g;
            const mentions = finalResponse.match(mentionRegex);

            if (mentions) {
                const usernames = [...new Set(mentions.map(m => m.substring(1)))]; // Get unique usernames
                for (const username of usernames) {
                    try {
                        const members = await message.guild.members.search({ query: username, limit: 1 });
                        const member = members.first();
                        if (member) {
                            const mentionPattern = new RegExp(`@${username}`, 'g');
                            processedResponse = processedResponse.replace(mentionPattern, `<@${member.id}>`);
                        }
                    } catch (err) {
                        console.error(`Could not find or replace mention for ${username}:`, err);
                    }
                }
            }

            // Send response, splitting if necessary
            if (processedResponse.length <= 2000) {
                console.log('Final response content to be sent/edited:', processedResponse);
                await thinkingMessage.edit(processedResponse);
                console.log('Successfully edited thinking message');
            } else {
                console.log('Response is too long, splitting into multiple messages.');
                const chunks = [];
                let tempStr = processedResponse;
                while (tempStr.length > 0) {
                    if (tempStr.length <= 2000) {
                        chunks.push(tempStr);
                        break;
                    }
                    // Find the last newline before the 2000 character limit
                    let splitIndex = tempStr.lastIndexOf('\n', 2000);
                    // If no newline is found, find the last space
                    if (splitIndex === -1) {
                        splitIndex = tempStr.lastIndexOf(' ', 2000);
                    }
                    // If no space is found, just split at 2000
                    if (splitIndex === -1) {
                        splitIndex = 2000;
                    }
                    chunks.push(tempStr.substring(0, splitIndex));
                    tempStr = tempStr.substring(splitIndex).trim();
                }

                // Send the first chunk by editing the "Thinking..." message
                await thinkingMessage.edit(chunks[0]);
                console.log('Successfully edited thinking message with the first chunk.');

                // Send the rest of the chunks as new messages
                for (let i = 1; i < chunks.length; i++) {
                    await message.channel.send(chunks[i]);
                    console.log(`Sent chunk ${i + 1}/${chunks.length}`);
                }
            }

        } catch (error) {
            console.error('Error in messageCreate execution:', error);
            if (thinkingMessage) {
                await thinkingMessage.edit('An error occurred while processing your request.');
                console.log('Updated thinking message with error');
            }
        } finally {
            console.log('Message handling complete.');
        }
    },
};