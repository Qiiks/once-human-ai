const { GoogleGenerativeAI } = require("@google/generative-ai");
const axios = require('axios');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;
const MISTRAL_API_URL = 'https://api.mistral.ai/v1/chat/completions';

function getPrompt(query, memories) {
    return `You are a helpful and intelligent assistant responsible for analyzing a user's memories to determine their relevance to a given query. Your goal is to identify memories that could provide useful context for a larger, more powerful AI that has access to a comprehensive knowledge base (RAG). The user is asking about the video game 'Once Human', a multiplayer open-world survival game. Your reasoning should be within the context of this game.

The connection between a memory and the query may not be direct. You need to think step-by-step about how a memory might be related, even if it requires a reasoning leap.

**User Query:**
"${query}"

**User Memories:**
${JSON.stringify(memories)}

**Your Task:**

1.  **Analyze the Query:** Understand the user's intent. What are they asking for?
2.  **Review Each Memory:** For each memory, consider if it could be related to the query, even indirectly.
3.  **Reason Step-by-Step:** Think about the potential connections. For example, if the query is about a "pant mod" and a memory is "mains boom boom," reason that "boom boom" might be a "build," and information about that build in the RAG would likely contain details about pant mods.
4.  **Output a Structured List:** Your final output must be a JSON object containing a list of only the relevant memories. For each relevant memory, provide a brief explanation of why it is relevant.

**Example:**

**User Query:** "what pant mod should I use?"
**User Memories:** ["mains boom boom", "likes to explore far away", "favorite color is blue"]

**Your JSON Output:**
{
  "relevant_memories": [
    {
      "memory": "mains boom boom",
      "reason": "The user's memory 'mains boom boom' likely refers to a game build. The main model can access the RAG to find build details, which would include information on pant mods for that build."
    }
  ]
}

Now, perform the analysis for the provided query and memories.`;
}

async function analyzeWithMistral(prompt) {
    try {
        const response = await axios.post(MISTRAL_API_URL, {
            model: 'mistral-large-2411',
            messages: [{ role: 'user', content: prompt }],
            response_format: { type: "json_object" }
        }, {
            headers: {
                'Authorization': `Bearer ${MISTRAL_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        // Add robust error checking for the response structure.
        if (!response.data || !Array.isArray(response.data.choices) || response.data.choices.length === 0) {
            console.error('Error: Invalid response structure from Mistral API.', {
                data: response.data
            });
            return null;
        }

        const choice = response.data.choices;
        if (!choice.message || typeof choice.message.content !== 'string') {
            console.error('Error: Invalid message structure in Mistral API response.', {
                choice: choice
            });
            return null;
        }

        const { content } = choice.message;

        // Wrap the parsing logic in a try...catch block.
        try {
            const parsed = JSON.parse(content);
            if (parsed && Array.isArray(parsed.relevant_memories)) {
                return parsed.relevant_memories.map(m => m.memory);
            } else {
                console.error('Error: Parsed content does not have a relevant_memories array.', {
                    parsedContent: parsed
                });
                return null;
            }
        } catch (parseError) {
            console.error('Error: Failed to parse JSON from Mistral response.', {
                error: parseError,
                rawContent: content
            });
            return null;
        }
    } catch (apiError) {
        console.error('Error: Mistral API call failed.', {
            error: apiError.response ? apiError.response.data : apiError.message
        });
        return null;
    }
}

async function analyzeWithGemini(prompt) {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
        const result = await model.generateContent(prompt);
        const text = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(text);
        return parsed.relevant_memories.map(m => m.memory);
    } catch (error) {
        console.error("Gemini API call failed:", error);
        return null;
    }
}

async function analyzeRelevance(query, memories) {
    const prompt = getPrompt(query, memories);
    const relevanceModel = process.env.RELEVANCE_MODEL || 'MISTRAL';

    let relevantMemories = null;

    if (relevanceModel === 'MISTRAL') {
        console.log("Attempting relevance analysis with Mistral...");
        relevantMemories = await analyzeWithMistral(prompt);
    } else if (relevanceModel === 'GEMINI') {
        console.log("Attempting relevance analysis with Gemini...");
        relevantMemories = await analyzeWithGemini(prompt);
    } else {
        console.error(`Invalid RELEVANCE_MODEL specified: ${relevanceModel}. Defaulting to original memories.`);
        return Array.from(memories.values());
    }

    if (relevantMemories === null) {
        console.log("Relevance analysis failed. Returning original memories as a fallback.");
        return Array.from(memories.values()); // Fallback
    }

    return relevantMemories;
}

module.exports = { analyzeRelevance };