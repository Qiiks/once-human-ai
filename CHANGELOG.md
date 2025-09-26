# Changelog

All notable changes to the Once Human AI Knowledge Steward project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Comprehensive deployment documentation in `DEPLOYMENT.md`
- Docker Compose configuration for multi-service architecture
- Production-ready Docker Compose overrides (`docker-compose.prod.yml`)
- Coolify deployment support with detailed instructions
- Environment variable template (`.env.example`)
- Health checks for both services
- Automated backup configuration
- Resource limits and monitoring setup

### Changed
- Migrated from monolithic container to microservices architecture
- Updated README.md with new deployment instructions
- Separated Discord bot and RAG pipeline into independent services
- Improved Docker build process with multi-stage builds
- Enhanced volume management for persistent data

### Removed
- All references to fly.io deployment
- Legacy deployment configurations

### Security
- Implemented secret management best practices
- Added network isolation between services
- Configured proper access controls

## [1.0.0] - Initial Release

### Added
- Discord bot with Once Human game knowledge
- RAG (Retrieval-Augmented Generation) pipeline
- PDF processing capabilities
- Memory system for conversation context
- Research planning and execution features
- Administrative commands
- Channel management features

### Project Initialization
- Created `CHANGELOG.md` to track project history
- Set up initial project structure
- Implemented core bot functionality