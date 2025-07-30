const { GoogleGenerativeAI } = require('@google/generative-ai');
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

class ResearchPlanner {
    async createPlan(query) {
        // For now, we'll use a simplified plan.
        // In the future, this will involve a call to the language model.
        const plan = [
            {
                stepId: 1,
                description: `Find a list of all items related to "${query}"`,
                tool: 'web_search',
                parameters: { query: `list of all items related to "${query}" in Once Human` },
                output_key: 'item_list'
            },
            {
                stepId: 2,
                description: 'For each item, find its details.',
                tool: 'web_search',
                parameters: { query: `details for {item} in Once Human` },
                depends_on: 1,
                iterate_over: 'item_list',
                output_key: 'item_details'
            }
        ];
        return plan;
    }
}

module.exports = ResearchPlanner;