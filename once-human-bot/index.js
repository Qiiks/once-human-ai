require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, Collection, GatewayIntentBits } = require('discord.js');
const { Pinecone } = require('@pinecone-database/pinecone');
const { GoogleGenerativeAI } = require('@google/generative-ai');


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

// Initialize Pinecone
const pinecone = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY,
});
client.pineconeIndex = pinecone.Index(process.env.PINECONE_INDEX_NAME);

// Initialize Google Generative AI
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
client.genAI = genAI; // Attach the main AI instance to the client
client.gemini = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
client.geminiFallback = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });
client.embeddingModel = genAI.getGenerativeModel({ model: 'embedding-001' }); // Initialize embedding model


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