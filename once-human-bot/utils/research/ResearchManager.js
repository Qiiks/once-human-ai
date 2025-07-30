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

        let step = state.getNextStep();
        while (step) {
            if (step.iterate_over) {
                let items = state.getCollectedData()[step.iterate_over];
                if (!Array.isArray(items)) {
                    items = [items];
                }
                const results = {};
                for (const item of items) {
                    const newStep = JSON.parse(JSON.stringify(step));
                    newStep.parameters.query = newStep.parameters.query.replace('{item}', item);
                    results[item] = await this.engine.execute(newStep);
                }
                state.updateStepResult(step.stepId, results);
            } else {
                const result = await this.engine.execute(step);
                state.updateStepResult(step.stepId, result);
            }
            step = state.getNextStep();
        }

        return state.getCollectedData();
    }
}

module.exports = ResearchManager;