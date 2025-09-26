# Once Human AI Knowledge Steward

## Overview

The Once Human AI Knowledge Steward is a specialized Discord bot designed to answer questions and provide information about the game "Once Human." It leverages a Retrieval-Augmented Generation (RAG) pipeline to process in-game knowledge from PDF documents and deliver accurate, context-aware responses to users within Discord servers.

## Architecture

The system consists of two microservices working in tandem:

*   **`discord-bot`**: A Node.js-based Discord bot that serves as the user interface. It handles Discord interactions, manages conversations, and communicates with the RAG service to fetch answers.
*   **`rag-service`**: A Python-based REST API responsible for knowledge processing. It ingests PDF documents, creates vector embeddings using ChromaDB, and provides semantic search capabilities for accurate information retrieval.

## Features

### Core Functionality
*   **Ask Questions**: Use the `/oh` command to ask anything about "Once Human"
*   **Knowledge Management**: Add new information to the knowledge base with `/add-lore`
*   **Memory System**: Persistent conversation memory with intelligent context management
*   **Research Capabilities**: Advanced research planning and execution system

### Administrative Features
*   **Channel Management**: Restrict bot to specific channels using `/setChannel` and `/unsetChannel`
*   **Conversation Management**: Clear chat history with `/clearchathistory`
*   **Data Integrity**: List and manage knowledge base entries with `/listentries` and `/fixmeta`
*   **Admin Utilities**: Access administrative functions via `/admin`

## Prerequisites

Before deploying the application, ensure you have:

*   **Docker** (version 20.10 or higher)
*   **Docker Compose** (version 2.0 or higher)
*   **Git** for version control
*   **Discord Bot Token** from [Discord Developer Portal](https://discord.com/developers/applications)
*   **Google Gemini API Keys** from [Google AI Studio](https://makersuite.google.com/app/apikey)
*   **Coolify** instance (for production deployment) or local Docker environment

## Quick Start

### 1. Clone the Repository
```bash
git clone <your-repository-url>
cd once-human-bot
```

### 2. Configure Environment Variables
```bash
# Copy the example environment file
cp .env.example .env

# Edit .env with your actual values
nano .env
```

Required environment variables:
- `DISCORD_BOT_TOKEN`: Your Discord bot token
- `GEMINI_API_KEYS`: Comma-separated list of Gemini API keys

### 3. Local Development Setup
```bash
# Start the application using Docker Compose
docker-compose up -d

# View logs
docker-compose logs -f

# Stop the application
docker-compose down
```

## Deployment

### Local Development with Docker Compose

The project includes a complete Docker Compose setup for local development:

```bash
# Build and start services
docker-compose up --build

# Run with development overrides (includes Adminer for database inspection)
docker-compose -f docker-compose.yml -f docker-compose.override.yml up
```

### Production Deployment on Coolify

For production deployment using Coolify, see the comprehensive [DEPLOYMENT.md](DEPLOYMENT.md) guide. Key steps include:

1. **Prepare your repository** with Docker Compose configuration
2. **Configure Coolify** with your Git repository
3. **Set environment variables** in Coolify's UI
4. **Deploy** using Coolify's one-click deployment

### Environment Variable Configuration

All sensitive configuration is managed through environment variables:

| Variable | Description | Required |
|----------|-------------|----------|
| `DISCORD_BOT_TOKEN` | Discord bot authentication token | Yes |
| `GEMINI_API_KEYS` | Comma-separated Google AI API keys | Yes |
| `CHROMA_DB_PATH` | ChromaDB storage path (default: `/data/chroma_db`) | No |
| `DATABASE_PATH` | SQLite database path (default: `/data/memory.db`) | No |
| `RAG_SERVICE_URL` | Internal RAG service URL (default: `http://rag-service:5000`) | No |

### Database Migration

For initial setup or after schema changes:

```bash
# Run migrations
docker-compose exec rag-service python run_migrations.py

# Rebuild knowledge base from PDFs
docker-compose exec rag-service python rebuild_db.py
```

### Persistent Storage

The application uses Docker volumes for data persistence:

- **`chroma_db`**: Vector database for knowledge storage
- **`sqlite_db`**: Bot memory and configuration
- **`model_cache`**: Pre-trained model cache

## Project Structure

```
once-human-bot/
├── once-human-bot/          # Discord bot (Node.js)
│   ├── commands/            # Bot command implementations
│   ├── events/              # Discord event handlers
│   ├── utils/               # Utility modules
│   └── index.js             # Main bot entry point
├── rag_pipeline/            # RAG service (Python)
│   ├── rag_service.py       # Flask API server
│   ├── process_pdf.py       # PDF processing utilities
│   └── requirements.txt     # Python dependencies
├── OncehumanPDFs/           # Source knowledge documents
├── docker-compose.yml       # Main Docker Compose configuration
├── docker-compose.prod.yml  # Production overrides
└── .env.example             # Environment variable template
```

## Development

### Running Tests
```bash
# Run bot tests
docker-compose exec discord-bot npm test

# Run RAG service tests
docker-compose exec rag-service python -m pytest
```

### Adding New Commands
1. Create a new file in `once-human-bot/commands/`
2. Implement the command following the existing pattern
3. The bot will automatically load new commands on restart

### Updating the Knowledge Base
1. Add PDF files to the `OncehumanPDFs/` directory
2. Run the rebuild script:
   ```bash
   docker-compose exec rag-service python rebuild_db.py
   ```

## Troubleshooting

### Common Issues

#### Bot Not Responding
- Check Discord bot token is valid
- Verify bot has proper permissions in the Discord server
- Check logs: `docker-compose logs discord-bot`

#### RAG Service Connection Failed
- Ensure both services are running: `docker-compose ps`
- Check internal network connectivity
- Verify RAG_SERVICE_URL is correct

#### Memory Database Errors
- Check volume permissions
- Ensure SQLite database is not corrupted
- Run migrations if needed

#### High Memory Usage
- Adjust resource limits in `docker-compose.prod.yml`
- Monitor with: `docker stats`
- Consider increasing server resources

### Logs and Debugging

```bash
# View all logs
docker-compose logs

# Follow specific service logs
docker-compose logs -f discord-bot
docker-compose logs -f rag-service

# Check service status
docker-compose ps

# Access service shell for debugging
docker-compose exec discord-bot sh
docker-compose exec rag-service bash
```

## Monitoring

### Health Checks
Both services include health checks that monitor:
- Service availability
- Database connectivity
- API responsiveness

### Resource Monitoring
```bash
# Monitor resource usage
docker stats

# Check volume usage
docker system df -v
```

## Backup and Recovery

### Automated Backups
The production configuration includes daily backups for:
- ChromaDB vector database
- SQLite memory database

### Manual Backup
```bash
# Backup all volumes
docker run --rm -v once-human-chroma-db:/data -v $(pwd):/backup alpine tar czf /backup/chroma-backup.tar.gz /data
docker run --rm -v once-human-sqlite-db:/data -v $(pwd):/backup alpine tar czf /backup/sqlite-backup.tar.gz /data

# Restore from backup
docker run --rm -v once-human-chroma-db:/data -v $(pwd):/backup alpine tar xzf /backup/chroma-backup.tar.gz -C /
docker run --rm -v once-human-sqlite-db:/data -v $(pwd):/backup alpine tar xzf /backup/sqlite-backup.tar.gz -C /
```

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit changes: `git commit -am 'Add new feature'`
4. Push to branch: `git push origin feature/your-feature`
5. Submit a pull request

## Security

- Never commit `.env` files or API keys
- Rotate API keys regularly
- Use Coolify's secret management for production
- Keep dependencies updated
- Monitor for security advisories

## Support

For issues and questions:
1. Check the [Troubleshooting](#troubleshooting) section
2. Review logs for error messages
3. Open an issue on GitHub
4. Contact the maintainers

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Discord.js community for the excellent bot framework
- Google for the Gemini AI API
- ChromaDB team for the vector database
- Once Human game community for the knowledge contributions