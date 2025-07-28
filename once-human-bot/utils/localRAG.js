const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { PermissionFlagsBits } = require('discord.js');

const RAG_SERVICE_URL = 'http://localhost:5000';

// Tool definitions for Gemini
const groundingTool = { googleSearch: {} };

// Function to check for build-related keywords
function isBuildQuery(query) {
    const buildKeywords = ['build', 'meta', 'setup', 'gear', 'loadout', 'best build', 'weapon setup', 'armor set'];
    const lowerCaseQuery = query.toLowerCase();
    return buildKeywords.some(keyword => lowerCaseQuery.includes(keyword));
}

const AVAILABLE_TOOLS = {
    add_lore: {
        name: 'add_lore',
        description: 'Adds or saves information to the knowledge base. Use this for adding new, verified game data OR for saving information from a recent conversation or a replied-to message.',
        parameters: {
            type: 'object',
            properties: {
                entry_name: {
                    type: 'string',
                    description: 'A concise, unique name for the lore entry (e.g., "Burn Status Effect"). This is required.'
                },
                entry_type: {
                    type: 'string',
                    description: 'The category of the information (e.g., "Mechanic", "Weapon"). This is required.',
                    enum: ['Consumable', 'Item', 'Weapon', 'Armor', 'Character', 'Location', 'Ability', 'Mechanic', 'Quest', 'Tier List', 'Guide']
                },
                description: {
                    type: 'string',
                    description: 'A comprehensive description. For new lore, provide it directly. If saving from a conversation, this is optional as the tool will extract it.'
                },
                stats: {
                    type: 'object',
                    description: 'A structured object containing specific stats, if applicable. (e.g., { "effect": "Status DMG +25%", "duration": "30 min" })'
                },
                related_entities: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'A list of related game entities or keywords to improve searchability.'
                }
            },
            required: ['entry_name', 'entry_type']
        }
    },
    update_lore: {
        name: 'update_lore',
        description: 'Updates an existing entry in the knowledge base. Use this when a user provides a correction or adds new details to a previously discussed topic.',
        parameters: {
            type: 'object',
            properties: {
                entry_name: {
                    type: 'string',
                    description: 'The name of the lore entry to update (e.g., "Whimsical Drink"). This is required.'
                },
                new_description: {
                    type: 'string',
                    description: 'The new, corrected, or updated description for the entry.'
                }
            },
            required: ['entry_name', 'new_description']
        }
    },
    search_knowledge_base: {
        name: 'search_knowledge_base',
        description: 'Use this tool to search for and retrieve information from the game knowledge base. This is for answering user questions about game items, mechanics, quests, etc.',
        parameters: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'The user\'s question or the topic to search for in the knowledge base.'
                }
            },
            required: ['query']
        }
    },
    google_search: {
        name: 'google_search',
        description: 'Use this tool to search the web for information ONLY when the user\'s prompt explicitly contains keywords like "search", "google", "web", or "internet".',
        parameters: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'The search query.'
                }
            },
            required: ['query']
        }
    },
};

class LocalRAGSystem {
    constructor() {
        this.tools = {
            add_lore: this.add_lore_tool.bind(this),
            search_knowledge_base: this.search_knowledge_base_tool.bind(this),
            google_search: this.google_search_tool.bind(this),
            update_lore: this.update_lore_tool.bind(this),
        };
        this.systemPrompt = `You are Mitsuko.

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
    *   You must infer the \`entry_name\` and \`entry_type\` from the user's request.

2.  **UPDATE INTENT:**
    *   If the user's message contains keywords like "update", "correct", "change", "fix this", you **MUST** call the \`update_lore\` tool.
    *   Do **NOT** provide a conversational reply. Only call the tool.

3.  **SEARCH INTENT:**
    *   If the user is asking a question about the game "Once Human" (e.g., "where can I find...", "what is the best..."), you **MUST** call the \`search_knowledge_base\` tool.
    *   **Do NOT use \`google_search\` for any query related to game builds, setups, or metas.** For these, rely exclusively on the internal knowledge base. For all other topics, you may use \`google_search\` if the knowledge base does not provide a sufficient answer.

4.  **NO TOOL INTENT:**
    *   If the user's message is purely conversational, a joke, or does not match any of the intents above, you may respond in character without using any tools.

**Tool Usage Guidelines:**
*   **\`google_search\`:** Only use this tool if the user explicitly asks for a web search. Before using this tool, rephrase the user's question into an effective search query. For example, "can you look up the coordinates to find the recipe for whimsical drink" should become "whimsical drink recipe location coordinates once human".`;
    }

    async add_lore_tool(args, message, client) {
        try {
            if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
                return { success: false, message: 'Sorry, only administrators can add new lore.' };
            }
            console.log('Tool `add_lore` called with:', args);

            let content_to_structure = args.description;

            // If no direct description, get content from reply or previous message
            if (!content_to_structure) {
                if (message.reference && message.reference.messageId) {
                    const repliedToMessage = await message.channel.messages.fetch(message.reference.messageId);
                    content_to_structure = repliedToMessage.content;
                } else {
                    const last_message = (await message.channel.messages.fetch({ limit: 2 })).last();
                    content_to_structure = last_message.content;
                }
            }

            if (!content_to_structure) {
                return { success: false, message: 'I couldn\'t find any content to save.' };
            }

            // AI-powered structuring step
            const structuringPrompt = `Analyze the following text about the game "Once Human". Extract the key information into a structured JSON object.

Raw Text: '''${content_to_structure}'''

Expected JSON format:
{{
    "entity_name": "string",
    "entity_type": "string",
    "description": "string",
    "effects": ["string"],
    "stats": {{ "percentages": ["string"], "numbers": ["string"], "durations": ["string"] }},
    "acquisition_method": "string",
    "duration": "string",
    "related_entities": ["string"],
    "notes": "string"
}}`;

            const model = client.gemini;
            const structuringResult = await model.generateContent(structuringPrompt);
            const structuredText = structuringResult.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
            
            let structuredData;
            try {
                structuredData = JSON.parse(structuredText);
            } catch (e) {
                console.error("Failed to parse structured data from AI. Raw text:", structuredText, "Error:", e);
                return { success: false, message: "I had trouble structuring the data from the AI. The entry was not saved. Please try again." };
            }

            if (!structuredData || Object.keys(structuredData).length === 0) {
                console.error("AI returned empty or invalid structured data:", structuredData);
                return { success: false, message: "The AI failed to extract any structured metadata. The entry was not saved." };
            }

            const finalName = args.entry_name || structuredData.entity_name;
            const document = content_to_structure;
            const metadata = {
                name: finalName,
                type: args.entry_type || structuredData.entity_type,
                description: structuredData.description,
                effects: structuredData.effects,
                stats: structuredData.stats,
                related_entities: structuredData.related_entities,
                acquisition_method: structuredData.acquisition_method,
                duration: structuredData.duration,
                notes: structuredData.notes,
                source: `Conversation with ${message.author.username}`,
                verified: true
            };

            await this.add_data(document, metadata);
            return { success: true, message: `I've successfully created a new lore entry called **${finalName}**.` };

        } catch (error) {
            console.error('Error executing add_lore tool:', error);
            return { success: false, message: 'An error occurred while adding lore.' };
        }
    }

    async update_lore_tool(args, message, client) {
        try {
            if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
                return { success: false, message: 'Sorry, only administrators can update lore.' };
            }
            console.log('Tool `update_lore` called with:', args);
            const { entry_name, new_description } = args;

            // Step 1: Fetch the most likely document from the database
            const queryResults = await this.queryDatabase(entry_name, 1);
            if (!queryResults || queryResults.length === 0) {
                return { success: false, message: `I couldn't find any entries related to "${entry_name}" to update.` };
            }
            const originalEntry = queryResults[0];
            const originalName = originalEntry.metadata.name;

            // Step 2: AI-powered name verification
            const verificationPrompt = `Does the name "${entry_name}" refer to the same core game entity as "${originalName}" in the game "Once Human"? For example, "Mixed Fried Hotdog" and "Mixed Fried Hotdog Recipe" should be considered the same. Respond with only "YES" or "NO".`;
            const model = client.gemini;
            const verificationResult = await model.generateContent(verificationPrompt);
            const isSameEntity = verificationResult.response.text().trim().toUpperCase().includes('YES');

            if (!isSameEntity) {
                return { success: false, message: `I found an entry for "${originalName}", but I'm not sure if that's the same as "${entry_name}". Please be more specific.` };
            }

            // Step 3: Intelligently merge the old and new information
            const originalDocument = originalEntry.document;
            const docId = originalEntry.id;
            if (!docId) {
                console.error("FATAL: Document found but ID is missing.", originalEntry);
                return { success: false, message: "I found the document, but I couldn't get its ID to perform the update. This is a weird one." };
            }

            const mergePrompt = `You are a knowledge base editor. Your task is to intelligently merge a user's correction into an existing document.

**Original Document:**
---
${originalDocument}
---

**User's Correction/Update:**
---
${new_description}
---

**Instructions:**
Rewrite the original document to incorporate the user's correction. The final output should be a single, cohesive, and accurate block of text that preserves all correct information from the original while applying the user's updates.`;

            const mergeResult = await model.generateContent(mergePrompt);
            const mergedDocument = mergeResult.response.text();

            // Step 4: Update the existing document in the database
            const updatedMetadata = {
                ...originalEntry.metadata,
                source: `Updated by ${message.author.username}`,
            };

            await this.update_data(docId, mergedDocument, updatedMetadata);
            return { success: true, message: `I've successfully updated the lore entry for **${originalName}** with the new information.` };

        } catch (error) {
            console.error('Error executing update_lore tool:', error);
            return { success: false, message: 'An error occurred while updating lore.' };
        }
    }

    async regenerate_metadata_tool(args, interaction, client) {
        try {
            // Note: The permission check is now handled in the slash command file itself.
            // This function is now called with an 'interaction' object, not a 'message' object.
            console.log('Tool `regenerate_metadata` called with:', args);
            const { entry_name } = args;

            // 1. Fetch the existing document
            const queryResults = await this.queryDatabase(entry_name, 1);
            if (!queryResults || queryResults.length === 0 || queryResults[0].metadata.name !== entry_name) {
                return { success: false, message: `I couldn't find an exact match for an entry named "${entry_name}".` };
            }

            const existingEntry = queryResults[0];
            const content_to_structure = existingEntry.document;

            // 2. Re-run the AI structuring process
            const structuringPrompt = `Analyze the following text about the game "Once Human". Extract the key information into a structured JSON object.

Raw Text: '''${content_to_structure}'''

Expected JSON format:
{{
    "entity_name": "string",
    "entity_type": "string",
    "description": "string",
    "effects": ["string"],
    "stats": {{ "percentages": ["string"], "numbers": ["string"], "durations": ["string"] }},
    "acquisition_method": "string",
    "duration": "string",
    "related_entities": ["string"],
    "notes": "string"
}}`;

            const model = client.gemini;
            const structuringResult = await model.generateContent(structuringPrompt);
            const structuredText = structuringResult.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
            
            let structuredData;
            try {
                structuredData = JSON.parse(structuredText);
            } catch (e) {
                console.error("Failed to parse structured data from AI during regeneration. Raw text:", structuredText, "Error:", e);
                return { success: false, message: "I had trouble re-structuring the data from the AI. The entry was not updated." };
            }

            if (!structuredData || Object.keys(structuredData).length === 0) {
                console.error("AI returned empty or invalid structured data during regeneration:", structuredData);
                return { success: false, message: "The AI failed to extract any structured metadata during regeneration. The entry was not updated." };
            }

            // 3. Update the document with the new metadata
            const updatedMetadata = {
                ...existingEntry.metadata, // Keep existing metadata like source, name, type
                description: structuredData.description || existingEntry.metadata.description,
                effects: structuredData.effects || existingEntry.metadata.effects,
                stats: structuredData.stats || existingEntry.metadata.stats,
                related_entities: structuredData.related_entities || existingEntry.metadata.related_entities,
                acquisition_method: structuredData.acquisition_method || existingEntry.metadata.acquisition_method,
                duration: structuredData.duration || existingEntry.metadata.duration,
                notes: structuredData.notes || existingEntry.metadata.notes,
                source: `Metadata regenerated by ${interaction.user.username}`,
            };

            await this.add_data(content_to_structure, updatedMetadata); // add_data will overwrite based on the document content
            return { success: true, message: `I've successfully regenerated and updated the metadata for **${entry_name}**.` };

        } catch (error) {
            console.error('Error executing regenerate_metadata tool:', error);
            return { success: false, message: 'An error occurred while regenerating metadata.' };
        }
    }
    
    async search_knowledge_base_tool(args, client, chatHistory, originalQuery, disableWebSearch = false) {
      try {
          console.log('Tool `search_knowledge_base` called with:', args);
          const { query } = args;
          const { gemini, geminiFallback, gameEntities } = client;

          let keywords = [];
          let context_str = "";

          // Stage 1: Precise keyword generation
          const preciseKeywordPrompt = `You are a search query expansion bot for the game "Once Human". Your goal is to take a user's question and generate a list of 3-5 related keywords and concepts to improve database search results.

**Instructions:**
1.  **Identify Core Concepts:** What is the user *really* asking about? (e.g., a weapon, a food item, a game mechanic).
2.  **Brainstorm Related Terms:** Think of synonyms and related game concepts. For example, if the user asks about "Mixed Fried Hotdog", related concepts are "food", "recipe", "buffs", and "cooking". If they ask about a weapon, related concepts could be "ammo type", "damage", "mods".
3.  **Include the Original Term:** Always include the primary term from the user's query.
4.  **Stay In-Universe:** All generated keywords must be relevant to the game "Once Human".
5.  **Format:** Return a comma-separated list of keywords.

**User's Question:** "${query}"`;
          console.log('Attempting precise keyword generation.');
          try {
              keywords = await this.generateKeywords(preciseKeywordPrompt, gemini);
          } catch (error) {
              console.error("Precise keyword generation with primary model failed, trying fallback.", error);
              keywords = await this.generateKeywords(preciseKeywordPrompt, geminiFallback);
          }
          console.log('Precise keywords generated:', keywords);

          if (keywords.length > 0) {
              const results = await this.queryDatabase(keywords.join(' '));
              if (results && results.length > 0) {
                  const filteredResults = results.filter(r => 
                      keywords.some(keyword => r.document.toLowerCase().includes(keyword.toLowerCase()))
                  );

                  if (filteredResults.length > 0) {
                      context_str = filteredResults.map(r => `[Source Status: ${r.metadata && r.metadata.verified ? "VERIFIED" : "UNVERIFIED"}]\n${r.document}`).join("\n---\n");
                      console.log(`Context found and pre-filtered to ${filteredResults.length} relevant results.`);
                  }
              }
          }

          // Stage 2: Broader keyword generation if no context found
          if (!context_str) {
              console.log('No context with precise keywords, attempting broader keyword generation.');
              const broaderKeywordPrompt = `The previous search failed. Now, think more broadly. Based on the user's question, generate 3-5 general, high-level categories or concepts from the game "Once Human" that might be related. For example, if the query was about a specific gun, broader concepts could be "weapons", "crafting", or "damage types".

**User's Question:** "${query}"

Return a comma-separated list of keywords.`;
              try {
                  keywords = await this.generateKeywords(broaderKeywordPrompt, gemini);
              } catch (error) {
                  console.error("Broader keyword generation with primary model failed, trying fallback.", error);
                  keywords = await this.generateKeywords(broaderKeywordPrompt, geminiFallback);
              }
              console.log('Broader keywords generated:', keywords);

              if (keywords.length > 0) {
                  const results = await this.queryDatabase(keywords.join(' '));
                  if (results && results.length > 0) {
                      const filteredResults = results.filter(r => 
                          keywords.some(keyword => r.document.toLowerCase().includes(keyword.toLowerCase()))
                      );

                      if (filteredResults.length > 0) {
                          context_str = filteredResults.map(r => `[Source Status: ${r.metadata && r.metadata.verified ? "VERIFIED" : "UNVERIFIED"}]\n${r.document}`).join("\n---\n");
                          console.log(`Context found with broader keywords and pre-filtered to ${filteredResults.length} relevant results.`);
                      }
                  }
              }
          }

          if (!context_str) {
              return { success: false, message: `I couldn't find any information about "${query}" in my knowledge base.` };
          }
          
          // Step 3: One-Shot Answer Generation with Uncertainty Check
          const finalPrompt = `You are Mitsuko, an AI assistant for the game "Once Human". Your task is to answer the user's question using the provided context.

**CRITICAL INSTRUCTIONS:**
1.  **Analyze the Context:** The context below is from a database. Each entry is tagged with its source status: \`[Source Status: VERIFIED]\` or \`[Source Status: UNVERIFIED]\`.
2.  **Prioritize Verified Information:** If you find any information from a \`VERIFIED\` source, you MUST treat it as the absolute truth. Base your entire answer on the verified information if it's relevant.
3.  **Assess Confidence & Generate Answer:**
    *   **If you use \`VERIFIED\` context to answer the question,** you are confident. Provide a direct, clear answer. Do NOT use the \`NEEDS_VERIFICATION\` tag.
    *   **If the only relevant context is \`UNVERIFIED\`,** you are not confident. Generate the best answer you can, but you MUST end your response with the special string: \`NEEDS_VERIFICATION\`.
    *   **If no context is relevant,** you MUST respond with the single, specific string: \`NO_RELEVANT_INFO_FOUND\` and nothing else.

Context:
---
${context_str}
---

User Question: ${query}`;

          const chat = gemini.startChat({ history: chatHistory });
          const result = await chat.sendMessage(finalPrompt);
          let finalAnswer = result.response.text();

          if (finalAnswer.trim() === 'NO_RELEVANT_INFO_FOUND') {
              console.log('AI determined that no relevant information was found in the context.');
              return { success: false, message: 'I found some related information, but not a specific answer.' };
          }

          if (finalAnswer.endsWith('NEEDS_VERIFICATION')) {
              const answerToVerify = finalAnswer.replace('NEEDS_VERIFICATION', '').trim();
              finalAnswer = answerToVerify; // Immediately clean the final answer

              if (!disableWebSearch) {
                  console.log('AI is uncertain and web search is enabled. Verifying online.');
                  const verificationPrompt = `You are a fact-checker. I will provide an answer generated from an internal database and the original user question. Your task is to:
1.  Formulate a precise Google search query to verify the information in the answer.
2.  Analyze the web search results.
3.  Synthesize the information from the original answer and the web search into a single, corrected, and comprehensive final answer.

**Original Answer:**
---
${answerToVerify}
---

**Original User Question:** "${query}"`;

                  const verificationModel = client.genAI.getGenerativeModel({ model: "gemini-2.5-flash", tools: [groundingTool] });
                  const verificationResult = await verificationModel.generateContent(verificationPrompt);
                  finalAnswer = verificationResult.response.text();
              } else {
                  console.log('AI is uncertain, but no web search was requested. Returning RAG answer with a disclaimer.');
                  finalAnswer += "\n\n*(I'm not 100% confident about this information, but it's what I found in my knowledge base.)*";
              }
          }

          console.log('AI generated a final answer.');
          return { success: true, answer: finalAnswer };

      } catch (error) {
          console.error('Error executing search_knowledge_base tool:', error);
          return { success: false, message: 'An error occurred while searching the knowledge base.' };
      }
    }

    async google_search_tool(args, client) {
        try {
            console.log('Tool `google_search` called with:', args);
            const { query } = args;
            
            // The model is now fully responsible for creating a good search query based on the system prompt.
            console.log(`Executing search with query: "${query}"`);

            const searchModel = client.genAI.getGenerativeModel({ model: "gemini-2.5-flash", tools: [groundingTool] });
            const searchResult = await searchModel.generateContent(query);
            const text = searchResult.response.text();
            return { success: true, answer: text };
        } catch (error) {
            console.error('Error executing google_search tool:', error);
            return { success: false, message: 'An error occurred while searching the web.' };
        }
    }

    async add_data(document, metadata) {
        try {
            // Check if service is healthy
            const isHealthy = await this.checkHealth();
            if (!isHealthy) {
                throw new Error('RAG service is not available. Please ensure the Python service is running.');
            }
            console.log('Sending data to RAG service:', { document, metadata });
            const response = await axios.post(`${RAG_SERVICE_URL}/add`, {
                document,
                metadata
            });
            if (response.data.success) {
                console.log('Successfully added data to RAG service');
                return response.data;
            } else {
                console.error('RAG service error:', response.data.error);
                throw new Error(response.data.error || 'Unknown error occurred while adding data');
            }
        } catch (error) {
            if (error.code === 'ECONNREFUSED') {
                console.error('Could not connect to RAG service. Is it running?');
                throw new Error('RAG service is not running. Please start the Python service.');
            }
            console.error('Error sending data to RAG service:', error.message);
            throw error;
        }
    }

    async update_data(id, document, metadata) {
        try {
            const isHealthy = await this.checkHealth();
            if (!isHealthy) {
                throw new Error('RAG service is not available.');
            }
            console.log('Sending update to RAG service:', { id, document, metadata });
            const response = await axios.post(`${RAG_SERVICE_URL}/update`, {
                id,
                document,
                metadata
            });
            if (response.data.success) {
                console.log('Successfully updated data in RAG service');
                return response.data;
            } else {
                console.error('RAG service error on update:', response.data.error);
                throw new Error(response.data.error || 'Unknown error occurred while updating data');
            }
        } catch (error) {
            console.error('Error sending update to RAG service:', error.message);
            throw error;
        }
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

    async generateKeywords(promptText, model) {
        try {
            const chat = model.startChat({ history: [] });
            const result = await chat.sendMessage(promptText);
            const text = result.response.text();
            return text.trim().split(',').map(keyword => keyword.trim()).filter(k => k);
        } catch (error) {
            console.error(`Error generating keywords with model:`, error);
            throw error;
        }
    }

    async generateWithRetry(model, prompt, isChat = false, chatHistory = []) {
        const keyManager = require('./keyManager');
        const totalKeys = keyManager.keys.length;

        for (let i = 0; i < totalKeys; i++) {
            try {
                if (isChat) {
                    const chat = model.startChat({ history: chatHistory });
                    const result = await chat.sendMessage(prompt);
                    return result;
                } else {
                    const result = await model.generateContent(prompt);
                    return result;
                }
            } catch (error) {
                if (error.message.includes('429') || (error.response && error.response.status === 429)) {
                    console.warn(`API key ${keyManager.currentIndex} failed with 429. Rotating to next key.`);
                    keyManager.nextKey;
                    model = keyManager.aI.getGenerativeModel({ model: "gemini-1.5-pro-latest" });
                } else {
                    console.error('An unhandled error occurred during content generation:', error);
                    throw error;
                }
            }
        }
        throw new Error('All API keys failed with 429 Too Many Requests.');
    }

    async retrieveAndGenerate(query, chatHistory, client, message, youtubeVideoId = null, attachmentData = null) {
        try {
            console.log('Local RAG system: retrieveAndGenerate function called.');
            
            let model = client.gemini;
            let isGameRelated = false;

            if (youtubeVideoId || attachmentData) {
                const modelWithVision = client.genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
                let multimodalQuery = query;
                if (attachmentData) {
                    multimodalQuery = `(You are Mitsuko. Analyze this image and respond in your usual fun, witty, and slightly edgy persona. Be concise unless the user asks for a detailed breakdown.)\n\n${query}`;
                }
                const contentParts = [multimodalQuery];

                if (youtubeVideoId) {
                    const youtubeUrl = `https://www.youtube.com/watch?v=${youtubeVideoId}`;
                    contentParts.push({ fileData: { mimeType: "video/youtube", fileUri: youtubeUrl } });
                }

                if (attachmentData) {
                    contentParts.push({ inlineData: { data: attachmentData.buffer.toString('base64'), mimeType: attachmentData.mimeType } });
                }

                const result = await this.generateWithRetry(modelWithVision, contentParts);
                return result.response.text();
            }

            const customToolChat = model.startChat({
                history: chatHistory,
                tools: [{ functionDeclarations: [
                    AVAILABLE_TOOLS.add_lore,
                    AVAILABLE_TOOLS.search_knowledge_base,
                    AVAILABLE_TOOLS.google_search,
                    AVAILABLE_TOOLS.update_lore,
                ] }],
                systemInstruction: { role: 'system', parts: [{ text: this.systemPrompt }] },
            });

            const customToolResult = await this.generateWithRetry(customToolChat, query, true, chatHistory);
            const customToolResponse = customToolResult.response;
            const customToolCalls = customToolResponse.functionCalls();

            if (customToolCalls && customToolCalls.length > 0) {
                const toolPromises = customToolCalls.map(async (call) => {
                    let toolResult;
                    switch (call.name) {
                        case 'search_knowledge_base':
                            isGameRelated = true;
                            if (isBuildQuery(query)) {
                                const ragResult = await this.tools.search_knowledge_base(call.args, client, chatHistory, query, true);
                                return { name: call.name, response: ragResult };
                            } else {
                                const ragResult = await this.tools.search_knowledge_base(call.args, client, chatHistory, query, false);
                                if (!ragResult.success || (ragResult.answer && ragResult.answer.includes('NEEDS_VERIFICATION'))) {
                                    const fallbackResult = await this.tools.google_search(call.args, client);
                                    return { name: call.name, response: fallbackResult };
                                }
                                return { name: call.name, response: ragResult };
                            }
                        case 'add_lore':
                            toolResult = await this.tools.add_lore(call.args, message, client);
                            return { name: call.name, response: toolResult };
                        case 'google_search':
                            toolResult = await this.tools.google_search(call.args, client);
                            return { name: call.name, response: toolResult };
                        case 'update_lore':
                            toolResult = await this.tools.update_lore(call.args, message, client);
                            return { name: call.name, response: toolResult };
                        default:
                            return { name: call.name, response: { success: false, message: 'Unknown tool.' } };
                    }
                });

                const toolResponses = await Promise.all(toolPromises);
                const finalResponseResult = await this.generateWithRetry(customToolChat, toolResponses.map(toolResponse => ({ functionResponse: toolResponse })), true, chatHistory);
                return finalResponseResult.response.text();
            } else if (customToolResponse.text()) {
                return customToolResponse.text();
            }
 
            return "I'm not sure how to respond to that. Could you try rephrasing?";
        } catch (error) {
            console.error('Error in Local RAG system:', error);
            throw new Error('Failed to retrieve and generate response.');
        }
    }
}

module.exports = { LocalRAGSystem };
