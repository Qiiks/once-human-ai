# Quick Reference - Once Human AI Bot

Fast lookup for common tasks and commands.

## Commands

### User Commands
```
/oh ask <question>          # Ask the bot a question about Once Human
/memory view                # View your saved memories
/memory forget <key>        # Forget a memory
```

### Admin Commands
```
/add-lore                   # Add new knowledge to knowledge base
/research <query>           # Advanced research capabilities
/setChannel                 # Restrict bot to this channel
/unsetChannel               # Allow bot in all channels
/clearchathistory           # Clear conversation history
```

## Environment Setup

### Required Variables
```bash
DISCORD_BOT_TOKEN=          # From Discord Developer Portal
GEMINI_API_KEYS=            # From Google Gemini
SUPABASE_URL=               # From Supabase Project Settings
SUPABASE_KEY=               # From Supabase API Keys
```

### Optional Variables
```bash
NODE_ENV=development        # development or production
LOG_LEVEL=info              # debug, info, warn, error
HEALTH_CHECK_PORT=3000      # Health check server port
```

## Database Tables

### memories
Stores user-specific preferences and memories
```sql
- id: UUID
- user_id: TEXT (Discord user ID)
- key: TEXT (memory identifier)
- value: TEXT (memory content)
```

### lore_entries
Stores game knowledge base
```sql
- id: UUID
- name: TEXT (unique entry name)
- type: TEXT (Item, Weapon, Location, etc.)
- content: TEXT (full description)
- metadata: JSONB (structured data)
- embedding: TEXT (for vector search)
```

### chat_history
Stores conversation history (optional)
```sql
- id: UUID
- channel_id: TEXT
- user_id: TEXT
- role: TEXT (user or model)
- content: TEXT
```

## Project Structure

```
├── once-human-bot/
│   ├── commands/           # Slash command handlers
│   ├── events/             # Discord event handlers
│   ├── utils/              # Utility modules
│   │   ├── integratedRAG.js    # RAG system
│   │   ├── supabaseClient.js   # Database client
│   │   ├── memoryManager.js    # Memory operations
│   │   └── ...
│   └── index.js            # Bot entry point
├── rag_pipeline/           # Legacy (for migration)
├── OncehumanPDFs/          # Knowledge source docs
├── .env.example            # Environment template
├── supabase_migration.sql  # Database setup
├── SETUP.md                # Detailed setup guide
└── README.md               # Full documentation
```

## Common Tasks

### Run the bot
```bash
npm start
```

### Check bot health
```bash
curl http://localhost:3000/health
```

### Get metrics
```bash
curl http://localhost:3000/metrics
```

### Install dependencies
```bash
npm install
```

### Update environment variables
```bash
# Edit .env file with your credentials
nano .env
```

## Debugging

### Enable debug logging
```bash
LOG_LEVEL=debug npm start
```

### Check specific logs
```bash
# Filter for errors
npm start 2>&1 | grep -i error

# Follow bot logs
npm start | tail -f
```

### Test Supabase connection
```sql
-- In Supabase SQL Editor
SELECT COUNT(*) FROM lore_entries;
SELECT COUNT(*) FROM memories;
```

### Verify Discord connection
In Discord, bot should show "Online" status and accept commands

## API Endpoints

### Health Check
```
GET http://localhost:3000/health
```
Returns: Service health status with all checks

### Metrics
```
GET http://localhost:3000/metrics
```
Returns: Performance and usage metrics

## Common Errors & Solutions

| Error | Solution |
|-------|----------|
| "Invalid Discord token" | Check DISCORD_BOT_TOKEN in .env |
| "Supabase connection failed" | Verify SUPABASE_URL and SUPABASE_KEY |
| "Invalid Gemini key" | Generate new key at makersuite.google.com |
| "Command not found" | Wait 30s for Discord to sync, retype / |
| "Permission denied" | Ensure bot has proper Discord permissions |

## File Locations

- **Bot entry**: `once-human-bot/index.js`
- **Commands**: `once-human-bot/commands/*.js`
- **Events**: `once-human-bot/events/*.js`
- **RAG System**: `once-human-bot/utils/integratedRAG.js`
- **Database**: `once-human-bot/utils/supabaseClient.js`
- **Config**: `.env` (copy from `.env.example`)
- **Database Setup**: `supabase_migration.sql`

## Useful Links

- Discord.js Docs: https://discord.js.org
- Google Gemini: https://ai.google.dev
- Supabase: https://supabase.com/docs
- Discord Developers: https://discord.com/developers

## Key Concepts

**RAG (Retrieval-Augmented Generation)**
- System searches knowledge base for relevant info
- Provides context to AI model
- AI generates accurate responses

**Tool Calling**
- Bot detects user intent (search, add, update)
- Automatically calls appropriate function
- Returns result to user

**Memory System**
- Each user has personal memories
- Memories injected into responses
- Used for personalization

**Health Checks**
- Monitors bot, database, and AI service
- Accessible via HTTP endpoint
- Returns detailed status for each component

---

**For more details, see README.md and SETUP.md**
