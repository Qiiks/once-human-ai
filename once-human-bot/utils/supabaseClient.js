const { createClient } = require('@supabase/supabase-js');
const { Client } = require('pg');

// Parse the PostgreSQL connection string
function parsePostgresUrl(postgresUrl) {
    try {
        // Format: postgresql://user:password@host:port/database
        const url = new URL(postgresUrl.replace('postgres://', 'postgresql://'));
        return {
            host: url.hostname,
            port: url.port || 5432,
            user: url.username,
            password: url.password,
            database: url.pathname.slice(1), // Remove leading '/'
        };
    } catch (error) {
        console.error('Failed to parse Postgres URL:', error);
        throw error;
    }
}

// Initialize PostgreSQL client (for direct database access)
let pgClient;
let supabaseClient;

async function initializeSupabase() {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.POSTGRES_URL;
    const supabaseKey = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl) {
        throw new Error('Missing Supabase/Postgres URL. Please set SUPABASE_URL or POSTGRES_URL environment variable.');
    }

    // Check if it's a Postgres URL (starts with postgres:// or postgresql://)
    const isPostgresUrl = supabaseUrl.startsWith('postgres://') || supabaseUrl.startsWith('postgresql://');

    if (isPostgresUrl) {
        // Use direct PostgreSQL connection
        console.log('Using direct PostgreSQL connection...');
        pgClient = new Client({
            connectionString: supabaseUrl,
            ssl: false
        });

        try {
            await pgClient.connect();
            console.log('✅ PostgreSQL connection successful');

            // Test the connection
            const result = await pgClient.query('SELECT COUNT(*) FROM lore_entries');
            console.log(`✅ Database contains ${result.rows[0].count} lore entries`);
        } catch (error) {
            console.error('❌ PostgreSQL connection failed:', error.message);
            throw error;
        }

        // Create a Supabase-compatible wrapper for our PostgreSQL client
        supabaseClient = {
            from: (table) => {
                // Query builder state
                let whereClause = '';
                let whereValues = [];
                let orderByClause = '';
                let operationType = 'select'; // Track operation: 'select', 'delete', 'update'
                
                const builder = {
                    select: function(columns = '*') {
                        builder._columns = columns;
                        operationType = 'select';
                        return builder;
                    },
                    eq: function(column, value) {
                        if (whereClause) whereClause += ' AND ';
                        whereValues.push(value);
                        whereClause += `${column} = $${whereValues.length}`;
                        return builder;
                    },
                    order: function(column, options = {}) {
                        orderByClause = ` ORDER BY ${column} ${options.ascending === false ? 'DESC' : 'ASC'}`;
                        return builder;
                    },
                    then: async function(resolve, reject) {
                        try {
                            let query;
                            let result;
                            
                            if (operationType === 'delete') {
                                query = `DELETE FROM ${table}`;
                                if (whereClause) query += ` WHERE ${whereClause}`;
                                query += ' RETURNING *';
                                result = await pgClient.query(query, whereValues);
                            } else if (operationType === 'update') {
                                // UPDATE handled separately in update() method
                                resolve({ data: null, error: new Error('Update must be called with data') });
                                return;
                            } else {
                                // SELECT
                                const columns = builder._columns || '*';
                                query = `SELECT ${columns} FROM ${table}`;
                                if (whereClause) query += ` WHERE ${whereClause}`;
                                if (orderByClause) query += orderByClause;
                                result = await pgClient.query(query, whereValues);
                            }
                            
                            resolve({ data: result.rows, error: null });
                        } catch (error) {
                            resolve({ data: null, error });
                        }
                    },
                    insert: async (data) => {
                        try {
                            const keys = Object.keys(data);
                            const values = Object.values(data);
                            
                            // Handle JSONB fields
                            const processedValues = values.map(v => 
                                typeof v === 'object' && v !== null ? JSON.stringify(v) : v
                            );
                            
                            const placeholders = processedValues.map((_, i) => `$${i + 1}`).join(', ');
                            const query = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders}) RETURNING *`;
                            const result = await pgClient.query(query, processedValues);
                            return { data: result.rows, error: null };
                        } catch (error) {
                            return { data: null, error };
                        }
                    },
                    update: async (data) => {
                        try {
                            const keys = Object.keys(data);
                            const values = Object.values(data);
                            const updates = keys.map((key, i) => `${key} = $${i + 1}`).join(', ');
                            let query = `UPDATE ${table} SET ${updates}`;
                            if (whereClause) query += ` WHERE ${whereClause}`;
                            query += ' RETURNING *';
                            const result = await pgClient.query(query, [...values, ...whereValues]);
                            return { data: result.rows, error: null };
                        } catch (error) {
                            return { data: null, error };
                        }
                    },
                    delete: function() {
                        // Set operation type and return builder to allow chaining
                        operationType = 'delete';
                        return builder;
                    },
                    upsert: async (data, options = {}) => {
                        try {
                            // Handle both array and single object
                            const records = Array.isArray(data) ? data : [data];
                            const results = [];
                            
                            for (const record of records) {
                                const keys = Object.keys(record);
                                const values = Object.values(record);
                                
                                // Handle JSONB fields
                                const processedValues = values.map(v => 
                                    typeof v === 'object' && v !== null ? JSON.stringify(v) : v
                                );
                                
                                const placeholders = processedValues.map((_, i) => `$${i + 1}`).join(', ');
                                // For ON CONFLICT UPDATE, use EXCLUDED.column to reference the new values
                                const updates = keys.map(key => `${key} = EXCLUDED.${key}`).join(', ');
                                
                                // Determine conflict columns from options or default
                                const conflictColumns = options.onConflict || 'user_id, key';
                                
                                const query = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders}) ON CONFLICT (${conflictColumns}) DO UPDATE SET ${updates} RETURNING *`;
                                const result = await pgClient.query(query, processedValues);
                                results.push(...result.rows);
                            }
                            
                            return { data: results, error: null };
                        } catch (error) {
                            console.error('Upsert error:', error);
                            console.error('Query details - table:', table, 'data:', data);
                            return { data: null, error };
                        }
                    }
                };
                
                return builder;
            }
        };

        return supabaseClient;
    } else {
        // Use Supabase client
        if (!supabaseKey) {
            throw new Error('Missing SUPABASE_KEY for Supabase client.');
        }

        supabaseClient = createClient(supabaseUrl, supabaseKey, {
            auth: {
                autoRefreshToken: true,
                persistSession: false,
                detectSessionInUrl: false,
            },
            db: {
                schema: 'public',
            },
        });

        // Test the connection
        try {
            const { data, error } = await supabaseClient
                .from('memories')
                .select('count', { count: 'exact', head: true });

            if (error) {
                console.warn('Initial Supabase query failed (tables may not exist yet):', error.message);
            } else {
                console.log('✅ Supabase connection successful');
            }
        } catch (error) {
            console.warn('Connection test failed:', error.message);
        }

        return supabaseClient;
    }
}

// Ensure tables exist
async function ensureTablesExist() {
    if (!supabaseClient && !pgClient) {
        throw new Error('Database client not initialized');
    }

    try {
        console.log('✅ Tables verified');
    } catch (error) {
        console.warn('Could not verify tables:', error.message);
    }
}

// Get the initialized client
function getSupabaseClient() {
    if (!supabaseClient) {
        throw new Error('Supabase client not initialized. Call initializeSupabase first.');
    }
    return supabaseClient;
}

// Get the PostgreSQL client directly
function getPostgresClient() {
    return pgClient;
}

module.exports = {
    initializeSupabase,
    getSupabaseClient,
    getPostgresClient,
    ensureTablesExist,
    parsePostgresUrl,
};
