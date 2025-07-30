const { LocalRAGSystem } = require('../localRAG');

class ExecutionEngine {
    constructor(client) {
        this.ragSystem = new LocalRAGSystem();
        this.client = client;
        this.tools = {
            web_search: this.web_search.bind(this)
        };
    }

    async execute(step) {
        const tool = this.tools[step.tool];
        if (tool) {
            return await tool(step.parameters);
        } else {
            throw new Error(`Tool not found: ${step.tool}`);
        }
    }

    async web_search(parameters) {
        console.log(`Searching the web for: ${parameters.query}`);
        const result = await this.ragSystem.direct_google_search(parameters, this.client);
        if (result.success) {
            // Split the answer by newlines to create an array of items
            return result.answer.split('\n').filter(item => item.trim() !== '');
        } else {
            return [result.message]; // Return as an array to avoid breaking the loop
        }
    }
}

module.exports = ExecutionEngine;