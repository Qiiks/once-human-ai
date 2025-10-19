const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const fs = require('fs');
const { Client, Collection, GatewayIntentBits } = require('discord.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { IntegratedRAGSystem } = require('./utils/integratedRAG');
const { initializeSupabase } = require('./utils/supabaseClient');

// Configuration validation schema
const configSchema = {
    required: [
        'DISCORD_BOT_TOKEN',
        'GEMINI_API_KEYS',
        'SUPABASE_URL',
        'SUPABASE_KEY'
    ],
    optional: [
        'LOG_LEVEL',
        'NODE_ENV'
    ],
    validation: {
        'DISCORD_BOT_TOKEN': /^[A-Za-z0-9._-]+$/,
        'LOG_LEVEL': ['debug', 'info', 'warn', 'error']
    }
};

// Environment variable validation function
function validateEnvironment() {
    const errors = [];
    const warnings = [];

    // Check required variables
    for (const required of configSchema.required) {
        if (!process.env[required]) {
            errors.push(`Missing required environment variable: ${required}`);
        }
    }

    // Validate format of existing variables
    for (const [key, pattern] of Object.entries(configSchema.validation)) {
        const value = process.env[key];
        if (value) {
            if (pattern instanceof RegExp && !pattern.test(value)) {
                errors.push(`Invalid format for ${key}: ${value}`);
            } else if (Array.isArray(pattern) && !pattern.includes(value)) {
                errors.push(`Invalid value for ${key}: ${value}. Must be one of: ${pattern.join(', ')}`);
            }
        }
    }

    // Check optional but recommended variables
    // RAG_SERVICE_URL is no longer needed - using integrated RAG with PostgreSQL

    if (!process.env.DATABASE_PATH) {
        warnings.push('DATABASE_PATH not set, using default: /data/memory.db');
    }

    // Log results
    if (warnings.length > 0) {
        console.warn('Configuration warnings:');
        warnings.forEach(warning => console.warn(`  - ${warning}`));
    }

    if (errors.length > 0) {
        console.error('Configuration validation failed:');
        errors.forEach(error => console.error(`  - ${error}`));
        console.error('\nPlease check your environment variables and try again.');
        process.exit(1);
    }

    console.log('✅ Environment configuration validated successfully');
    
    // Log current configuration (without sensitive values)
    console.log('Current configuration:');
    console.log(`  - NODE_ENV: ${process.env.NODE_ENV || 'development'}`);
    console.log(`  - LOG_LEVEL: ${process.env.LOG_LEVEL || 'info'}`);
    console.log(`  - Supabase configured: ${!!process.env.SUPABASE_URL}`);
    console.log(`  - Gemini API keys configured: ${!!process.env.GEMINI_API_KEYS}`);
}

// Validate environment before starting
validateEnvironment();

// Initialize Supabase
async function initializeServices() {
    try {
        console.log('Initializing Supabase...');
        await initializeSupabase();
        console.log('✅ Supabase initialized successfully');
    } catch (error) {
        console.error('❌ Failed to initialize Supabase:', error);
        console.error('Please ensure SUPABASE_URL and SUPABASE_KEY environment variables are set.');
        process.exit(1);
    }
}

// Call initialization before creating Discord client
initializeServices().catch(error => {
    console.error('Failed to initialize services:', error);
    process.exit(1);
});

// Initialize HTTP server for health checks
const http = require('http');
const healthCheckPort = process.env.HEALTH_CHECK_PORT || 3000;

// Initialize Discord Client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

// Health check endpoint with comprehensive checks
const healthServer = http.createServer(async (req, res) => {
    if (req.url === '/health' && req.method === 'GET') {
        const healthStatus = {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            service: 'discord-bot',
            version: process.env.SERVICE_VERSION || '1.0.0',
            checks: {}
        };
        
        let overallHealthy = true;
        
        // Discord client status
        if (client.isReady()) {
            healthStatus.checks.discord = {
                status: 'healthy',
                message: 'Discord client is connected and ready',
                guild_count: client.guilds.cache.size,
                user_tag: client.user?.tag || 'unknown'
            };
        } else {
            healthStatus.checks.discord = {
                status: 'unhealthy',
                message: 'Discord client is not connected'
            };
            overallHealthy = false;
        }
        
        // RAG System health check (integrated, no external service)
        if (client.ragSystem) {
            try {
                const isHealthy = await client.ragSystem.checkHealth();
                healthStatus.checks.rag_system = {
                    status: isHealthy ? 'healthy' : 'unhealthy',
                    message: isHealthy ? 'Integrated RAG system is operational' : 'RAG system health check failed'
                };
                if (!isHealthy) {
                    overallHealthy = false;
                }
            } catch (error) {
                healthStatus.checks.rag_system = {
                    status: 'unhealthy',
                    message: `RAG system check failed: ${error.message}`
                };
                overallHealthy = false;
            }
        } else {
            healthStatus.checks.rag_system = {
                status: 'unhealthy',
                message: 'Integrated RAG system is not initialized'
            };
            overallHealthy = false;
        }
        
        // Set overall status
        healthStatus.status = overallHealthy ? 'healthy' : 'unhealthy';
        
        const statusCode = healthStatus.status === 'healthy' ? 200 : 503;
        res.writeHead(statusCode, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(healthStatus, null, 2));
    } else if (req.url === '/metrics' && req.method === 'GET') {
        // Metrics endpoint for monitoring
        const metrics = {
            service: 'discord-bot',
            timestamp: new Date().toISOString(),
            uptime_seconds: process.uptime(),
            memory_usage: process.memoryUsage(),
            discord: {
                ready: client.isReady(),
                guild_count: client.guilds?.cache?.size || 0,
                user_count: client.users?.cache?.size || 0
            },
            environment: {
                node_version: process.version,
                platform: process.platform,
                arch: process.arch
            }
        };
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(metrics, null, 2));
    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
    }
});

// Start health check server
healthServer.listen(healthCheckPort, '0.0.0.0', () => {
    console.log(`Health check server listening on port ${healthCheckPort}`);
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
    console.log('Received SIGTERM, shutting down gracefully...');
    healthServer.close(() => {
        client.destroy();
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('Received SIGINT, shutting down gracefully...');
    healthServer.close(() => {
        client.destroy();
        process.exit(0);
    });
});


// Initialize Google Generative AI
const keyManager = require('./utils/keyManager');
const genAI = keyManager.aI;
client.genAI = genAI; // Attach the main AI instance to the client
client.keyManager = keyManager;
client.gemini = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
client.geminiFallback = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });
client.embeddingModel = genAI.getGenerativeModel({ model: 'embedding-001' }); // Initialize embedding model

// Initialize the Integrated RAG System and attach it to the client
client.ragSystem = new IntegratedRAGSystem(keyManager);

// Command and Event Handlers
client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
    }
}

const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    const event = require(filePath);
    if (event.once) {
        client.once(event.name, (...args) => event.execute(...args, client));
    } else {
        client.on(event.name, (...args) => event.execute(...args, client));
    }
}

// Bot Login
client.login(process.env.DISCORD_BOT_TOKEN);