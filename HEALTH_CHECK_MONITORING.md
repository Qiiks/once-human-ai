# Health Check and Monitoring Implementation

This document describes the comprehensive health check and monitoring mechanisms implemented for the Once Human Discord Bot microservices deployment.

## Overview

The implementation addresses the original 503 health check failures by providing robust health check endpoints, proper Docker health check commands, and comprehensive monitoring capabilities for both local development and Coolify production deployment.

## Health Check Endpoints

### RAG Service (`rag-service:5000`)

#### `/health` - Comprehensive Health Check
- **Purpose**: Complete service health validation
- **Response**: JSON with detailed status of all components
- **Checks**:
  - Flask server status
  - ChromaDB client connection
  - Collection availability and query functionality
  - Embedding model availability
  - Database storage accessibility
  - Memory usage monitoring
  - Environment configuration validation

**Example Response**:
```json
{
  "status": "healthy",
  "timestamp": "2025-09-27T16:30:00.000Z",
  "service": "rag-service",
  "version": "1.0.0",
  "checks": {
    "flask_server": {
      "status": "healthy",
      "message": "Flask server is running"
    },
    "chromadb_client": {
      "status": "healthy",
      "message": "ChromaDB client is connected"
    },
    "chromadb_collection": {
      "status": "healthy",
      "message": "Collection accessible with 1250 documents",
      "document_count": 1250
    },
    "embedding_model": {
      "status": "healthy",
      "message": "Sentence transformer model is loaded and functional",
      "model_name": "all-MiniLM-L6-v2"
    },
    "database_storage": {
      "status": "healthy",
      "message": "Database path accessible at /data/chroma_db",
      "path": "/data/chroma_db",
      "size_mb": 45.2
    },
    "memory_usage": {
      "status": "healthy",
      "message": "Memory usage is acceptable: 65%",
      "memory_percent": 65,
      "available_gb": 1.2
    },
    "environment": {
      "status": "healthy",
      "message": "All required environment variables are set"
    }
  },
  "metrics": {
    "uptime_seconds": 3600,
    "total_requests": 150,
    "successful_queries": 145,
    "failed_queries": 5
  }
}
```

#### `/readiness` - Kubernetes-style Readiness Probe
- **Purpose**: Quick check if service is ready to accept traffic
- **Response**: Simple ready/not_ready status
- **Use**: Kubernetes readiness probes, load balancer health checks

#### `/liveness` - Kubernetes-style Liveness Probe
- **Purpose**: Basic service alive check
- **Response**: Simple alive status with uptime
- **Use**: Kubernetes liveness probes, basic monitoring

#### `/metrics` - Prometheus-style Metrics
- **Purpose**: Detailed metrics for monitoring systems
- **Response**: Service metrics, request counters, system information
- **Use**: Prometheus scraping, monitoring dashboards

### Discord Bot (`discord-bot:3000`)

#### `/health` - Comprehensive Health Check
- **Purpose**: Complete bot health validation including RAG connectivity
- **Response**: JSON with detailed status of all components
- **Checks**:
  - Discord client connection status
  - RAG service connectivity validation
  - Environment configuration check
  - Memory usage monitoring
  - RAG system initialization status

**Example Response**:
```json
{
  "status": "healthy",
  "timestamp": "2025-09-27T16:30:00.000Z",
  "service": "discord-bot",
  "version": "1.0.0",
  "checks": {
    "discord": {
      "status": "healthy",
      "message": "Discord client is connected and ready",
      "guild_count": 5,
      "user_tag": "OnceHumanBot#1234"
    },
    "rag_service": {
      "status": "healthy",
      "message": "RAG service is healthy",
      "url": "http://rag-service:5000",
      "response_time_ms": "150",
      "rag_checks": {
        "chromadb_client": { "status": "healthy" },
        "embedding_model": { "status": "healthy" }
      }
    },
    "environment": {
      "status": "healthy",
      "message": "All required environment variables are set"
    },
    "memory": {
      "status": "healthy",
      "message": "Memory usage: 180MB heap used",
      "memory_mb": {
        "rss": 220,
        "heapTotal": 200,
        "heapUsed": 180,
        "external": 15
      }
    },
    "rag_system": {
      "status": "healthy",
      "message": "Local RAG system is initialized"
    }
  }
}
```

#### `/metrics` - Bot Metrics
- **Purpose**: Discord bot specific metrics
- **Response**: Bot metrics, Discord connection info, system stats

## Docker Health Check Commands

### RAG Service Health Check
```yaml
healthcheck:
  test: ["CMD", "python", "-c", "
    import requests, sys;
    try:
      r = requests.get('http://127.0.0.1:5000/health', timeout=10);
      if r.status_code == 200:
        health_data = r.json();
        sys.exit(0 if health_data.get('status') == 'healthy' else 1)
      else:
        sys.exit(1)
    except Exception as e:
      print(f'Health check failed: {e}');
      sys.exit(1)
  "]
  interval: 30s
  timeout: 15s
  retries: 5
  start_period: 90s  # Allow extra time for model loading
```

### Discord Bot Health Check
```yaml
healthcheck:
  test: ["CMD", "node", "-e", "
    const http = require('http');
    const options = {
      hostname: '127.0.0.1',
      port: process.env.HEALTH_CHECK_PORT || 3000,
      path: '/health',
      timeout: 10000
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const health = JSON.parse(data);
          process.exit(health.status === 'healthy' ? 0 : 1);
        } catch (e) {
          process.exit(res.statusCode === 200 ? 0 : 1);
        }
      });
    });
    req.on('error', (e) => {
      console.error('Health check error:', e.message);
      process.exit(1);
    });
    req.on('timeout', () => {
      console.error('Health check timeout');
      process.exit(1);
    });
    req.setTimeout(10000);
    req.end();
  "]
  interval: 30s
  timeout: 15s
  retries: 5
  start_period: 60s
```

## Key Improvements Made

### 1. Fixed 503 Health Check Failures
- **Problem**: Docker health checks were using `localhost` which doesn't work in containers
- **Solution**: Changed to `127.0.0.1` for internal container networking
- **Problem**: Basic health checks didn't validate actual service functionality
- **Solution**: Implemented comprehensive health validation including dependencies

### 2. Enhanced Health Check Logic
- **Before**: Simple static response `{"status": "healthy"}`
- **After**: Comprehensive validation of:
  - Database connectivity (ChromaDB)
  - Model availability (Sentence Transformers)
  - Storage accessibility
  - Memory usage
  - Environment configuration
  - Service dependencies

### 3. Improved Docker Health Check Commands
- **Before**: Basic HTTP status code check
- **After**: JSON response parsing with detailed status validation
- **Added**: Proper error handling and logging
- **Added**: Increased timeouts and retry logic for model loading

### 4. Service Dependency Validation
- **RAG Service**: Validates ChromaDB connection, collection access, embedding model
- **Discord Bot**: Validates Discord API connection, RAG service connectivity, environment setup
- **Cross-service**: Bot validates it can reach and communicate with RAG service

## Monitoring Scripts

### `scripts/health-check.sh`
Enhanced comprehensive health checking script with:
- Support for new health endpoints
- Detailed health status parsing
- Metrics collection and display
- Service dependency validation
- Docker container health checking
- Continuous monitoring mode

**Usage**:
```bash
# Single health check
./scripts/health-check.sh check

# Continuous monitoring
./scripts/health-check.sh monitor 30

# Help
./scripts/health-check.sh help
```

### `scripts/validate-health-checks.sh`
New comprehensive validation script that tests:
- All health endpoints functionality
- Response time validation
- Error scenario handling
- Docker health check validation
- Service dependency chains

**Usage**:
```bash
# Run validation
./scripts/validate-health-checks.sh validate

# Verbose mode
VERBOSE=true ./scripts/validate-health-checks.sh validate
```

### `scripts/verify-deployment.sh`
Enhanced deployment verification with:
- Comprehensive health endpoint testing
- Service dependency validation
- Detailed health status reporting
- Production deployment validation

## Monitoring Integration

### Prometheus Metrics
Both services expose `/metrics` endpoints compatible with Prometheus scraping:
- Request counters
- Response times
- Error rates
- System metrics (memory, uptime)
- Service-specific metrics

### Kubernetes Integration
Health check endpoints support Kubernetes probe patterns:
- **Liveness Probe**: `/liveness` - Basic service alive check
- **Readiness Probe**: `/readiness` - Service ready for traffic
- **Startup Probe**: `/health` - Comprehensive startup validation

### Coolify Integration
Health checks work seamlessly with Coolify deployment:
- Proper container networking (127.0.0.1)
- Appropriate timeouts for model loading
- Detailed error reporting for debugging
- Service dependency validation

## Troubleshooting

### Common Issues and Solutions

1. **503 Health Check Failures**
   - **Cause**: Using `localhost` in Docker health checks
   - **Solution**: Use `127.0.0.1` for internal container networking

2. **Health Check Timeouts**
   - **Cause**: Model loading takes time on startup
   - **Solution**: Increased `start_period` to 90s for RAG service

3. **ChromaDB Connection Failures**
   - **Cause**: Database path not accessible or ChromaDB not initialized
   - **Solution**: Health check validates database path and connection

4. **RAG Service Connectivity Issues**
   - **Cause**: Network configuration or service discovery problems
   - **Solution**: Discord bot health check validates RAG service connectivity

### Health Check Debugging

1. **Check individual endpoints**:
   ```bash
   curl http://localhost:5000/health | jq
   curl http://localhost:3000/health | jq
   ```

2. **Validate Docker health status**:
   ```bash
   docker inspect --format='{{.State.Health.Status}}' once-human-rag
   docker inspect --format='{{.State.Health.Status}}' once-human-bot
   ```

3. **Run comprehensive validation**:
   ```bash
   ./scripts/validate-health-checks.sh validate
   ```

## Deployment Validation

After deployment, run the verification script to ensure all health checks are working:

```bash
# Local deployment
ENVIRONMENT=local ./scripts/verify-deployment.sh

# Production deployment
ENVIRONMENT=production \
PRODUCTION_RAG_URL=https://your-rag-service.coolify.app \
PRODUCTION_BOT_URL=https://your-bot-service.coolify.app \
./scripts/verify-deployment.sh
```

## Conclusion

This comprehensive health check and monitoring implementation resolves the original 503 health check failures and provides robust monitoring capabilities for both development and production environments. The solution includes:

- ✅ Fixed Docker health check commands using proper internal networking
- ✅ Comprehensive health validation including all service dependencies
- ✅ Enhanced monitoring with metrics and detailed status reporting
- ✅ Kubernetes-compatible health check endpoints
- ✅ Coolify deployment validation and monitoring
- ✅ Automated testing and validation scripts
- ✅ Detailed troubleshooting and debugging capabilities

The health checks now properly validate service functionality rather than just basic connectivity, ensuring reliable deployment monitoring and faster issue detection.