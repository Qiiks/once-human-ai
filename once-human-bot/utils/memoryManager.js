const db = require('./database');

/**
 * Adds or updates a memory for a specific user.
 * @param {string} userId The ID of the user.
 * @param {string} key The key for the memory.
 * @param {string} value The memory to add or update.
 */
function addMemory(userId, key, value) {
    const stmt = db.prepare('INSERT OR REPLACE INTO memories (userId, key, value) VALUES (?, ?, ?)');
    stmt.run(userId, key, value);
    console.log(`Added/updated memory for user ${userId}: "${key}: ${value}"`);
}

/**
 * Retrieves all memories for a specific user.
 * @param {string} userId The ID of the user.
 * @returns {Map<string, string>} A map of the user's memories.
 */
function getMemories(userId) {
    const stmt = db.prepare('SELECT key, value FROM memories WHERE userId = ?');
    const rows = stmt.all(userId);
    const memories = new Map();
    for (const row of rows) {
        memories.set(row.key, row.value);
    }
    return memories;
}

/**
 * Deletes a memory for a specific user.
 * @param {string} userId The ID of the user.
 * @param {string} key The key of the memory to delete.
 * @returns {boolean} True if a memory was deleted, false otherwise.
 */
function deleteMemory(userId, key) {
    const stmt = db.prepare('DELETE FROM memories WHERE userId = ? AND key = ?');
    const result = stmt.run(userId, key);
    return result.changes > 0;
}

/**
 * Retrieves all memories for all users.
 * @returns {Map<string, Map<string, string>>} A map where keys are user IDs and values are maps of their memories.
 */
function getAllMemories() {
    const stmt = db.prepare('SELECT userId, key, value FROM memories');
    const rows = stmt.all();
    const allMemories = new Map();
    for (const row of rows) {
        if (!allMemories.has(row.userId)) {
            allMemories.set(row.userId, new Map());
        }
        allMemories.get(row.userId).set(row.key, row.value);
    }
    return allMemories;
}

module.exports = { addMemory, getMemories, deleteMemory, getAllMemories };