# Testing Guide for Once Human Bot

This document provides comprehensive testing procedures for the Once Human Bot system, including manual testing, automated tests, load testing, security testing, and integration testing.

## Table of Contents

1. [Manual Testing Procedures](#manual-testing-procedures)
2. [Automated Test Instructions](#automated-test-instructions)
3. [Load Testing Recommendations](#load-testing-recommendations)
4. [Security Testing Checklist](#security-testing-checklist)
5. [Integration Testing Between Services](#integration-testing-between-services)

## Manual Testing Procedures

### 1. Discord Bot Testing

#### Basic Functionality
1. **Bot Connection**
   - Verify bot appears online in Discord
   - Check bot status message
   - Confirm bot responds to mentions

2. **Command Testing**
   ```
   /oh help - Should display all available commands
   /oh query "What is Once Human?" - Should return game information
   /memory status - Should show memory system status
   /research start "game mechanics" - Should initiate research
   /add-lore "New lore entry" - Should add lore to database
   ```

3. **Channel Management**
   - Test `/setChannel` in different channels
   - Verify `/unsetChannel` removes channel restrictions
   - Confirm bot only responds in designated channels

4. **Error Handling**
   - Send malformed commands
   - Test with extremely long inputs
   - Verify rate limiting works correctly

### 2. RAG Pipeline Testing

#### API Endpoints
1. **Health Check**
   ```bash
   curl http://localhost:8000/health
   # Expected: {"status": "healthy"}
   ```

2. **Query Processing**
   ```bash
   curl -X POST http://localhost:8000/query \
     -H "Content-Type: application/json" \
     -d '{"query": "test query", "k": 5}'
   ```

3. **Document Processing**
   - Upload a test PDF via the API
   - Verify processing completes
   - Check if content is searchable

#### Manual UI Testing
1. Navigate to `http://localhost:8000/docs`
2. Test each endpoint through Swagger UI
3. Verify response formats and error messages

### 3. Database Testing

#### Data Persistence
1. **Create Test Data**
   - Add memory entries
   - Create chat history
   - Store research results

2. **Restart Services**
   ```bash
   docker-compose restart
   ```

3. **Verify Data**
   - Check if all data persists
   - Verify relationships intact
   - Test data retrieval

#### Backup and Restore
1. Create database backup
2. Modify some data
3. Restore from backup
4. Verify restoration success

## Automated Test Instructions

### 1. Setting Up Test Environment

```bash
# Create test environment file
cp .env.example .env.test

# Install test dependencies (if not already installed)
cd once-human-bot && npm install --save-dev jest @types/jest
cd ../rag_pipeline && pip install pytest pytest-asyncio pytest-cov
```

### 2. Running Unit Tests

#### Discord Bot Tests
```bash
cd once-human-bot
npm test

# Run specific test suite
npm test -- --testPathPattern=memory

# Run with coverage
npm test -- --coverage
```

#### RAG Pipeline Tests
```bash
cd rag_pipeline
pytest

# Run with coverage
pytest --cov=. --cov-report=html

# Run specific test file
pytest test_rag_service.py
```

### 3. Integration Tests

Create a test script `test-integration.sh`:
```bash
#!/bin/bash
# Run integration tests
docker-compose -f docker-compose.test.yml up --abort-on-container-exit
```

### 4. Continuous Testing

```bash
# Watch mode for JavaScript tests
npm test -- --watch

# Watch mode for Python tests
pytest-watch
```

## Load Testing Recommendations

### 1. Tools Setup

#### Using Apache Bench (ab)
```bash
# Install Apache Bench
apt-get install apache2-utils  # Ubuntu/Debian
brew install ab                # macOS

# Basic load test
ab -n 1000 -c 10 http://localhost:8000/health
```

#### Using K6
```javascript
// load-test.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
  stages: [
    { duration: '2m', target: 10 },   // Ramp up to 10 users
    { duration: '5m', target: 10 },   // Stay at 10 users
    { duration: '2m', target: 20 },   // Ramp up to 20 users
    { duration: '5m', target: 20 },   // Stay at 20 users
    { duration: '2m', target: 0 },    // Ramp down to 0 users
  ],
};

export default function() {
  // Test RAG query endpoint
  let payload = JSON.stringify({
    query: "What is Once Human?",
    k: 5
  });
  
  let params = {
    headers: {
      'Content-Type': 'application/json',
    },
  };
  
  let response = http.post('http://localhost:8000/query', payload, params);
  
  check(response, {
    'status is 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500,
  });
  
  sleep(1);
}
```

Run with:
```bash
k6 run load-test.js
```

### 2. Discord Bot Load Testing

```javascript
// discord-load-test.js
const { Client, GatewayIntentBits } = require('discord.js');

async function loadTest() {
  const testUsers = 10;
  const messagesPerUser = 100;
  const clients = [];
  
  // Create multiple bot clients
  for (let i = 0; i < testUsers; i++) {
    const client = new Client({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
    });
    
    await client.login(process.env[`TEST_TOKEN_${i}`]);
    clients.push(client);
  }
  
  // Send messages concurrently
  const promises = clients.map((client, index) => {
    return sendMessages(client, messagesPerUser, index);
  });
  
  await Promise.all(promises);
}
```

### 3. Performance Benchmarks

Target metrics:
- **Response Time**: < 2s for bot commands
- **Throughput**: > 100 requests/second for RAG API
- **Concurrent Users**: Support 50+ simultaneous Discord users
- **Memory Usage**: < 1GB per service under normal load
- **CPU Usage**: < 70% under peak load

## Security Testing Checklist

### 1. Authentication & Authorization

- [ ] Verify Discord token is not exposed in logs
- [ ] Check API keys are properly secured
- [ ] Test unauthorized API access is blocked
- [ ] Verify role-based access controls work

### 2. Input Validation

- [ ] Test SQL injection attempts
  ```sql
  /oh query "'; DROP TABLE users; --"
  ```
- [ ] Test XSS attempts
  ```javascript
  /oh query "<script>alert('xss')</script>"
  ```
- [ ] Test command injection
  ```bash
  /oh query "test; rm -rf /"
  ```
- [ ] Test buffer overflow with large inputs

### 3. API Security

- [ ] Verify rate limiting is enforced
- [ ] Check CORS configuration
- [ ] Test for exposed debug endpoints
- [ ] Verify SSL/TLS in production

### 4. Data Security

- [ ] Check database connections are encrypted
- [ ] Verify sensitive data is not logged
- [ ] Test backup encryption
- [ ] Verify PII handling compliance

### 5. Container Security

```bash
# Scan Docker images for vulnerabilities
docker scan once-human-bot:latest
docker scan rag-pipeline:latest

# Check for security updates
docker-compose exec bot npm audit
docker-compose exec rag-pipeline pip-audit
```

## Integration Testing Between Services

### 1. Bot → RAG Pipeline Integration

```javascript
// test-bot-rag-integration.js
describe('Bot-RAG Integration', () => {
  test('Bot can query RAG pipeline', async () => {
    const response = await bot.queryRAG('test query');
    expect(response).toBeDefined();
    expect(response.results).toBeArray();
  });
  
  test('Bot handles RAG errors gracefully', async () => {
    // Simulate RAG service down
    await docker.stopContainer('rag-pipeline');
    const response = await bot.queryRAG('test query');
    expect(response.error).toBeDefined();
    await docker.startContainer('rag-pipeline');
  });
});
```

### 2. Service Communication Tests

```bash
#!/bin/bash
# test-service-communication.sh

echo "Testing inter-service communication..."

# Test Bot → Database
docker-compose exec bot node -e "
  const db = require('./utils/database');
  db.testConnection().then(() => console.log('✓ Bot → Database: OK'));
"

# Test RAG → Database
docker-compose exec rag-pipeline python -c "
  from rag_service import test_db_connection
  if test_db_connection():
      print('✓ RAG → Database: OK')
"

# Test Bot → RAG API
docker-compose exec bot curl -s http://rag-pipeline:8000/health | grep -q "healthy" && \
  echo "✓ Bot → RAG API: OK"
```

### 3. End-to-End Test Scenarios

#### Scenario 1: Complete Query Flow
1. User sends Discord command
2. Bot processes command
3. Bot queries RAG pipeline
4. RAG searches vector database
5. Results returned to user
6. Interaction logged in database

#### Scenario 2: Memory System Flow
1. User adds memory entry
2. Memory stored in database
3. Memory indexed in vector store
4. Memory retrievable via search
5. Memory persists across restarts

#### Scenario 3: Research Workflow
1. User initiates research
2. Research plan created
3. Multiple queries executed
4. Results aggregated
5. Final report generated
6. Report stored and indexed

### 4. Monitoring Integration

```yaml
# docker-compose.test.yml addition
services:
  prometheus:
    image: prom/prometheus
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
    ports:
      - "9090:9090"
  
  grafana:
    image: grafana/grafana
    ports:
      - "3000:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
```

## Test Automation Pipeline

### GitHub Actions Example

```yaml
# .github/workflows/test.yml
name: Test Suite

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v2
    
    - name: Set up Docker Compose
      run: docker-compose -f docker-compose.test.yml up -d
    
    - name: Run Unit Tests
      run: |
        docker-compose exec -T bot npm test
        docker-compose exec -T rag-pipeline pytest
    
    - name: Run Integration Tests
      run: ./scripts/test-integration.sh
    
    - name: Run Security Scan
      run: |
        docker scan once-human-bot:latest
        docker scan rag-pipeline:latest
    
    - name: Upload Coverage
      uses: codecov/codecov-action@v1
```

## Troubleshooting Test Failures

### Common Issues

1. **Port Conflicts**
   ```bash
   # Check for port usage
   netstat -tulpn | grep -E '(3000|8000|5432)'
   ```

2. **Database Connection Issues**
   ```bash
   # Check database logs
   docker-compose logs db
   
   # Test connection manually
   docker-compose exec db psql -U user -d dbname -c "SELECT 1;"
   ```

3. **Memory Issues**
   ```bash
   # Check container resources
   docker stats
   
   # Increase memory limits in docker-compose.yml
   ```

4. **Network Issues**
   ```bash
   # Check network connectivity
   docker network ls
   docker network inspect once-human-bot_default
   ```

## Best Practices

1. **Test Data Management**
   - Use separate test database
   - Create test data fixtures
   - Clean up after tests

2. **Test Isolation**
   - Each test should be independent
   - Use mocking for external services
   - Reset state between tests

3. **Continuous Testing**
   - Run tests on every commit
   - Monitor test coverage
   - Fix flaky tests immediately

4. **Performance Testing**
   - Establish baseline metrics
   - Test under realistic conditions
   - Monitor degradation over time

---

For more information or to report issues with testing procedures, please refer to the main README.md or create an issue in the repository.