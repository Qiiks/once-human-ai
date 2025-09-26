# Migration Plan: Fly.io to Coolify

## Executive Summary

This document outlines a comprehensive migration plan for moving the Once Human Discord Bot application from Fly.io to Coolify using Docker Compose. The application consists of a Node.js Discord bot integrated with a Python-based RAG (Retrieval Augmented Generation) pipeline using ChromaDB for vector storage.

## Table of Contents

1. [Current Architecture Analysis](#current-architecture-analysis)
2. [Services and Dependencies](#services-and-dependencies)
3. [Migration Strategy](#migration-strategy)
4. [Docker Architecture](#docker-architecture)
5. [Environment Variables](#environment-variables)
6. [Persistent Storage](#persistent-storage)
7. [Docker Compose Configuration](#docker-compose-configuration)
8. [Coolify Deployment Steps](#coolify-deployment-steps)
9. [Testing and Validation](#testing-and-validation)
10. [Rollback Plan](#rollback-plan)

## Current Architecture Analysis

### Application Components

1. **Discord Bot (Node.js)**
   - Location: `/once-human-bot/`
   - Main entry: `index.js`
   - Dependencies: Discord.js, Google Generative AI, Axios, Better-SQLite3
   - Function: Handles Discord interactions, commands, and message processing

2. **RAG Pipeline (Python)**
   - Location: `/rag_pipeline/`
   - Main service: `rag_service.py`
   - Dependencies: Flask, ChromaDB, Sentence-Transformers
   - Function: Provides vector search and knowledge base management via REST API

3. **Shared Resources**
   - PDF documents for knowledge base
   - Game entities JSON data
   - Persistent databases (ChromaDB, SQLite)

### Current Deployment Model

The application currently uses a single Docker container that runs both services:
- Flask RAG service on port 5000
- Node.js Discord bot
- Shared volume for database persistence

## Services and Dependencies

### Node.js Discord Bot Dependencies
```json
{
  "@google/generative-ai": "^0.14.1",
  "axios": "^1.11.0",
  "cheerio": "^1.1.2",
  "discord.js": "^14.15.3",
  "dotenv": "^16.4.5",
  "undici": "^7.12.0",
  "better-sqlite3": "^11.1.2"
}
```

### Python RAG Pipeline Dependencies
```
chromadb==1.0.15
sentence-transformers
numpy
python-dotenv
flask
flask-cors
```

### System Dependencies
- Python 3.12
- Node.js 20
- Build tools for native modules

## Migration Strategy

### Phase 1: Service Separation
Split the monolithic container into two separate services for better scalability and maintenance:
1. **rag-service**: Python Flask API
2. **discord-bot**: Node.js Discord bot

### Phase 2: Shared Volume Configuration
Configure persistent volumes for:
1. ChromaDB data (`/data/chroma_db`)
2. SQLite memory database (`/data/memory.db`)
3. Model cache (`/app/model_cache`)

### Phase 3: Network Configuration
Set up internal Docker network for service communication

### Phase 4: Environment Migration
Migrate all environment variables to Coolify's environment management

## Docker Architecture

### Multi-Stage Build Strategy

#### RAG Service Dockerfile
```dockerfile
# rag-service.Dockerfile
FROM python:3.12-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy and install Python dependencies
COPY rag_pipeline/requirements.txt ./
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu && \
    pip install --no-cache-dir -r requirements.txt

# Set model cache directory
ENV SENTENCE_TRANSFORMERS_HOME=/app/model_cache
RUN mkdir -p $SENTENCE_TRANSFORMERS_HOME

# Pre-download the model
RUN python3 -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('all-MiniLM-L6-v2', cache_folder='/app/model_cache')"

# Copy application code
COPY rag_pipeline/ ./rag_pipeline/
COPY .env ./

# Copy migration script
COPY rag_pipeline/run_migrations.py ./

EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD python -c "import requests; requests.get('http://localhost:5000/health')"

CMD ["python3", "rag_pipeline/rag_service.py"]
```

#### Discord Bot Dockerfile
```dockerfile
# discord-bot.Dockerfile
FROM node:20-slim

WORKDIR /app

# Install system dependencies for better-sqlite3
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./
COPY once-human-bot/package*.json ./once-human-bot/

# Install dependencies
RUN npm install && \
    cd once-human-bot && npm install

# Copy application code
COPY once-human-bot/ ./once-human-bot/
COPY .env ./

# Copy shared resources
COPY rag_pipeline/game_entities.json ./rag_pipeline/

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "process.exit(0)"

CMD ["node", "once-human-bot/index.js"]
```

## Environment Variables

### Required Environment Variables
```env
# Discord Bot Configuration
DISCORD_BOT_TOKEN=your_discord_bot_token

# Google AI Configuration
GEMINI_API_KEYS=key1,key2,key3  # Comma-separated list of API keys

# Database Configuration
CHROMA_DB_PATH=/data/chroma_db

# Service URLs (for inter-service communication)
RAG_SERVICE_URL=http://rag-service:5000
```

### Coolify Environment Configuration
In Coolify, these should be configured as:
1. Project-level environment variables
2. Marked as "secret" for sensitive values
3. Available to both services

## Persistent Storage

### Volume Requirements

1. **ChromaDB Volume**
   - Mount path: `/data/chroma_db`
   - Size: 1GB minimum (adjust based on data growth)
   - Type: Persistent volume claim

2. **SQLite Volume**
   - Mount path: `/data`
   - Contains: `memory.db`
   - Size: 100MB minimum

3. **Model Cache Volume**
   - Mount path: `/app/model_cache`
   - Size: 500MB
   - Purpose: Cache pre-trained models

## Docker Compose Configuration

### docker-compose.yml
```yaml
version: '3.8'

services:
  rag-service:
    build:
      context: .
      dockerfile: rag-service.Dockerfile
    container_name: once-human-rag
    ports:
      - "5000:5000"
    environment:
      - CHROMA_DB_PATH=/data/chroma_db
      - SENTENCE_TRANSFORMERS_HOME=/app/model_cache
    volumes:
      - chroma_data:/data/chroma_db
      - model_cache:/app/model_cache
      - shared_data:/data
    networks:
      - app-network
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:5000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  discord-bot:
    build:
      context: .
      dockerfile: discord-bot.Dockerfile
    container_name: once-human-bot
    environment:
      - DISCORD_BOT_TOKEN=${DISCORD_BOT_TOKEN}
      - GEMINI_API_KEYS=${GEMINI_API_KEYS}
      - RAG_SERVICE_URL=http://rag-service:5000
    volumes:
      - shared_data:/data
    networks:
      - app-network
    depends_on:
      rag-service:
        condition: service_healthy
    restart: unless-stopped

volumes:
  chroma_data:
    driver: local
  model_cache:
    driver: local
  shared_data:
    driver: local

networks:
  app-network:
    driver: bridge
```

### docker-compose.prod.yml (Production Overrides)
```yaml
version: '3.8'

services:
  rag-service:
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 2G
        reservations:
          cpus: '0.5'
          memory: 1G

  discord-bot:
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 512M
        reservations:
          cpus: '0.25'
          memory: 256M
```

## Coolify Deployment Steps

### 1. Preparation
1. Create a new project in Coolify
2. Set up a Git repository connection
3. Configure environment variables in Coolify's UI

### 2. Initial Setup
```bash
# 1. Clone repository to local machine
git clone <your-repo-url>
cd <project-directory>

# 2. Create Dockerfiles
# Copy the Dockerfiles from this document

# 3. Create docker-compose files
# Copy the docker-compose.yml and docker-compose.prod.yml

# 4. Commit changes
git add .
git commit -m "Add Docker Compose configuration for Coolify"
git push
```

### 3. Coolify Configuration
1. **Create New Resource**
   - Type: Docker Compose
   - Source: Git Repository
   - Branch: main/master

2. **Environment Variables**
   ```
   DISCORD_BOT_TOKEN=<your-token>
   GEMINI_API_KEYS=<comma-separated-keys>
   ```

3. **Persistent Storage**
   - Enable persistent storage
   - Map volumes as defined in docker-compose.yml

4. **Network Configuration**
   - Internal network: Enabled
   - External access: Only for debugging (port 5000)

5. **Health Checks**
   - Enable health check monitoring
   - Set notification preferences

### 4. Database Migration
```bash
# Initial database setup (run once)
docker exec -it once-human-rag python /app/run_migrations.py
```

### 5. Deployment
1. Click "Deploy" in Coolify
2. Monitor build logs
3. Check service health status
4. Verify bot comes online in Discord

## Testing and Validation

### 1. Service Health Checks
```bash
# Check RAG service
curl http://<coolify-app-url>:5000/health

# Check Discord bot logs
docker logs once-human-bot

# Verify database persistence
docker exec -it once-human-rag ls -la /data/chroma_db
```

### 2. Functional Testing
1. **Discord Bot**
   - Send test commands
   - Verify responses
   - Check memory functions

2. **RAG Pipeline**
   - Test search queries
   - Add new knowledge entries
   - Verify data persistence

### 3. Performance Monitoring
- CPU usage per service
- Memory consumption
- Response times
- Error rates

## Rollback Plan

### Immediate Rollback
1. Stop current deployment in Coolify
2. Restore previous version
3. Verify services are operational

### Data Recovery
1. Backup volumes before migration:
   ```bash
   docker run --rm -v chroma_data:/data -v $(pwd):/backup alpine tar czf /backup/chroma_backup.tar.gz /data
   ```

2. Restore if needed:
   ```bash
   docker run --rm -v chroma_data:/data -v $(pwd):/backup alpine tar xzf /backup/chroma_backup.tar.gz -C /
   ```

## Post-Migration Tasks

1. **Remove Fly.io Resources**
   - Delete fly.io app
   - Remove fly.io CLI tools
   - Update documentation

2. **Update CI/CD**
   - Configure GitHub Actions for Coolify
   - Set up automated deployments
   - Configure build notifications

3. **Documentation Updates**
   - Update README.md
   - Document new deployment process
   - Update environment setup guides

## Monitoring and Maintenance

### Recommended Monitoring Stack
1. **Uptime Monitoring**: Coolify built-in
2. **Log Aggregation**: Coolify logs viewer
3. **Alerts**: Discord webhook notifications

### Backup Strategy
1. Daily automated backups of volumes
2. Weekly full application backups
3. Monthly backup restoration tests

## Conclusion

This migration plan provides a comprehensive approach to moving from Fly.io to Coolify. The key improvements include:
- Better service separation
- Improved scalability
- Enhanced monitoring capabilities
- Simplified deployment process
- Better resource management

The migration can be completed with minimal downtime by following the steps outlined in this document.