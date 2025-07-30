const StateTracker = require('./StateTracker');
const ResearchPlanner = require('./ResearchPlanner');
const ExecutionEngine = require('./ExecutionEngine');

class ResearchManager {
    constructor(client) {
        this.planner = new ResearchPlanner();
        this.engine = new ExecutionEngine(client);
    }

    async research(query, plan) {
        const state = new StateTracker(query);
        state.setPlan(plan);

        while (!state.isComplete()) {
            const step = state.getNextStep();
            if (step) {
                const result = await this.engine.execute(step);
                state.updateStepResult(step.stepId, result);
            }
        }

        return state.getCollectedData();
    }
}

module.exports = ResearchManager;