class StateTracker {
    constructor(originalQuery) {
        this.researchId = `research-${Date.now()}`;
        this.originalQuery = originalQuery;
        this.status = 'PENDING'; // PENDING, IN_PROGRESS, COMPLETED, FAILED
        this.collectedData = {};
        this.plan = [];
        this.currentStep = 0;
    }

    setPlan(plan) {
        this.plan = plan;
        this.status = 'IN_PROGRESS';
    }

    getNextStep() {
        if (this.currentStep >= this.plan.length) {
            this.status = 'COMPLETED';
            return null;
        }
        const step = this.plan[this.currentStep];
        this.currentStep++;
        return step;
    }

    updateStepResult(stepId, result) {
        const step = this.plan.find(s => s.stepId === stepId);
        if (step) {
            step.result = result;
            step.status = 'COMPLETED';
            if (step.output_key) {
                this.collectedData[step.output_key] = result;
            }
        }
    }

    isComplete() {
        return this.status === 'COMPLETED';
    }

    getCollectedData() {
        return this.collectedData;
    }
}

module.exports = StateTracker;