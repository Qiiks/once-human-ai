# Once Human AI - Discord Bot with Integrated RAG

A production-ready Discord bot powered by Google Gemini and Supabase, featuring an integrated Retrieval-Augmented Generation (RAG) system for delivering accurate game knowledge directly within Discord.

## 🎯 Project Overview

This project demonstrates a complete, scalable Discord bot architecture that combines:
- **Real-time chat interactions** via Discord.js
- **Advanced AI generation** using Google Gemini
- **Integrated RAG pipeline** for context-aware responses
- **Cloud database** with Supabase PostgreSQL
- **Production-grade health checks** and monitoring

Perfect for portfolios showcasing full-stack bot development, AI integration, and system design.

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Discord Server                           │
└────────────────────────────┬────────────────────────────────┘
                             │
                    /oh ask "what is..."
                             │
                             ▼
        ┌────────────────────────────────────────┐
        │      Discord.js Bot (Node.js)          │
        │  ┌──────────────────────────────────┐  │
        │  │  Integrated RAG System           │  │
        │  │  - Tool calling with Gemini      │  │
        │  │  - Vector search via Supabase    │  │
        │  │  - Memory management             │  │
        │  └──────────────────────────────────┘  │
        └────────────────────────────────────────┘
                             │
                  ┌──────────┼──────────┐
                  │                     │
                  ▼                     ▼
        ┌─────────────────┐   ┌─────────────────┐
        │ Google Gemini   │   │   Supabase      │
        │ API             │   │   PostgreSQL    │
        │ - Embeddings    │   │   - Lore DB     │
        │ - Chat          │   │   - User Memory │
        │ - Tool Calling  │   │   - Chat History│
        └─────────────────┘   └─────────────────┘
```

### Key Components

1. **Discord Bot (index.js)**
   - Handles Discord events and commands
   - Manages bot lifecycle and health checks
   - Coordinates between user input and RAG system

2. **Integrated RAG System (integratedRAG.js)**
   - Processes queries using semantic search
   - Calls Gemini for embeddings and generation
   - Manages tool interactions (add lore, search, save memories)
   - No external service dependency

3. **Supabase Integration (supabaseClient.js)**
   - PostgreSQL database for persistence
   - Vector-ready for future similarity searches
   - Real-time sync capabilities

4. **Commands** (/commands)
   - `/oh ask <query>` - Ask the bot about Once Human
   - `/memory view` - View your saved memories
   - `/add-lore` - Add new knowledge (admin only)
   - `/research` - Advanced research capabilities

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Supabase account (free tier works great)
- Google Gemini API key
- Discord bot token

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/yourusername/once-human-ai.git
cd once-human-ai/once-human-bot
```

2. **Install dependencies**
```bash
npm install
```

3. **Set up Supabase**
   - Create a new Supabase project at https://supabase.com
   - Copy your project URL and anon key
   - Run the migration SQL (see Setup section below)

4. **Configure environment**
```bash
cp .env.example .env
# Edit .env with your credentials:
# - DISCORD_BOT_TOKEN
# - GEMINI_API_KEYS
# - SUPABASE_URL
# - SUPABASE_KEY
```

5. **Run the bot**
```bash
npm start
```

## 📋 Setup Instructions

### Database Setup

Run the SQL migration in your Supabase project:

```sql
-- Navigate to Supabase SQL Editor and run:
-- File: supabase_migration.sql
```

This creates:
- `memories` table - User memories and preferences
- `lore_entries` table - Game knowledge base
- `chat_history` table - Conversation tracking
- Proper indexes for performance
- Row-level security policies

### Discord Server Setup

1. Invite the bot to your server using this URL:
   ```
   https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=268435456&scope=bot%20applications.commands
   ```

2. The bot automatically registers slash commands:
   - `/oh` - Main interaction command
   - `/memory` - Memory management
   - `/add-lore` - Add knowledge (admin)
   - `/research` - Research system (admin)

## 💻 Development

### Project Structure
```
once-human-bot/
├── commands/              # Slash command implementations
│   ├── oh.js             # Main interaction command
│   ├── memory.js         # Memory management
│   ├── add-lore.js       # Knowledge base management
│   └── research.js       # Research capabilities
├── events/               # Discord event handlers
│   ├── ready.js          # Bot startup
│   ├── messageCreate.js  # Message handling
│   └── interactionCreate.js
├── utils/
│   ├── integratedRAG.js  # RAG system core
│   ├── supabaseClient.js # Database connection
│   ├── memoryManager.js  # User memories
│   ├── keyManager.js     # API key rotation
│   └── ...
├── index.js              # Bot entry point
└── package.json

rag_pipeline/            # Legacy (for data migration)
├── chroma_db/          # ChromaDB data (migrate to Supabase)
└── ...

OncehumanPDFs/          # Knowledge base source documents
```

### Adding a New Command

Create a new file in `commands/`:

```javascript
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('mycommand')
        .setDescription('Description of my command')
        .addStringOption(option => 
            option.setName('input')
                  .setDescription('Input text')
                  .setRequired(true)),
    
    async execute(interaction) {
        await interaction.reply('Response here');
    }
};
```

The bot automatically loads new commands on startup.

### Working with the RAG System

```javascript
// Query the knowledge base
const result = await client.ragSystem.retrieveAndGenerate(
    userQuery,
    chatHistory,
    client,
    message
);

// Add knowledge
await supabase.from('lore_entries').insert({
    name: 'Item Name',
    type: 'Item',
    content: 'Full description',
    metadata: { /* structured data */ }
});

// Get user memories
const memories = await supabase
    .from('memories')
    .select('*')
    .eq('user_id', userId);
```

## 🔧 Configuration

### Environment Variables

**Required:**
- `DISCORD_BOT_TOKEN` - Bot authentication token
- `GEMINI_API_KEYS` - Google Gemini API key(s)
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_KEY` - Supabase anon key

**Optional:**
- `NODE_ENV` - Environment (production/development)
- `LOG_LEVEL` - Logging level (debug/info/warn/error)
- `HEALTH_CHECK_PORT` - Health check server port (default: 3000)

### Supabase Connection String

If using PostgreSQL connection string directly:
```
POSTGRES_URL=postgresql://user:password@host:port/database
```

The bot automatically converts this format.

## 📊 Health Checks

The bot includes comprehensive health monitoring:

- **Discord connection** - Bot readiness
- **Supabase connectivity** - Database health
- **RAG system** - Knowledge base availability
- **Memory usage** - Heap and RSS tracking
- **Environment validation** - Required variables

Access health status:
```bash
curl http://localhost:3000/health
curl http://localhost:3000/metrics
```

## 🔄 Data Migration

### From ChromaDB to Supabase

The `rag_pipeline/chroma_db/` directory contains your existing vector data. To migrate:

1. Export from ChromaDB:
```python
import chromadb
client = chromadb.PersistentClient(path='./rag_pipeline/chroma_db')
collection = client.get_collection('once_human_knowledge')
```

2. Import to Supabase:
```javascript
// Use the RAG system to add each entry
for (const entry of exported_entries) {
    await ragSystem.add_lore_tool({
        entry_name: entry.name,
        entry_type: entry.type,
        description: entry.content
    }, message, client);
}
```

Existing database files are preserved in:
- `rag_pipeline/chroma_db/` - ChromaDB data
- `rag_pipeline/backupppp/` - Backup copies
- `chroma.sqlite3` - SQLite memory database

## 🎨 Features Showcase

### Smart Tool Calling
The bot automatically detects user intent and calls appropriate tools:
- **Search** - `"What is...?"` → searches knowledge base
- **Add** - `"Save this..."` → stores new information
- **Update** - `"Correct that..."` → updates existing entries
- **Remember** - `"Remember I..."` → stores user preferences

### Memory System
- Per-user memory storage
- Contextual memory injection into responses
- Memory management commands

### Research System
- Multi-step research planning
- Execution tracking
- Result aggregation

### Channel Management
- Restrict bot to specific channels
- Per-channel conversation history
- Automatic summarization for long conversations

## 🧪 Testing

Health check endpoint for validation:
```bash
# Check bot health
curl http://localhost:3000/health

# Get metrics
curl http://localhost:3000/metrics
```

## 📚 Technologies Used

- **Discord.js** - Discord bot framework
- **Google Generative AI** - Gemini models for AI
- **Supabase** - PostgreSQL backend
- **Node.js** - JavaScript runtime
- **Docker** - Containerization (optional)

## 🚢 Deployment

### Docker (Recommended)

```bash
docker-compose up -d
```

### Manual Deploy

```bash
npm install
npm start
```

### Environment Variables for Production

Set these in your deployment platform:
```
DISCORD_BOT_TOKEN=***
GEMINI_API_KEYS=***
SUPABASE_URL=https://***
SUPABASE_KEY=***
NODE_ENV=production
LOG_LEVEL=info
```

## 🤝 Contributing

This is a portfolio project. Feel free to fork and use as a template for your own Discord bot!

## 📝 License

MIT License - See LICENSE file for details

## 🎓 Learning Resources

This project demonstrates:
- ✅ Discord bot architecture
- ✅ Prompt engineering and tool calling
- ✅ Vector embeddings and RAG systems
- ✅ PostgreSQL and cloud databases
- ✅ Health checks and monitoring
- ✅ Environment configuration
- ✅ Error handling and logging
- ✅ Async/await patterns
- ✅ API integration

## 📞 Support

For issues or questions:
1. Check existing issues on GitHub
2. Review the troubleshooting section in DEPLOYMENT.md
3. Check Supabase logs for database errors
4. Review Discord.js documentation

## 🎯 Next Steps

- Add vector similarity search with pgvector
- Implement PDF/document upload
- Add webhook integrations
- Create admin dashboard
- Add analytics and insights
- Multi-language support

---

**Built with ❤️ for the Once Human community**