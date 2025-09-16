const keyManager = require('./keyManager');

function getPrompt(query, memories) {
        return `You are a helpful and intelligent assistant responsible for analyzing a user's memories to determine their relevance to a given query. Your goal is to identify memories that could provide useful context for a larger, more powerful AI that has access to a comprehensive knowledge base (RAG). The user is asking about the video game 'Once Human', a multiplayer open-world survival game. Your reasoning should be within the context of this game.

The connection between a memory and the query may not be direct. You need to think step-by-step about how a memory might be related, even if it requires a reasoning leap.

**User Query:**
"${query}"

**User Memories:**
${JSON.stringify(Array.from(memories.entries()))}

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

async function analyzeWithGemini(prompt) {
    const totalKeys = keyManager.keys.length;
    let lastError = null;

    for (let i = 0; i < totalKeys; i++) {
        try {
            const model = keyManager.aI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
            const result = await model.generateContent(prompt);
            const text = result.response.text();
            console.log("Gemini Raw Response:", text);
            
            // Use a robust regex to extract the JSON block from the response
            // This handles both ```json and ``` code blocks
            const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
            let jsonString = jsonMatch ? jsonMatch[1] : text;
            
            // If the regex fails, try to strip the markdown formatting manually
            if (!jsonMatch) {
                jsonString = jsonString.replace(/```json/g, '').replace(/```/g, '').trim();
            }

            try {
                // Attempt to parse the extracted JSON string
                const parsed = JSON.parse(jsonString);
                return parsed.relevant_memories.map(m => m.memory);
            } catch (parseError) {
                console.error("Failed to parse JSON from Gemini response:", parseError);
                console.error("Original response text:", text);
                console.error("Extracted JSON string:", jsonString);
                return []; // Return empty array on parsing failure
            }
        } catch (error) {
            lastError = error;
            if (error.message.includes('429') || (error.response && error.response.status === 429)) {
                console.warn(`Relevance Analyzer: API key index ${keyManager.currentIndex} failed with 429. Rotating key.`);
                keyManager.nextKey; // Rotate to the next key
                continue;
            } else {
                console.error("Gemini API call failed:", error);
                return null; // Return null for API errors, empty array for parsing errors
            }
        }
    }

    console.error("Gemini API call failed for all available keys.", lastError);
    return null;
}

async function analyzeRelevance(query, memories) {
    const prompt = getPrompt(query, memories);
    
    console.log("Attempting relevance analysis with Gemini...");
    const relevantMemories = await analyzeWithGemini(prompt);

    if (relevantMemories === null) {
        console.log("Relevance analysis failed. Returning original memories as a fallback.");
        return Array.from(memories.values()); // Fallback
    }

    return relevantMemories;
}

module.exports = { analyzeRelevance };