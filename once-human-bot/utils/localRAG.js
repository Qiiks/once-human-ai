const axios = require('axios');

const RAG_SERVICE_URL = 'http://localhost:5000';

class LocalRAGSystem {
    constructor() {
        // No initialization needed
    }

    async checkHealth() {
        try {
            const response = await axios.get(`${RAG_SERVICE_URL}/health`);
            return response.data.status === "healthy";
        } catch (error) {
            console.error('RAG service health check failed:', error.message);
            return false;
        }
    }

    async queryDatabase(query, nResults = 5) {
        try {
            // Check if service is healthy
            const isHealthy = await this.checkHealth();
            if (!isHealthy) {
                throw new Error('RAG service is not available. Please ensure the Python service is running.');
            }

            console.log('Querying RAG service with:', { query, nResults });
            const response = await axios.post(`${RAG_SERVICE_URL}/query`, {
                query,
                n_results: nResults
            });

            if (response.data.success) {
                console.log(`Retrieved ${response.data.results.length} results from RAG service`);
                return response.data.results;
            } else {
                console.error('RAG service error:', response.data.error);
                throw new Error(response.data.error || 'Unknown error occurred');
            }
        } catch (error) {
            if (error.code === 'ECONNREFUSED') {
                console.error('Could not connect to RAG service. Is it running?');
                throw new Error('RAG service is not running. Please start the Python service.');
            }
            console.error('Error querying RAG service:', error.message);
            throw error;
        }
    }

    async generateHypotheticalQuestions(query, gemini) {
        try {
            const prompt = `You are helping search for information about the game "Once Human". For the user question: "${query}"
Generate 3 related questions focused specifically on Once Human game content.
Consider:
1. Game items, weapons, or gear with similar names
2. Related game mechanics or systems
3. Similar items or effects in the game

Return exactly 3 questions, one per line, focusing only on Once Human game content.`;

            const chat = gemini.startChat({ history: [] });
            const response = await chat.sendMessage(prompt);
            return response.response.text().split('\n').filter(q => q.trim());
        } catch (error) {
            console.error('Error generating questions:', error);
            return [query];
        }
    }

    async reRankResults(results, query, gemini) {
        try {
            const reRankPrompt = `You are analyzing search results from the game "Once Human".
For the search query: "${query}", rate each passage's relevance from 0-1.
Focus on:
1. Direct mentions of items, effects, or mechanics from the query
2. Specific game-related details that answer the query
3. Related game mechanics or systems that provide context

For each passage, respond with ONLY a number from 0-1 representing its relevance score.
Just the numbers, one per line. Example:
0.9
0.5
0.3`;

            const passages = results.map(r => r.document).join('\n---\n');
            const chat = gemini.startChat({ history: [] });
            const response = await chat.sendMessage(reRankPrompt + '\n\nPassages:\n' + passages);
            const scores = response.response.text()
                .split('\n')
                .map(score => parseFloat(score.trim()))
                .filter(score => !isNaN(score));
            
            // Combine original results with new scores
            return results.map((result, index) => ({
                ...result,
                score: Math.max(scores[index] || 0.1, 0.1)
            })).sort((a, b) => b.score - a.score);
        } catch (error) {
            console.error('Error in reRanking:', error);
            return results;
        }
    }

    async retrieveAndGenerate(query, chatHistory, gemini, geminiFallback) {
        try {
            console.log('Local RAG system: retrieveAndGenerate function called.');

            // Generate hypothetical questions
            const questions = await this.generateHypotheticalQuestions(query, gemini);
            console.log('Generated related questions:', questions);

            // Multi-query retrieval
            const allResults = [];
            for (const question of questions) {
                const results = await this.queryDatabase(question);
                allResults.push(...results);
            }

            // Remove duplicates
            const uniqueResults = Array.from(
                new Map(allResults.map(item => [item.document, item])).values()
            );

            // Re-rank results
            const reRankedResults = await this.reRankResults(uniqueResults, query, gemini);

            // Build context string with metadata
            const context_str = reRankedResults.map(result => {
                let context = result.document;
                const metadata = result.metadata;
                
                if (metadata.effects && metadata.effects.length > 0) {
                    context += "\nKey Effects: " + metadata.effects.join(", ");
                }
                
                return context;
            }).join("\n---\n");

            console.log('Local RAG: Final context assembled');

            // System prompt
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
                console.log('Local RAG: Sending message to Gemini...');
                result = await chat.sendMessage(finalPrompt);
            } catch (error) {
                console.error("Primary Gemini model failed for response generation, using fallback:", error);
                chat = geminiFallback.startChat({ history: fullChatHistory });
                console.log('Local RAG: Sending message to Gemini (fallback)...');
                result = await chat.sendMessage(finalPrompt);
            }

            const response = await result.response;
            let text = response.text();
            console.log('Local RAG: Received response from Gemini.');
            console.timeEnd('Gemini API Call');

            // Enforce Discord character limit
            if (text.length > 2000) {
                text = text.substring(0, 1997) + '...';
            }

            return text;
        } catch (error) {
            console.error('Error in Local RAG system:', error);
            throw new Error('Failed to retrieve and generate response.');
        }
    }
}

module.exports = { LocalRAGSystem };
