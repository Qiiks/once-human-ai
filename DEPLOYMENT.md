# Deployment Guide for Once Human AI Knowledge Steward

This guide provides comprehensive instructions for deploying the Once Human Discord Bot to production using Coolify, including migration from other platforms, environment configuration, and maintenance procedures.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Coolify Setup](#coolify-setup)
3. [Application Configuration](#application-configuration)
4. [Environment Variables](#environment-variables)
5. [Persistent Volumes](#persistent-volumes)
6. [Deployment Process](#deployment-process)
7. [Webhook Configuration](#webhook-configuration)
8. [Monitoring and Logging](#monitoring-and-logging)
9. [Backup and Restore](#backup-and-restore)
10. [Troubleshooting](#troubleshooting)
11. [Migration Checklist](#migration-checklist)

## Prerequisites

Before beginning deployment, ensure you have:

- [ ] A Coolify instance (v4.0+ recommended) with:
  - Sufficient resources (minimum 4GB RAM, 2 vCPUs)
  - Docker and Docker Compose installed
  - Valid SSL certificates configured
- [ ] GitHub/GitLab repository with the application code
- [ ] Discord Bot Token from [Discord Developer Portal](https://discord.com/developers/applications)
- [ ] Google Gemini API Keys from [Google AI Studio](https://makersuite.google.com/app/apikey)
- [ ] Basic understanding of Docker and container orchestration

## Coolify Setup

### 1. Initial Coolify Configuration

1. **Access your Coolify instance**
   ```
   https://your-coolify-domain.com
   ```

2. **Create a new project**
   - Navigate to Projects → New Project
   - Name: `once-human-bot`
   - Description: `Once Human Discord Bot with RAG Pipeline`

3. **Add a new resource**
   - Type: `Docker Compose`
   - Name: `once-human-bot-app`

### 2. Repository Connection

1. **Connect your Git repository**
   - Source: GitHub/GitLab/Custom Git
   - Repository URL: `https://github.com/your-username/once-human-bot.git`
   - Branch: `main` (or your production branch)
   - Deploy Key: Generate and add to your repository

2. **Configure build settings**
   - Build Pack: Docker Compose
   - Compose File: `docker-compose.yml`
   - Production Override: `docker-compose.prod.yml`

## Application Configuration

### 1. Docker Compose Configuration

Ensure your repository contains:

**docker-compose.yml** (base configuration):
```yaml
version: '3.8'

services:
  rag-service:
    build:
      context: .
      dockerfile: rag_pipeline/Dockerfile
    container_name: once-human-rag
    env_file:
      - .env
    environment:
      - CHROMA_DB_PATH=/data/chroma_db
      - SENTENCE_TRANSFORMERS_HOME=/app/model_cache
    volumes:
      - chroma_db:/data/chroma_db
      - sqlite_db:/data
      - model_cache:/app/model_cache
    networks:
      - app-network
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "python", "-c", "import requests; requests.get('http://localhost:5000/health')"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  discord-bot:
    build:
      context: .
      dockerfile: once-human-bot/Dockerfile
    container_name: once-human-bot
    env_file:
      - .env
    environment:
      - RAG_SERVICE_URL=http://rag-service:5000
      - DATABASE_PATH=/data/memory.db
    volumes:
      - sqlite_db:/data
    networks:
      - app-network
    depends_on:
      rag-service:
        condition: service_healthy
    restart: unless-stopped

volumes:
  chroma_db:
    driver: local
  sqlite_db:
    driver: local
  model_cache:
    driver: local

networks:
  app-network:
    driver: bridge
```

**docker-compose.prod.yml** (production overrides):
```yaml
version: '3.8'

services:
  rag-service:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 3G
        reservations:
          cpus: '1'
          memory: 2G
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

  discord-bot:
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 1G
        reservations:
          cpus: '0.5'
          memory: 512M
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

### 2. Dockerfile Configuration

Ensure both services have optimized Dockerfiles:

**rag_pipeline/Dockerfile**:
```dockerfile
FROM python:3.12-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install dependencies
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
COPY OncehumanPDFs/ ./OncehumanPDFs/
COPY .env ./

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD python -c "import requests; requests.get('http://localhost:5000/health')"

CMD ["python3", "rag_pipeline/rag_service.py"]
```

**once-human-bot/Dockerfile**:
```dockerfile
FROM node:20-slim

WORKDIR /app

# Install system dependencies
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
COPY rag_pipeline/game_entities.json ./rag_pipeline/
COPY .env ./

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "process.exit(0)"

CMD ["node", "once-human-bot/index.js"]
```

## Environment Variables

### 1. Configure in Coolify UI

Navigate to your application → Environment Variables and add:

```bash
# Discord Configuration
DISCORD_BOT_TOKEN=your_discord_bot_token_here

# Google AI Configuration (comma-separated for load balancing)
GEMINI_API_KEYS=key1,key2,key3

# Database Paths (DO NOT CHANGE for Docker deployment)
CHROMA_DB_PATH=/data/chroma_db
DATABASE_PATH=/data/memory.db

# Service Communication
RAG_SERVICE_URL=http://rag-service:5000

# Production Settings
NODE_ENV=production
FLASK_ENV=production
LOG_LEVEL=info
```

### 2. Secret Management

Mark sensitive variables as "Secret" in Coolify:
- `DISCORD_BOT_TOKEN`
- `GEMINI_API_KEYS`

## Persistent Volumes

### 1. Volume Configuration in Coolify

Navigate to your application → Persistent Storage:

1. **ChromaDB Volume**
   - Name: `chroma_db`
   - Mount Path: `/data/chroma_db`
   - Size: 2GB (adjust based on knowledge base size)

2. **SQLite Database Volume**
   - Name: `sqlite_db`
   - Mount Path: `/data`
   - Size: 500MB

3. **Model Cache Volume**
   - Name: `model_cache`
   - Mount Path: `/app/model_cache`
   - Size: 1GB

### 2. Volume Backup Configuration

Enable automatic backups:
- Frequency: Daily
- Retention: 7 days
- Include: `chroma_db`, `sqlite_db`
- Exclude: `model_cache` (can be regenerated)

## Deployment Process

### 1. Initial Deployment

1. **Commit all configuration files** to your repository
   ```bash
   git add docker-compose.yml docker-compose.prod.yml
   git add rag_pipeline/Dockerfile once-human-bot/Dockerfile
   git commit -m "Add Coolify deployment configuration"
   git push origin main
   ```

2. **In Coolify, click "Deploy"**
   - Monitor build logs in real-time
   - First deployment may take 10-15 minutes (model download)

3. **Verify deployment**
   - Check service health status
   - Review logs for any errors

### 2. Database Initialization

After first deployment, initialize the knowledge base:

1. **Access the container**
   ```bash
   # Via Coolify UI: Application → Terminal → rag-service
   # Or via SSH to your server:
   docker exec -it once-human-rag bash
   ```

2. **Run initialization scripts**
   ```bash
   # Process PDFs and build vector database
   python rag_pipeline/rebuild_db.py
   
   # Run any database migrations
   python rag_pipeline/run_migrations.py
   ```

3. **Verify initialization**
   ```bash
   # Check database files exist
   ls -la /data/chroma_db/
   ls -la /data/memory.db
   ```

### 3. Bot Activation

1. **Verify bot is online in Discord**
   - Check bot status in your Discord server
   - Bot should appear as online

2. **Test basic functionality**
   ```
   /oh What is Once Human?
   ```

## Webhook Configuration

### 1. Automatic Deployments

Configure GitHub/GitLab webhooks for CI/CD:

1. **In Coolify**
   - Navigate to Application → Webhooks
   - Copy the webhook URL

2. **In GitHub**
   - Repository → Settings → Webhooks → Add webhook
   - Payload URL: `[Coolify webhook URL]`
   - Content type: `application/json`
   - Events: Push events on main branch

### 2. Deployment Rules

Configure deployment triggers:
- Branch: `main` (production)
- Auto-deploy: Enabled
- Build cache: Enabled
- Prune images: After successful deployment

## Monitoring and Logging

### 1. Built-in Monitoring

Coolify provides:
- Real-time logs
- Resource usage graphs
- Health check status
- Deployment history

### 2. Log Access

**View logs in Coolify UI**:
- Application → Logs → Select Service

**Via command line**:
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f discord-bot
docker-compose logs -f rag-service

# Last 100 lines
docker-compose logs --tail=100 discord-bot
```

### 3. Health Monitoring

Configure alerts:
1. Navigate to Application → Notifications
2. Add notification channel (Discord webhook recommended)
3. Configure triggers:
   - Health check failures
   - Deployment failures
   - High resource usage

### 4. Custom Monitoring

Add application-specific metrics:

```python
# In rag_service.py
@app.route('/metrics')
def metrics():
    return {
        'vector_count': get_vector_count(),
        'query_latency': get_average_latency(),
        'cache_hit_rate': get_cache_stats()
    }
```

## Backup and Restore

### 1. Automated Backups

Configure in Coolify:
- Schedule: Daily at 2 AM
- Retention: 7 daily, 4 weekly
- Storage: Local or S3-compatible

### 2. Manual Backup

```bash
# Create backup directory
mkdir -p /backups/once-human-bot

# Backup ChromaDB
docker run --rm \
  -v once-human-chroma-db:/data \
  -v /backups/once-human-bot:/backup \
  alpine tar czf /backup/chroma-db-$(date +%Y%m%d).tar.gz /data

# Backup SQLite
docker run --rm \
  -v once-human-sqlite-db:/data \
  -v /backups/once-human-bot:/backup \
  alpine tar czf /backup/sqlite-db-$(date +%Y%m%d).tar.gz /data
```

### 3. Restore Process

```bash
# Stop services
docker-compose down

# Restore ChromaDB
docker run --rm \
  -v once-human-chroma-db:/data \
  -v /backups/once-human-bot:/backup \
  alpine sh -c "rm -rf /data/* && tar xzf /backup/chroma-db-20240315.tar.gz -C /"

# Restore SQLite
docker run --rm \
  -v once-human-sqlite-db:/data \
  -v /backups/once-human-bot:/backup \
  alpine sh -c "rm -rf /data/* && tar xzf /backup/sqlite-db-20240315.tar.gz -C /"

# Restart services
docker-compose up -d
```

## Troubleshooting

### Common Issues and Solutions

#### 1. Bot Not Coming Online

**Symptoms**: Bot appears offline in Discord

**Solutions**:
```bash
# Check bot logs
docker logs once-human-bot

# Verify token
echo $DISCORD_BOT_TOKEN

# Test connection
docker exec once-human-bot ping discord.com
```

#### 2. RAG Service Connection Failed

**Symptoms**: Bot responds with "Failed to get response from AI"

**Solutions**:
```bash
# Check service health
curl http://localhost:5000/health

# Verify internal networking
docker exec once-human-bot ping rag-service

# Check service logs
docker logs once-human-rag
```

#### 3. High Memory Usage

**Symptoms**: Container restarts, OOM errors

**Solutions**:
1. Increase memory limits in `docker-compose.prod.yml`
2. Enable swap on host system
3. Optimize model loading:
   ```python
   # Use smaller model
   model = SentenceTransformer('all-MiniLM-L6-v2')
   ```

#### 4. Slow Response Times

**Symptoms**: Bot takes long to respond

**Solutions**:
1. Check resource allocation
2. Enable query caching
3. Optimize vector search parameters
4. Consider using GPU acceleration

#### 5. Database Corruption

**Symptoms**: Errors about database locks or corruption

**Solutions**:
```bash
# Backup current database
cp /data/memory.db /data/memory.db.backup

# Repair SQLite database
docker exec once-human-rag sqlite3 /data/memory.db "PRAGMA integrity_check;"

# If corrupted, restore from backup
```

### Debug Mode

Enable debug logging:

1. **Set environment variables**:
   ```bash
   LOG_LEVEL=debug
   FLASK_DEBUG=1
   NODE_ENV=development
   ```

2. **View detailed logs**:
   ```bash
   docker-compose logs -f --tail=1000
   ```

### Performance Optimization

. **Enable BuildKit**:
   ```bash
   export DOCKER_BUILDKIT=1
   ```

2. **Use multi-stage builds** to reduce image size

3. **Implement caching strategies**:
   - Query result caching
   - Model inference caching
   - Database connection pooling

4. **Monitor and adjust resource limits** based on usage patterns

## Migration Checklist

### Pre-Migration

- [ ] **Backup existing data**
  - [ ] Export Discord bot configuration
  - [ ] Backup vector database
  - [ ] Save environment variables
  - [ ] Document current deployment settings

- [ ] **Prepare new environment**
  - [ ] Set up Coolify instance
  - [ ] Configure domain/subdomain
  - [ ] Set up SSL certificates
  - [ ] Prepare Git repository

- [ ] **Update codebase**
  - [ ] Add Docker Compose files
  - [ ] Create/update Dockerfiles
  - [ ] Remove platform-specific code
  - [ ] Update documentation

### During Migration

- [ ] **Deploy to Coolify**
  - [ ] Connect repository
  - [ ] Configure environment variables
  - [ ] Set up persistent volumes
  - [ ] Deploy application
  - [ ] Initialize databases

- [ ] **Verify functionality**
  - [ ] Bot comes online
  - [ ] Commands work correctly
  - [ ] RAG service responds
  - [ ] Data persistence works

- [ ] **Configure automation**
  - [ ] Set up webhooks
  - [ ] Enable auto-deploy
  - [ ] Configure backups
  - [ ] Set up monitoring

### Post-Migration

- [ ] **Clean up old resources**
  - [ ] Remove old deployment
  - [ ] Cancel previous hosting
  - [ ] Update DNS if needed
  - [ ] Archive old configurations

- [ ] **Update documentation**
  - [ ] Update README
  - [ ] Document new procedures
  - [ ] Update team wiki/notes
  - [ ] Notify team members

- [ ] **Monitor and optimize**
  - [ ] Watch resource usage
  - [ ] Check performance metrics
  - [ ] Review logs for issues
  - [ ] Optimize as needed

## Best Practices

### Security

1. **API Key Management**
   - Rotate keys regularly
   - Use Coolify's secret management
   - Never commit keys to Git
   - Monitor key usage

2. **Network Security**
   - Use internal networks for service communication
   - Expose only necessary ports
   - Enable SSL/TLS
   - Implement rate limiting

3. **Access Control**
   - Limit Coolify access
   - Use strong passwords
   - Enable 2FA where possible
   - Regular security audits

### Maintenance

1. **Regular Updates**
   ```bash
   # Update base images
   docker pull python:3.12-slim
   docker pull node:20-slim
   
   # Rebuild with latest dependencies
   docker-compose build --no-cache
   ```

2. **Database Maintenance**
   ```bash
   # Vacuum SQLite database
   docker exec once-human-rag sqlite3 /data/memory.db "VACUUM;"
   
   # Optimize ChromaDB
   docker exec once-human-rag python -c "import chromadb; db = chromadb.PersistentClient('/data/chroma_db'); db.optimize()"
   ```

3. **Log Rotation**
   - Configure in docker-compose.yml
   - Set appropriate retention
   - Monitor disk usage

### Scaling Considerations

1. **Horizontal Scaling**
   - RAG service can be replicated
   - Use load balancer for multiple instances
   - Shared volume for database access

2. **Vertical Scaling**
   - Monitor resource usage
   - Adjust limits as needed
   - Consider dedicated hardware

3. **Performance Tuning**
   - Profile application bottlenecks
   - Optimize database queries
   - Implement caching layers
   - Consider CDN for static assets

## Additional Resources

- [Coolify Documentation](https://coolify.io/docs)
- [Docker Compose Reference](https://docs.docker.com/compose/compose-file/)
- [Discord.js Guide](https://discordjs.guide/)
- [ChromaDB Documentation](https://docs.trychroma.com/)

## Support

For deployment issues:
1. Check Coolify logs and health checks
2. Review this troubleshooting guide
3. Consult application logs
4. Open an issue in the repository

Remember to always test changes in a staging environment before deploying to production!
1