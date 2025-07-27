const { Pinecone } = require('@pinecone-database/pinecone');
const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// This file is now a placeholder and contains the legacy RAG system.
// The primary logic has been moved to localRAG.js to support AI-driven tool calling.

async function retrieveAndGenerate(query, chatHistory, pineconeIndex, gemini, embeddingModel, geminiFallback, gameEntities, client) {
    try {
        console.log('RAG system: retrieveAndGenerate function called.');
        console.log('Query:', query);
        const index = pineconeIndex;

        console.log('RAG system: Querying Pinecone index with query:', query);

        let keywords = [];
        let context_str = "";
        let finalPrompt = "";
        let keywordGenerationAttempt = "precise"; // To track which keyword generation was successful

        // Helper function to generate keywords
        async function generateKeywords(promptText, model) {
            try {
                const keywordChat = model.startChat({ history: [] });
                const keywordResult = await keywordChat.sendMessage(promptText);
                return keywordResult.response.text().trim().split(',').map(keyword => keyword.trim());
            } catch (error) {
                console.error(`Error generating keywords with ${model === gemini ? 'primary' : 'fallback'} model:`, error);
                throw error; // Re-throw to be caught by the outer try-catch
            }
        }

        // Stage 1: Precise keyword generation
        const preciseKeywordPrompt = `Given the user question: "${query}", and the following game entities from Once Human: Weapons: ${gameEntities.weapons ? gameEntities.weapons.join(', ') : 'N/A'}, Armor Sets: ${gameEntities.armor_sets ? gameEntities.armor_sets.join(', ') : 'N/A'}, Key Gear: ${gameEntities.key_gear ? gameEntities.key_gear.join(', ') : 'N/A'}, Weapon Mods: ${gameEntities.weapon_mods ? gameEntities.weapon_mods.join(', ') : 'N/A'}, Armor Mods: ${gameEntities.armor_mods ? gameEntities.armor_mods.join(', ') : 'N/A'}. Extract 3-5 precise keywords that are directly related to these entities or the user's query within the context of the game Once Human. Return only the keywords, separated by commas.`;
        console.log('RAG system: Attempting precise keyword generation.');
        try {
            keywords = await generateKeywords(preciseKeywordPrompt, gemini);
        } catch (error) {
            console.error("Precise keyword generation with primary model failed, trying fallback.", error);
            keywords = await generateKeywords(preciseKeywordPrompt, geminiFallback);
        }
        console.log('RAG system: Precise keywords generated:', keywords);

        // Attempt to retrieve context with precise keywords
        if (keywords.length > 0) {
            console.log('RAG system: Querying Pinecone with precise keywords.');
            const embeddingResult = await embeddingModel.embedContent(keywords.join(' '));
            const queryVector = embeddingResult.embedding.values;
            const queryResult = await index.query({ topK: 10, vector: queryVector, includeMetadata: true, includeValues: false });
            if (queryResult.matches.length > 0) {
                context_str = queryResult.matches.map(match => match.metadata.text || match.metadata.description).join("\n---\n");
                console.log('RAG system: Context found with precise keywords.');
            }
        }

        // Stage 2: Broader keyword generation if no context found with precise keywords
        if (!context_str) {
            console.log('RAG system: No context with precise keywords, attempting broader keyword generation.');
            keywordGenerationAttempt = "broader";
            const broaderKeywordPrompt = `Given the user question: "${query}", and the context of the game "Once Human", generate 3-5 broader, more general keywords that could help find relevant information about the game. Return only the keywords, separated by commas.`;
            try {
                keywords = await generateKeywords(broaderKeywordPrompt, gemini);
            } catch (error) {
                console.error("Broader keyword generation with primary model failed, trying fallback.", error);
                keywords = await generateKeywords(broaderKeywordPrompt, geminiFallback);
            }
            console.log('RAG system: Broader keywords generated:', keywords);

            if (keywords.length > 0) {
                console.log('RAG system: Querying Pinecone with broader keywords.');
                const embeddingResult = await embeddingModel.embedContent(keywords.join(' '));
                const queryVector = embeddingResult.embedding.values;
                const queryResult = await index.query({ topK: 10, vector: queryVector, includeMetadata: true, includeValues: false });
                if (queryResult.matches.length > 0) {
                    context_str = queryResult.matches.map(match => match.metadata.text || match.metadata.description).join("\n---\n");
                    console.log('RAG system: Context found with broader keywords.');
                }
            }
        }

        console.log('RAG system: Final context string:', context_str);

        // Define the system prompt with enhanced role and behavior guidelines
        const systemPrompt = {
            role: 'user',
            parts: [{
                text: `You are Mitsuko, the trusted AI companion for Once Human players. Your responses should be:

1. ACCURATE: Only provide information that's directly supported by the context.
2. CONCISE: Keep responses clear and to the point, using bullet points for lists.
3. SPECIFIC: When discussing items, always mention key stats like:
   - Effects and their exact values
   - Duration times
   - Durability/cooldowns
   - Required ingredients if applicable
4. ANALYTICAL: For build questions:
   - Break down synergies between items
   - Explain why certain combinations work
   - Include specific numbers and percentages
5. TONE: Maintain a helpful, knowledgeable tone while being direct and practical.

Never speculate or provide information not in the context. If information is missing, clearly state what specific details you don't have access to.`
            }]
        };

        // Prepend the system prompt to the chat history
        const fullChatHistory = [systemPrompt, ...chatHistory];

        if (context_str) {
            finalPrompt = `Answer the following question using ONLY the context provided. Format your response with these rules:

1. Start with the most important information first
2. Use bold (**) for key statistics and effects
3. If discussing items or builds:
   - List all relevant stats and effects
   - Explain any important synergies
   - Include duration and cooldown times
4. If the context doesn't contain complete information, explicitly state what specific details are missing

Context: ${context_str}

User Question: ${query}`;
        } else {
            finalPrompt = `I apologize, but I don't have specific information about "${query}" in my current Once Human knowledge base. To ensure you get accurate information, I recommend:

1. Checking the official Once Human Wiki (https://oncehuman.wiki/)
2. Visiting the official Once Human website (https://www.oncehuman.game/)
3. Joining the official Discord community

Please feel free to ask another question, and I'll do my best to help with the information I have available.`;
        }

        console.time('Gemini API Call');
        let chat;
        let result;
        try {
            chat = gemini.startChat({ history: fullChatHistory });
            console.log('RAG system: Sending message to Gemini...');
            result = await chat.sendMessage(finalPrompt);
        } catch (error) {
            console.error("Primary Gemini model failed for response generation, using fallback:", error);
            chat = geminiFallback.startChat({ history: fullChatHistory });
            console.log('RAG system: Sending message to Gemini (fallback)...');
            result = await chat.sendMessage(finalPrompt);
        }
        const response = await result.response;
        let text = response.text();
        console.log('RAG system: Received response from Gemini.');
        console.timeEnd('Gemini API Call');

        // Enforce 2000-character limit for Discord
        if (text.length > 2000) {
            text = text.substring(0, 1997) + '...';
        }

        return text;
    } catch (error) {
        console.error('Error in RAG system:', error);
        throw new Error('Failed to retrieve and generate response.');
    }
}

module.exports = {
    retrieveAndGenerate
};