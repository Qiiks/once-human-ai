const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const fs = require('fs');
const { Client, Collection, GatewayIntentBits } = require('discord.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { LocalRAGSystem } = require('./utils/localRAG');


// Initialize Discord Client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

// Load structured data
client.gameEntities = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'rag_pipeline', 'game_entities.json'), 'utf8'));


// Initialize Google Generative AI
const keyManager = require('./utils/keyManager');
const genAI = keyManager.aI;
client.genAI = genAI; // Attach the main AI instance to the client
client.keyManager = keyManager;
client.gemini = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
client.geminiFallback = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });
client.embeddingModel = genAI.getGenerativeModel({ model: 'embedding-001' }); // Initialize embedding model

// Initialize the RAG System and attach it to the client
client.ragSystem = new LocalRAGSystem(keyManager);

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