# Coolify Migration Verification Checklist

## Pre-Deployment Verification Steps

### 1. Environment Preparation
- [ ] Verify all required environment variables are documented in `.env.example`
- [ ] Ensure all secrets are properly configured in Coolify
- [ ] Confirm Docker images are built and tagged correctly
- [ ] Verify all volumes are properly defined
- [ ] Check network configurations match production requirements

### 2. Code Review
- [ ] All configuration files are updated for Coolify deployment
- [ ] Database connection strings use environment variables
- [ ] API endpoints are configurable via environment variables
- [ ] Logging is properly configured for production
- [ ] Error handling is comprehensive

### 3. Dependencies Check
- [ ] All npm packages are up to date and secure
- [ ] Python requirements are pinned to specific versions
- [ ] Docker base images are using stable versions
- [ ] No development dependencies in production builds

## Local Testing Checklist with Docker Compose

### 1. Build Verification
- [ ] Run `docker-compose build` without errors
- [ ] All services build successfully
- [ ] Image sizes are reasonable (not bloated)
- [ ] Build cache is utilized efficiently

### 2. Service Startup
- [ ] Run `docker-compose up -d` successfully
- [ ] All containers start without restart loops
- [ ] Check logs: `docker-compose logs -f`
- [ ] No error messages in startup logs
- [ ] All services reach healthy state

### 3. Connectivity Tests
- [ ] Discord bot connects successfully
- [ ] RAG pipeline API responds on correct port
- [ ] Database connections are established
- [ ] Inter-service communication works
- [ ] External API connections (Discord, Gemini) are functional

### 4. Functionality Tests
- [ ] Discord bot responds to commands
- [ ] RAG pipeline processes queries correctly
- [ ] Memory system stores and retrieves data
- [ ] Research capabilities function properly
- [ ] PDF processing works as expected

## Production Deployment Verification on Coolify

### 1. Pre-Deployment
- [ ] Backup existing data if applicable
- [ ] Document current version for rollback
- [ ] Verify Coolify server resources are adequate
- [ ] Check disk space for volumes
- [ ] Confirm network policies allow required connections

### 2. Deployment Process
- [ ] Deploy using Coolify's Docker Compose feature
- [ ] Monitor deployment logs in real-time
- [ ] Verify all services are created
- [ ] Check resource allocation (CPU, Memory)
- [ ] Confirm volumes are mounted correctly

### 3. Post-Deployment Verification
- [ ] All containers are running
- [ ] No restart loops detected
- [ ] Services are accessible via configured domains
- [ ] SSL certificates are properly configured
- [ ] Environment variables are correctly injected

## Post-Deployment Health Checks

### 1. Service Health
- [ ] Discord bot status: Online and responsive
- [ ] RAG API endpoint: Returns 200 OK on health check
- [ ] Database connectivity: Can read/write data
- [ ] Memory system: Stores and retrieves correctly
- [ ] Research engine: Processes requests

### 2. Integration Tests
- [ ] Bot commands execute without errors
- [ ] RAG queries return relevant results
- [ ] Memory persistence across restarts
- [ ] Chat history is maintained
- [ ] PDF processing completes successfully

### 3. Performance Checks
- [ ] Response times are within acceptable limits
- [ ] Memory usage is stable (no leaks)
- [ ] CPU usage is reasonable
- [ ] Database queries are optimized
- [ ] No excessive API rate limiting

## Database Migration Verification

### 1. Schema Verification
- [ ] All tables are created correctly
- [ ] Indexes are properly applied
- [ ] Foreign key constraints are enforced
- [ ] Default values are set appropriately
- [ ] Character encoding is correct (UTF-8)

### 2. Data Integrity
- [ ] Existing data migrated successfully
- [ ] No data loss during migration
- [ ] Relationships maintained correctly
- [ ] Timestamps preserved accurately
- [ ] Special characters handled properly

### 3. Backup and Recovery
- [ ] Backup procedures tested
- [ ] Recovery process documented
- [ ] Point-in-time recovery possible
- [ ] Backup automation configured
- [ ] Backup retention policy set

## Service Connectivity Tests

### 1. Internal Communication
- [ ] Bot → RAG Pipeline API
- [ ] RAG Pipeline → Database
- [ ] Bot → Database
- [ ] All services resolve DNS correctly
- [ ] Network isolation working as expected

### 2. External Communication
- [ ] Discord API connectivity
- [ ] Gemini API accessibility
- [ ] DNS resolution for external services
- [ ] Firewall rules allow required traffic
- [ ] Rate limiting properly configured

## Performance Benchmarks

### 1. Response Times
- [ ] Bot command response: < 2 seconds
- [ ] RAG query response: < 5 seconds
- [ ] Database queries: < 100ms
- [ ] Memory operations: < 50ms
- [ ] API endpoints: < 1 second

### 2. Resource Usage
- [ ] Memory usage per service documented
- [ ] CPU usage under normal load recorded
- [ ] Disk I/O patterns analyzed
- [ ] Network bandwidth requirements met
- [ ] Container restart count: 0

### 3. Scalability Tests
- [ ] Concurrent user handling tested
- [ ] Message queue performance verified
- [ ] Database connection pooling effective
- [ ] Memory system handles large datasets
- [ ] No performance degradation over time

## Rollback Procedures

### 1. Preparation
- [ ] Previous version tagged and accessible
- [ ] Database backup completed
- [ ] Configuration backup stored
- [ ] Rollback script tested
- [ ] Team notified of maintenance window

### 2. Rollback Steps
- [ ] Stop current deployment
- [ ] Restore database from backup
- [ ] Deploy previous version
- [ ] Verify service functionality
- [ ] Monitor for issues

### 3. Post-Rollback
- [ ] Document failure reasons
- [ ] Update deployment procedures
- [ ] Test fixes in staging environment
- [ ] Plan next deployment attempt
- [ ] Communicate status to stakeholders

## Log Aggregation Verification

### 1. Log Collection
- [ ] All services output logs to stdout/stderr
- [ ] Log levels appropriately configured
- [ ] Timestamps in consistent format
- [ ] Correlation IDs implemented
- [ ] No sensitive data in logs

### 2. Log Management
- [ ] Logs accessible via Coolify interface
- [ ] Log rotation configured
- [ ] Retention policies set
- [ ] Search functionality working
- [ ] Alerts configured for errors

## Security Checklist

### 1. Access Control
- [ ] API keys properly secured
- [ ] Database credentials encrypted
- [ ] No hardcoded secrets
- [ ] HTTPS enforced where applicable
- [ ] Authentication mechanisms tested

### 2. Network Security
- [ ] Unnecessary ports closed
- [ ] Services not exposed publicly unless required
- [ ] Rate limiting implemented
- [ ] DDoS protection considered
- [ ] Regular security updates planned

## Final Sign-off

- [ ] All checklist items completed
- [ ] Documentation updated
- [ ] Team trained on new procedures
- [ ] Monitoring alerts configured
- [ ] Success criteria met
- [ ] Deployment approved by stakeholders

---

**Note**: This checklist should be reviewed and updated based on specific deployment experiences and requirements.