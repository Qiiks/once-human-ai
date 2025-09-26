# CI/CD Pipeline Documentation

This directory contains GitHub Actions workflows for continuous integration and deployment of the Once Human Discord Bot project.

## Workflows

### 1. CI/CD Pipeline (`ci.yml`)

**Triggers:**
- Push to `main` or `master` branch
- Pull requests to `main` or `master` branch

**Jobs:**
1. **Validate Docker Compose** - Validates all Docker Compose configuration files
2. **Build Discord Bot** - Builds the Discord bot Docker image
3. **Build RAG Service** - Builds the RAG pipeline Docker image
4. **Test Services** - Starts services and runs basic health checks
5. **Security Scan** - Runs Trivy vulnerability scanner on both services

### 2. Dependency Updates (`dependency-update.yml`)

**Triggers:**
- Weekly schedule (Mondays at 9:00 AM UTC)
- Manual workflow dispatch

**Jobs:**
1. **Update NPM Dependencies** - Updates Node.js packages for both root and Discord bot
2. **Update Python Dependencies** - Updates Python packages for RAG pipeline
3. **Security Advisory Check** - Runs security scans and creates issues for vulnerabilities

## Coolify Integration Guide

### Prerequisites
- Coolify instance set up and running
- GitHub repository access
- Docker images accessible (either public or with registry credentials)

### Setup Steps

1. **Configure Your Coolify Application**
   ```
   1. Log into your Coolify dashboard
   2. Create a new application or select existing
   3. Choose "Docker Compose" as the deployment method
   4. Set the compose file to `docker-compose.prod.yml`
   ```

2. **Set Up GitHub Webhook**
   ```
   1. In Coolify, navigate to your application
   2. Go to "Webhooks" section
   3. Click "Create Webhook"
   4. Copy the generated webhook URL
   ```

3. **Configure GitHub Repository**
   ```
   1. Go to your GitHub repository
   2. Navigate to Settings > Webhooks
   3. Click "Add webhook"
   4. Paste the Coolify webhook URL
   5. Set Content type to "application/json"
   6. Choose events:
      - For automatic deployment: Select "Just the push event"
      - For more control: Select "Let me select individual events"
   7. Save the webhook
   ```

4. **Environment Variables in Coolify**
   ```
   1. In Coolify application settings
   2. Go to "Environment Variables"
   3. Add all required variables from .env.example
   4. Ensure sensitive data is properly secured
   ```

### Deployment Flow

1. **Development Workflow**
   ```
   Developer → Push to feature branch → CI runs tests → Create PR → Merge to main
   ```

2. **Deployment Workflow**
   ```
   Merge to main → GitHub webhook triggers → Coolify pulls changes → Builds/pulls images → Deploys
   ```

### Enabling Container Registry

To push images to a container registry, uncomment the registry sections in `ci.yml`:

1. **GitHub Container Registry (ghcr.io)**
   ```yaml
   env:
     REGISTRY: ghcr.io
     REGISTRY_USERNAME: ${{ github.actor }}
   ```

2. **Docker Hub**
   ```yaml
   env:
     REGISTRY: docker.io
     REGISTRY_USERNAME: your-dockerhub-username
   ```
   Add `DOCKERHUB_TOKEN` to repository secrets.

3. **Private Registry**
   ```yaml
   env:
     REGISTRY: your-registry.com
     REGISTRY_USERNAME: your-username
   ```
   Add appropriate credentials to repository secrets.

### Monitoring and Troubleshooting

1. **Check Deployment Status in Coolify**
   - View deployment logs
   - Check container status
   - Monitor resource usage

2. **GitHub Actions Logs**
   - Review workflow run details
   - Check for build failures
   - Examine test results

3. **Common Issues**
   - **Webhook not triggering**: Verify webhook URL and events
   - **Build failures**: Check Docker context and file paths
   - **Deployment failures**: Verify environment variables and secrets
   - **Container crashes**: Check application logs in Coolify

### Security Considerations

1. **Secrets Management**
   - Never commit sensitive data
   - Use Coolify's environment variables
   - Rotate credentials regularly

2. **Image Security**
   - Regular vulnerability scans with Trivy
   - Keep base images updated
   - Review dependency updates

3. **Network Security**
   - Use HTTPS for webhooks
   - Implement proper firewall rules
   - Secure database connections

### Advanced Configuration

1. **Multi-Environment Deployment**
   ```
   - Create separate Coolify applications for staging/production
   - Use different docker-compose files
   - Configure branch-specific webhooks
   ```

2. **Blue-Green Deployment**
   ```
   - Configure Coolify for zero-downtime deployments
   - Use health checks
   - Implement rollback strategies
   ```

3. **Scaling**
   ```
   - Configure resource limits in docker-compose
   - Set up horizontal scaling in Coolify
   - Monitor performance metrics
   ```

## Maintenance

- Review and update workflows monthly
- Keep GitHub Actions versions current
- Monitor security advisories
- Update documentation as needed

For more information, refer to:
- [Coolify Documentation](https://coolify.io/docs)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Docker Compose Documentation](https://docs.docker.com/compose/)