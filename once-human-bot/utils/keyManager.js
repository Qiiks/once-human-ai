const { GoogleGenerativeAI } = require('@google/generative-ai');

class KeyManager {
    constructor() {
        this.keys = this.loadKeys();
        this.currentIndex = 0;
        if (this.keys.length === 0) {
            throw new Error('No Gemini API keys found in the GEMINI_API_KEYS environment variable.');
        }
    }

    loadKeys() {
        const keysEnvVar = process.env.GEMINI_API_KEYS;
        if (!keysEnvVar) {
            console.log('GEMINI_API_KEYS environment variable not found.');
            return [];
        }
        const keys = keysEnvVar.split(',').map(key => key.trim()).filter(key => key);
        console.log(`Loaded ${keys.length} API keys.`);
        console.log('Loaded keys:', keys); // Add this line for debugging
        return keys;
    }

    get nextKey() {
        this.currentIndex = (this.currentIndex + 1) % this.keys.length;
        console.log(`Switching to API key index ${this.currentIndex}`);
        return this.keys[this.currentIndex];
    }

    get currentKey() {
        return this.keys[this.currentIndex];
    }

    removeCurrentKey() {
        const removedKey = this.keys.splice(this.currentIndex, 1);
        console.log(`Removed invalid key: ${removedKey}`);
        if (this.keys.length === 0) {
            console.error('All API keys have been removed.');
            return false;
        }
        this.currentIndex = this.currentIndex % this.keys.length;
        return true;
    }

    get aI() {
        return new GoogleGenerativeAI(this.currentKey);
    }
}

module.exports = new KeyManager();