const { getSupabaseClient } = require('./supabaseClient');

/**
 * Adds or updates a memory for a specific user.
 * @param {string} userId The ID of the user.
 * @param {string} key The key for the memory.
 * @param {string} value The memory to add or update.
 */
async function addMemory(userId, key, value) {
    try {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
            .from('memories')
            .upsert([{ user_id: userId, key, value }], { onConflict: 'user_id,key' });

        if (error) {
            console.error(`Error adding memory for user ${userId}:`, error);
            throw error;
        }
        console.log(`Added/updated memory for user ${userId}: "${key}: ${value}"`);
        return data;
    } catch (error) {
        console.error(`Failed to add memory:`, error);
        throw error;
    }
}

/**
 * Retrieves all memories for a specific user.
 * @param {string} userId The ID of the user.
 * @returns {Map<string, string>} A map of the user's memories.
 */
async function getMemories(userId) {
    try {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
            .from('memories')
            .select('key, value')
            .eq('user_id', userId);

        if (error) {
            console.error(`Error retrieving memories for user ${userId}:`, error);
            throw error;
        }

        const memories = new Map();
        if (data) {
            for (const row of data) {
                memories.set(row.key, row.value);
            }
        }
        return memories;
    } catch (error) {
        console.error(`Failed to retrieve memories:`, error);
        throw error;
    }
}

/**
 * Deletes a memory for a specific user.
 * @param {string} userId The ID of the user.
 * @param {string} key The key of the memory to delete.
 * @returns {boolean} True if a memory was deleted, false otherwise.
 */
async function deleteMemory(userId, key) {
    try {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
            .from('memories')
            .delete()
            .eq('user_id', userId)
            .eq('key', key);

        if (error) {
            console.error(`Error deleting memory for user ${userId}:`, error);
            throw error;
        }

        return data && data.length > 0;
    } catch (error) {
        console.error(`Failed to delete memory:`, error);
        throw error;
    }
}

/**
 * Retrieves all memories for all users.
 * @returns {Map<string, Map<string, string>>} A map where keys are user IDs and values are maps of their memories.
 */
async function getAllMemories() {
    try {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
            .from('memories')
            .select('user_id, key, value');

        if (error) {
            console.error('Error retrieving all memories:', error);
            throw error;
        }

        const allMemories = new Map();
        if (data) {
            for (const row of data) {
                if (!allMemories.has(row.user_id)) {
                    allMemories.set(row.user_id, new Map());
                }
                allMemories.get(row.user_id).set(row.key, row.value);
            }
        }
        return allMemories;
    } catch (error) {
        console.error('Failed to retrieve all memories:', error);
        throw error;
    }
}

module.exports = { addMemory, getMemories, deleteMemory, getAllMemories };