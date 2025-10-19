# Setup Guide - Once Human AI Discord Bot

Complete step-by-step guide to deploy this Discord bot with Supabase integration.

## 📋 Table of Contents
1. [Prerequisites](#prerequisites)
2. [Supabase Setup](#supabase-setup)
3. [Discord Bot Setup](#discord-bot-setup)
4. [Local Development](#local-development)
5. [Data Migration](#data-migration)
6. [Troubleshooting](#troubleshooting)

## Prerequisites

- **Node.js** 18.0.0 or higher
- **npm** or yarn
- **Git**
- A **Supabase account** (free tier available at https://supabase.com)
- A **Discord Developer account** (for bot token)
- **Google Gemini API key** (free tier available at https://makersuite.google.com)

## Supabase Setup

### 1. Create a Supabase Project

1. Go to https://supabase.com and sign in
2. Click "New project"
3. Enter project details:
   - **Name**: `once-human-bot`
   - **Database password**: Create a secure password
   - **Region**: Choose closest to you
4. Wait for project initialization (2-3 minutes)

### 2. Get Connection Credentials

1. In Supabase dashboard, go to **Settings** → **Database**
2. Copy the connection string or individual credentials:
   - **Project URL**: `https://your-project.supabase.co`
   - **Anon Key**: Go to **Settings** → **API** → copy the "anon" key
   - **Service Role Key**: (optional, for admin operations)

### 3. Run Database Migration

1. Go to **SQL Editor** in your Supabase dashboard
2. Click **New Query**
3. Copy the entire contents of `supabase_migration.sql` from this repo
4. Paste into the query editor
5. Click **Run** (or press Ctrl+Enter)

Wait for success message. Your database tables are now created!

**Tables created:**
- `memories` - User personal memories
- `lore_entries` - Game knowledge base
- `chat_history` - Conversation tracking (optional)

### 4. Verify Tables

In **Table Editor**, you should see:
- `memories` table
- `lore_entries` table  
- `chat_history` table (optional)

## Discord Bot Setup

### 1. Create Discord Bot

1. Go to https://discord.com/developers/applications
2. Click **New Application**
3. Enter name: `Once Human Bot`
4. Go to **Bot** tab → Click **Add Bot**
5. Under **TOKEN**, click **Copy** to get your bot token
6. Save this somewhere safe (you'll need it for `.env`)

### 2. Configure Bot Permissions

1. Go to **OAuth2** → **URL Generator**
2. Select scopes: `bot` + `applications.commands`
3. Select permissions:
   - ✅ Send Messages
   - ✅ Embed Links
   - ✅ Read Message History
   - ✅ Use Slash Commands
4. Copy the generated URL at bottom

### 3. Invite Bot to Server

1. Open the URL from step 2 in a browser
2. Select your Discord server
3. Click **Authorize**
4. Bot is now in your server!

### 4. Get Client ID

1. Back in Developer Portal, go to **General Information**
2. Copy your **Client ID**
3. Save for later reference

## Local Development

### 1. Clone Repository

```bash
git clone https://github.com/yourusername/once-human-ai.git
cd once-human-ai/once-human-bot
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Create Environment File

```bash
cp .env.example .env
```

### 4. Edit `.env` with Your Credentials

```bash
# Linux/Mac
nano .env

# Windows
notepad .env
```

Fill in the following:

```properties
# From Discord Developer Portal
DISCORD_BOT_TOKEN=your_bot_token_here

# From Google Gemini
GEMINI_API_KEYS=your_gemini_api_key_here

# From Supabase Project Settings
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key-here

# Optional
NODE_ENV=development
LOG_LEVEL=info
```

**Example .env (filled):**
```properties
DISCORD_BOT_TOKEN=
GEMINI_API_KEYS=
SUPABASE_URL=
SUPABASE_KEY=
NODE_ENV=development
LOG_LEVEL=info
```

### 5. Start the Bot

```bash
npm start
```

You should see:
```
✅ Environment configuration validated successfully
✅ Supabase connection successful
Health check server listening on port 3000
Bot is ready!
```

### 6. Test in Discord

In your Discord server, type:
```
/oh ask what is the point of the game?
```

The bot should respond!

## Data Migration

### Migrating from ChromaDB to Supabase

If you have existing ChromaDB data:

### 1. Export from ChromaDB

```bash
cd rag_pipeline
python3 << 'EOF'
import chromadb
import json

# Connect to ChromaDB
client = chromadb.PersistentClient(path='./chroma_db')
collection = client.get_collection('once_human_knowledge')

# Get all entries
results = collection.get(include=['embeddings', 'metadatas', 'documents'])

# Save to JSON
with open('export.json', 'w') as f:
    json.dump(results, f, indent=2)

print(f"Exported {len(results['ids'])} entries")
EOF
```

### 2. Import to Supabase

```bash
# Use the bot's import functionality
# This is typically done through the admin commands
# Or manually insert via SQL:

# In Supabase SQL Editor:
INSERT INTO lore_entries (name, type, content, metadata) VALUES
('Item Name', 'Item', 'Description here', '{}'),
('Another Item', 'Weapon', 'Weapon description', '{}');
```

### 3. Verify Migration

In Supabase **Table Editor**:
1. Click `lore_entries` table
2. Verify rows appear
3. Check content looks correct

## Docker Deployment (Optional)

### Build Docker Image

```bash
docker build -t once-human-bot .
```

### Run with Docker

```bash
docker run -d \
  -e DISCORD_BOT_TOKEN=your_token \
  -e GEMINI_API_KEYS=your_key \
  -e SUPABASE_URL=your_url \
  -e SUPABASE_KEY=your_key \
  -p 3000:3000 \
  once-human-bot
```

### Using Docker Compose

```bash
docker-compose up -d
```

## Troubleshooting

### Bot not responding in Discord

**Solution:**
1. Check bot has "Send Messages" permission in channel
2. Check bot is in the server
3. Verify token in `.env` is correct
4. Check logs: `npm start` shows errors

### "Cannot connect to Supabase"

**Solution:**
1. Verify `SUPABASE_URL` is correct format (https://...)
2. Check `SUPABASE_KEY` is valid anon key (not service role)
3. Verify network connection
4. Check Supabase project is running

### "Invalid Gemini API Key"

**Solution:**
1. Go to https://makersuite.google.com/app/apikey
2. Generate a new API key
3. Update `GEMINI_API_KEYS` in `.env`
4. Restart bot

### Health check fails

**Check endpoint:**
```bash
curl http://localhost:3000/health
```

Should return JSON with status details. If services show unhealthy:
1. Verify all credentials
2. Check network connectivity
3. Review error messages in response

### Command not working

1. Make sure bot has APPLICATION COMMANDS permission
2. Wait 30 seconds for Discord to sync
3. Try `/` to see registered commands
4. Check console output for errors

## Getting Help

1. Check the [README.md](../README.md) for more info
2. Review Supabase docs: https://supabase.com/docs
3. Check Discord.js docs: https://discord.js.org
4. Review Google Gemini docs: https://ai.google.dev

## Security Best Practices

⚠️ **Important:**
- **Never commit `.env` file to git**
- **Don't share your bot token or API keys**
- **Use `.env.example` as template only**
- **Rotate API keys periodically**
- **Use different keys for dev and production**

## Next Steps

After successful setup:
1. Add knowledge to the bot with `/add-lore` (admin only)
2. Add PDFs to `OncehumanPDFs/` directory
3. Build your own commands by copying existing ones
4. Deploy to production when ready
5. Set up monitoring and backups

---

**Happy deploying! 🎉**
