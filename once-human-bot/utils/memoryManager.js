// A simple in-memory store for user memories.
// In a real application, this would be backed by a persistent database.
const userMemories = new Map();

/**
 * Adds a memory for a specific user.
 * @param {string} userId The ID of the user.
 * @param {string} memory The memory to add.
 */
function addMemory(userId, memory) {
    if (!userMemories.has(userId)) {
        userMemories.set(userId, []);
    }
    userMemories.get(userId).push(memory);
    console.log(`Added memory for user ${userId}: "${memory}"`);
}

/**
 * Retrieves all memories for a specific user.
 * @param {string} userId The ID of the user.
 * @returns {string[]} A list of the user's memories.
 */
function getMemories(userId) {
    return userMemories.get(userId) || [];
}

module.exports = { addMemory, getMemories };