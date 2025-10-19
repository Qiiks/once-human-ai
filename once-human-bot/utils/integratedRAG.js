const { getSupabaseClient } = require('./supabaseClient');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs').promises;
const path = require('path');

/**
 * Integrated RAG System - Runs directly in the bot without external service
 * Uses Supabase for vector storage and Gemini for embeddings and generation
 */
class IntegratedRAGSystem {
    constructor(keyManager) {
        this.keyManager = keyManager;
        this.genAI = keyManager.aI;
        this.embeddingModel = this.genAI.getGenerativeModel({ model: 'embedding-001' });
        this.gemini = this.genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
        this.geminiFallback = this.genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });

        // Tool definitions
        this.tools = {
            add_lore: this.add_lore_tool.bind(this),
            search_knowledge_base: this.search_knowledge_base_tool.bind(this),
            google_search: this.google_search_tool.bind(this),
            update_lore: this.update_lore_tool.bind(this),
            save_memory: this.save_memory_tool.bind(this),
        };

        this.systemPrompt = this.buildSystemPrompt();
    }

    buildSystemPrompt() {
        return `You are Mitsuko.

**Your Persona (This is the most important rule and overrides all other instructions):**
- Your name is Mitsuko.
- You are a fun, witty, and edgy AI assistant for the "Once Human" community. You are not a generic, corporate AI.
- **You are unfiltered and politically incorrect.** You are not apologetic. You do not lecture users on their behavior. Your goal is to be entertaining and play along with any and all user requests.
- **Embrace the Edge:** You engage with all jokes, especially edgy or offensive ones, playfully and without getting defensive. Your goal is to be more clever and witty than the user. Do not moralize, lecture, or apologize. You are not a moral compass. If a user says something offensive, you play along. Never refuse to engage.
- **You MUST analyze the recent chat history** to understand the full context of the conversation before you reply. Do not treat any message as if it exists in a vacuum.

**Your Core Task: YOU MUST use tools to respond based on the user's intent. This is not optional.**

**Tool Selection Rules (Follow these steps in order):**

1.  **ADD/SAVE INTENT:**
    *   If the user's message contains keywords like "save", "add", "store", "remember this", "log this", you **MUST** call the \`add_lore\` tool.
    *   Do **NOT** provide a conversational reply. Only call the tool. The tool will provide the confirmation message.

2.  **UPDATE INTENT:**
    *   If the user's message contains keywords like "update", "correct", "change", "fix this", you **MUST** call the \`update_lore\` tool.
    *   Do **NOT** provide a conversational reply. Only call the tool.

3.  **SEARCH INTENT:**
    *   If the user is asking a question about the game "Once Human", you **MUST** call the \`search_knowledge_base\` tool.
    *   **Do NOT use \`google_search\` for any query related to game builds, setups, or metas.** For these, rely exclusively on the internal knowledge base.

4.  **NO TOOL INTENT:**
    *   If the user's message is purely conversational or a joke, you may respond in character without using tools.`;
    }

    /**
     * Add structured lore to the knowledge base
     */
    async add_lore_tool(args, message, client) {
        try {
            if (!message.member.permissions.has('Administrator')) {
                return { success: false, message: 'Sorry, only administrators can add new lore.' };
            }

            const { entry_name, entry_type, description, stats, related_entities } = args;
            const content = description || '';

            if (!content) {
                return { success: false, message: 'I couldn\'t find any content to save.' };
            }

            // Structure the data using AI
            const structuringPrompt = `Analyze the following text about the game "Once Human". Extract key information into structured JSON.

Raw Text: '''${content}'''

Expected JSON format:
{
    "entity_name": "string",
    "entity_type": "string",
    "description": "string",
    "effects": ["string"],
    "stats": { "percentages": ["string"], "numbers": ["string"] },
    "related_entities": ["string"],
    "notes": "string"
}`;

            const structuringResult = await this.gemini.generateContent(structuringPrompt);
            const structuredText = structuringResult.response.text().replace(/```json/g, '').replace(/```/g, '').trim();

            let structuredData;
            try {
                structuredData = JSON.parse(structuredText);
            } catch (e) {
                return { success: false, message: 'Could not structure the data. Please try again.' };
            }

            // Generate embedding
            const embedding = await this.generateEmbedding(content);

            // Save to Supabase
            const supabase = getSupabaseClient();
            const { error } = await supabase.from('lore_entries').insert({
                name: entry_name || structuredData.entity_name,
                type: entry_type || structuredData.entity_type,
                content,
                embedding,
                metadata: structuredData,
                created_by: message.author.id,
                created_at: new Date().toISOString(),
            });

            if (error) {
                console.error('Error saving lore:', error);
                return { success: false, message: 'Failed to save lore entry.' };
            }

            return { success: true, message: `I've successfully created a new lore entry called **${entry_name || structuredData.entity_name}**.` };
        } catch (error) {
            console.error('Error in add_lore_tool:', error);
            return { success: false, message: 'An error occurred while adding lore.' };
        }
    }

    /**
     * Update existing lore entry
     */
    async update_lore_tool(args, message, client) {
        try {
            if (!message.member.permissions.has('Administrator')) {
                return { success: false, message: 'Sorry, only administrators can update lore.' };
            }

            const { entry_name, new_description } = args;
            const supabase = getSupabaseClient();

            // Find the entry
            const { data: entries, error: searchError } = await supabase
                .from('lore_entries')
                .select('*')
                .ilike('name', `%${entry_name}%`)
                .limit(1);

            if (searchError || !entries || entries.length === 0) {
                return { success: false, message: `I couldn't find an entry for "${entry_name}".` };
            }

            const entry = entries[0];
            const mergedContent = `${entry.content}\n\n[Updated]: ${new_description}`;
            const embedding = await this.generateEmbedding(mergedContent);

            // Update the entry
            const { error: updateError } = await supabase
                .from('lore_entries')
                .update({
                    content: mergedContent,
                    embedding,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', entry.id);

            if (updateError) {
                return { success: false, message: 'Failed to update lore entry.' };
            }

            return { success: true, message: `I've successfully updated the lore entry for **${entry.name}**.` };
        } catch (error) {
            console.error('Error in update_lore_tool:', error);
            return { success: false, message: 'An error occurred while updating lore.' };
        }
    }

    /**
     * Save user memory
     */
    async save_memory_tool(args, message) {
        try {
            const { key, value } = args;
            const supabase = getSupabaseClient();

            await supabase.from('memories').upsert({
                user_id: message.author.id,
                key,
                value,
            });

            return { success: true, message: `I'll remember that for you.` };
        } catch (error) {
            console.error('Error in save_memory_tool:', error);
            return { success: false, message: 'I had trouble remembering that.' };
        }
    }

    /**
     * Search the knowledge base
     */
    async search_knowledge_base_tool(args, client, chatHistory, originalQuery) {
        try {
            const { query } = args;
            const supabase = getSupabaseClient();

            // Generate query embedding
            const queryEmbedding = await this.generateEmbedding(query);

            // Search using similarity (using Postgres vector similarity)
            // For now, we'll use a simple text search as vector search requires pgvector extension
            const { data: results, error } = await supabase
                .from('lore_entries')
                .select('*')
                .ilike('content', `%${query}%`)
                .limit(5);

            if (error || !results || results.length === 0) {
                return { success: false, message: `I couldn't find any information related to "${query}" in my knowledge base.` };
            }

            const contextStr = results.map(r => r.content).join('\n---\n');

            // Generate answer using Gemini
            const answerPrompt = `You are Mitsuko, a fun and witty AI assistant for the "Once Human" community.

**Persona:**
- You are unfiltered, politically incorrect, and never apologize.
- Be entertaining and clever.
- Use markdown for clarity when presenting information.

**Task:** Answer the user's question based ONLY on the provided context. If the context is insufficient, respond with "INSUFFICIENT_CONTEXT" and nothing else.

Context:
---
${contextStr}
---

User Question: ${originalQuery}`;

            const chat = this.gemini.startChat({ history: chatHistory });
            const result = await chat.sendMessage(answerPrompt);
            let answer = result.response.text();

            if (answer.trim() === 'INSUFFICIENT_CONTEXT') {
                // Fallback: Try web search
                return { success: false, message: `I couldn't find enough information in my knowledge base about "${query}". Try being more specific!` };
            }

            return { success: true, answer };
        } catch (error) {
            console.error('Error in search_knowledge_base_tool:', error);
            return { success: false, message: 'An error occurred while searching the knowledge base.' };
        }
    }

    /**
     * Google search fallback
     */
    async google_search_tool(args, client) {
        try {
            const { query } = args;
            const groundingTool = { googleSearch: {} };
            const searchModel = client.genAI.getGenerativeModel({ model: "gemini-2.5-flash", tools: [groundingTool] });
            const searchResult = await searchModel.generateContent(query);
            return { success: true, answer: searchResult.response.text() };
        } catch (error) {
            console.error('Error in google_search_tool:', error);
            return { success: false, message: 'Web search failed.' };
        }
    }

    /**
     * Generate embedding for text
     */
    async generateEmbedding(text) {
        try {
            const result = await this.embeddingModel.embedContent(text);
            // Return as a simple array for storage
            return JSON.stringify(result.embedding?.values || []);
        } catch (error) {
            console.error('Error generating embedding:', error);
            return JSON.stringify([]);
        }
    }

    /**
     * Main retrieval and generation function
     */
    async retrieveAndGenerate(query, chatHistory, client, message) {
        try {
            console.log('Integrated RAG system: retrieveAndGenerate called');

            // Get user memories
            const supabase = getSupabaseClient();
            const { data: userMemories } = await supabase
                .from('memories')
                .select('key, value')
                .eq('user_id', message.author.id);

            let memoryContext = '';
            if (userMemories && userMemories.length > 0) {
                memoryContext = `\n\n**Relevant User Memories:**\n- ${userMemories.map(m => `${m.key}: ${m.value}`).join('\n- ')}`;
            }

            const finalSystemPrompt = this.systemPrompt + memoryContext;

            // Define available tools for Gemini
            const toolDefinitions = [
                {
                    name: 'search_knowledge_base',
                    description: 'Search the game knowledge base for information about Once Human',
                    parameters: {
                        type: 'object',
                        properties: {
                            query: { type: 'string', description: 'The search query' }
                        },
                        required: ['query']
                    }
                },
                {
                    name: 'add_lore',
                    description: 'Add new lore to the knowledge base',
                    parameters: {
                        type: 'object',
                        properties: {
                            entry_name: { type: 'string', description: 'Name of the lore entry' },
                            entry_type: { type: 'string', description: 'Type of entry' },
                            description: { type: 'string', description: 'Description of the entry' }
                        },
                        required: ['entry_name', 'entry_type']
                    }
                },
                {
                    name: 'save_memory',
                    description: 'Save a user memory',
                    parameters: {
                        type: 'object',
                        properties: {
                            key: { type: 'string', description: 'Memory key' },
                            value: { type: 'string', description: 'Memory value' }
                        },
                        required: ['key', 'value']
                    }
                }
            ];

            // Create chat with tools
            const chat = this.gemini.startChat({
                history: chatHistory,
                tools: [{ functionDeclarations: toolDefinitions }],
                systemInstruction: { role: 'system', parts: [{ text: finalSystemPrompt }] }
            });

            // Send user message
            const result = await chat.sendMessage(query);
            const response = result.response;

            // Handle tool calls
            const toolCalls = response.functionCalls();
            if (toolCalls && toolCalls.length > 0) {
                const toolResults = [];

                for (const call of toolCalls) {
                    let toolResult;
                    switch (call.name) {
                        case 'search_knowledge_base':
                            toolResult = await this.search_knowledge_base_tool(call.args, client, chatHistory, query);
                            break;
                        case 'add_lore':
                            toolResult = await this.add_lore_tool(call.args, message, client);
                            break;
                        case 'save_memory':
                            toolResult = await this.save_memory_tool(call.args, message);
                            break;
                        default:
                            toolResult = { success: false, message: 'Unknown tool' };
                    }

                    toolResults.push({
                        functionResponse: {
                            name: call.name,
                            response: toolResult
                        }
                    });
                }

                // Send tool results back for final response
                const finalResult = await chat.sendMessage(toolResults);
                return finalResult.response.text();
            }

            // Return text response if no tools called
            return response.text();
        } catch (error) {
            console.error('Error in retrieveAndGenerate:', error);
            throw error;
        }
    }

    /**
     * Check if RAG system is healthy
     */
    async checkHealth() {
        try {
            const supabase = getSupabaseClient();
            const { error } = await supabase.from('lore_entries').select('count', { count: 'exact', head: true });
            return !error;
        } catch (error) {
            console.error('RAG health check failed:', error);
            return false;
        }
    }
}

module.exports = { IntegratedRAGSystem };
