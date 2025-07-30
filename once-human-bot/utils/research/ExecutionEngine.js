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
        const result = await this.ragSystem.google_search_tool(parameters, this.client);
        if (result.success) {
            return result.answer;
        } else {
            return result.message;
        }
    }
}

module.exports = ExecutionEngine;