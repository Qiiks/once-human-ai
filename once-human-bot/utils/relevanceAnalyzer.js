const { GoogleGenerativeAI } = require("@google/generative-ai");
const axios = require('axios');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;
const MISTRAL_API_URL = 'https://api.mistral.ai/v1/chat/completions';

function getPrompt(query, memories) {
    return `You are a helpful and intelligent assistant responsible for analyzing a user's memories to determine their relevance to a given query. Your goal is to identify memories that could provide useful context for a larger, more powerful AI that has access to a comprehensive knowledge base (RAG).

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
        const content = response.data.choices.message.content;
        const parsed = JSON.parse(content);
        return parsed.relevant_memories.map(m => m.memory);
    } catch (error) {
        console.error("Mistral API call failed:", error.response ? error.response.data : error.message);
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

    console.log("Attempting relevance analysis with Mistral...");
    let relevantMemories = await analyzeWithMistral(prompt);

    if (relevantMemories === null || relevantMemories.length === 0) {
        console.log("Mistral analysis failed or returned no relevant memories. Falling back to Gemini...");
        relevantMemories = await analyzeWithGemini(prompt);
    }

    if (relevantMemories === null) {
        console.log("All relevance analysis models failed. Returning original memories as a final fallback.");
        return memories; // Final fallback
    }

    return relevantMemories;
}

module.exports = { analyzeRelevance };