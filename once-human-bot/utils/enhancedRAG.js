const { Pinecone } = require('@pinecone-database/pinecone');

async function reRankResults(results, query, gemini) {
    try {
        const reRankPrompt = `Given the search query: "${query}"
Please analyze each text passage and rate its relevance on a scale of 0-1, where 1 is most relevant.
Consider:
1. Direct answer presence
2. Specific details matching the query
3. Related context that could help answer the query

For each passage, return a JSON object with:
{
    "score": (0-1 score),
    "reasoning": "Brief explanation of score"
}`;

        const passages = results.map(r => r.metadata.text).join('\n---\n');
        const chat = gemini.startChat({ history: [] });
        const response = await chat.sendMessage(reRankPrompt + '\n\nPassages:\n' + passages);
        const scores = JSON.parse(response.response.text());
        
        // Combine original results with new scores
        return results.map((result, index) => ({
            ...result,
            score: Math.max(result.score * scores[index].score, 0.1) // Combine scores, ensure minimum relevance
        })).sort((a, b) => b.score - a.score);
    } catch (error) {
        console.error('Error in reRanking:', error);
        return results; // Fall back to original results if reranking fails
    }
}

async function generateHypotheticalQuestions(query, gemini) {
    try {
        const prompt = `For the user question: "${query}"
Generate 3 related questions that might help find relevant information.
Focus on:
1. Breaking down complex queries
2. Alternative phrasings
3. Related concepts

Return only the questions, one per line.`;

        const chat = gemini.startChat({ history: [] });
        const response = await chat.sendMessage(prompt);
        return response.response.text().split('\n').filter(q => q.trim());
    } catch (error) {
        console.error('Error generating questions:', error);
        return [query]; // Fall back to original query
    }
}

async function retrieveAndGenerate(query, chatHistory, pineconeIndex, gemini, embeddingModel, geminiFallback, gameEntities) {
    try {
        console.log('Enhanced RAG system: retrieveAndGenerate function called.');
        const index = pineconeIndex;

        // Generate hypothetical questions
        const questions = await generateHypotheticalQuestions(query, gemini);
        console.log('Generated related questions:', questions);

        // Multi-query retrieval
        const results = [];
        for (const question of questions) {
            const embeddingResult = await embeddingModel.embedContent(question);
            const queryVector = embeddingResult.embedding.values;
            const queryResult = await index.query({ 
                topK: 5, // Reduced from 10 to get more focused results
                vector: queryVector,
                includeMetadata: true,
                includeValues: false
            });
            results.push(...queryResult.matches);
        }

        // Remove duplicates
        const uniqueResults = Array.from(new Map(
            results.map(item => [item.metadata.text, item])
        ).values());

        // Re-rank results
        const reRankedResults = await reRankResults(uniqueResults, query, gemini);

        // Build context string with metadata
        let context_str = reRankedResults.map(result => {
            const metadata = result.metadata;
            let context = metadata.text;
            
            // If metadata contains entity information, add it
            if (metadata.metadata && metadata.metadata.effects && metadata.metadata.effects.length > 0) {
                context += "\nKey Effects: " + metadata.metadata.effects.join(", ");
            }
            
            return context;
        }).join("\n---\n");

        console.log('Enhanced RAG: Final context assembled');

        // Enhanced system prompt (using the one you previously improved)
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

        // Prepend system prompt to chat history
        const fullChatHistory = [systemPrompt, ...chatHistory];

        let finalPrompt;
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

        // Generate response with fallback
        console.time('Gemini API Call');
        let chat;
        let result;
        try {
            chat = gemini.startChat({ history: fullChatHistory });
            console.log('Enhanced RAG: Sending message to Gemini...');
            result = await chat.sendMessage(finalPrompt);
        } catch (error) {
            console.error("Primary Gemini model failed for response generation, using fallback:", error);
            chat = geminiFallback.startChat({ history: fullChatHistory });
            console.log('Enhanced RAG: Sending message to Gemini (fallback)...');
            result = await chat.sendMessage(finalPrompt);
        }

        const response = await result.response;
        let text = response.text();
        console.log('Enhanced RAG: Received response from Gemini.');
        console.timeEnd('Gemini API Call');

        // Enforce Discord character limit
        if (text.length > 2000) {
            text = text.substring(0, 1997) + '...';
        }

        return text;
    } catch (error) {
        console.error('Error in Enhanced RAG system:', error);
        throw new Error('Failed to retrieve and generate response.');
    }
}

module.exports = { retrieveAndGenerate };
