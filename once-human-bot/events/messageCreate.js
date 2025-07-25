const { LocalRAGSystem } = require('../utils/localRAG');
const { getHistory, addMessage } = require('../utils/chatHistoryManager');

// Initialize the RAG system
const ragSystem = new LocalRAGSystem();

module.exports = {
    name: 'messageCreate',
    async execute(message, client) {
        // Ignore bot messages
        if (message.author.bot) return;

        const assignedChannelId = client.config.channelId;
        const channelId = message.channel.id;
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

            const query = (channelId === assignedChannelId) 
                ? message.content 
                : message.content.substring(message.content.startsWith('!oh') ? '!oh'.length : 'OH'.length).trim();
            const chatHistory = getHistory(channelId);

            console.log(`Processing query: "${query}"`);

                // Get response from local RAG system
            finalResponse = await ragSystem.retrieveAndGenerate(
                query,
                chatHistory,
                client.gemini,
                client.geminiFallback
            );            // Update chat history
            addMessage(channelId, 'user', query);
            addMessage(channelId, 'model', finalResponse);

            // Send response
            const truncatedResponse = finalResponse.substring(0, Math.min(finalResponse.length, 2000));
            console.log('Final response content to be sent/edited:', truncatedResponse);
            await thinkingMessage.edit(truncatedResponse);
            console.log('Successfully edited thinking message');

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