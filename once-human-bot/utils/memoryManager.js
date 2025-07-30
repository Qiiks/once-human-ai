// A simple in-memory store for user memories.
// In a real application, this would be backed by a persistent database.
const userMemories = new Map();

/**
 * Adds a memory for a specific user.
 * @param {string} userId The ID of the user.
 * @param {string} key The key for the memory.
 * @param {string} value The memory to add.
 */
function addMemory(userId, key, value) {
    if (!userMemories.has(userId)) {
        userMemories.set(userId, new Map());
    }
    userMemories.get(userId).set(key, value);
    console.log(`Added memory for user ${userId}: "${key}: ${value}"`);
}

/**
 * Retrieves all memories for a specific user.
 * @param {string} userId The ID of the user.
 * @returns {Map<string, string>} A map of the user's memories.
 */
function getMemories(userId) {
    return userMemories.get(userId) || new Map();
}

/**
 * Deletes a memory for a specific user.
 * @param {string} userId The ID of the user.
 * @param {string} key The key of the memory to delete.
 * @returns {boolean} True if a memory was deleted, false otherwise.
 */
function deleteMemory(userId, key) {
    if (userMemories.has(userId)) {
        return userMemories.get(userId).delete(key);
    }
    return false;
}

module.exports = { addMemory, getMemories, deleteMemory };