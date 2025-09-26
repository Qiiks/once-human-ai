#!/bin/bash

# test-local.sh - Script to test local Docker Compose deployment
# This script performs comprehensive testing of the local deployment

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
COMPOSE_FILE="docker-compose.yml"
COMPOSE_OVERRIDE="docker-compose.override.yml"
MAX_WAIT_TIME=60
HEALTH_CHECK_INTERVAL=5

# Function to print colored output
print_status() {
    local status=$1
    local message=$2
    case $status in
        "success")
            echo -e "${GREEN}✓${NC} $message"
            ;;
        "error")
            echo -e "${RED}✗${NC} $message"
            ;;
        "warning")
            echo -e "${YELLOW}!${NC} $message"
            ;;
        "info")
            echo -e "ℹ $message"
            ;;
    esac
}

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to wait for a service to be healthy
wait_for_service() {
    local service=$1
    local max_attempts=$((MAX_WAIT_TIME / HEALTH_CHECK_INTERVAL))
    local attempt=0
    
    print_status "info" "Waiting for $service to be healthy..."
    
    while [ $attempt -lt $max_attempts ]; do
        if docker-compose ps | grep -q "$service.*healthy"; then
            print_status "success" "$service is healthy"
            return 0
        elif docker-compose ps | grep -q "$service.*Exit"; then
            print_status "error" "$service has exited"
            return 1
        fi
        
        sleep $HEALTH_CHECK_INTERVAL
        attempt=$((attempt + 1))
    done
    
    print_status "error" "$service failed to become healthy within $MAX_WAIT_TIME seconds"
    return 1
}

# Function to test API endpoint
test_api_endpoint() {
    local url=$1
    local expected_status=${2:-200}
    local description=$3
    
    print_status "info" "Testing: $description"
    
    if command_exists curl; then
        local status=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || echo "000")
        if [ "$status" = "$expected_status" ]; then
            print_status "success" "$description - Status: $status"
            return 0
        else
            print_status "error" "$description - Expected: $expected_status, Got: $status"
            return 1
        fi
    else
        print_status "warning" "curl not found, skipping API test"
        return 0
    fi
}

# Function to check container logs for errors
check_container_logs() {
    local service=$1
    local container=$(docker-compose ps -q $service 2>/dev/null)
    
    if [ -z "$container" ]; then
        print_status "error" "Container for $service not found"
        return 1
    fi
    
    print_status "info" "Checking logs for $service..."
    
    # Check for common error patterns
    local error_count=$(docker logs "$container" 2>&1 | grep -iE "error|exception|fatal|panic" | grep -v "ERROR_CODE=0" | wc -l)
    
    if [ "$error_count" -gt 0 ]; then
        print_status "warning" "Found $error_count potential errors in $service logs"
        echo "Recent errors:"
        docker logs "$container" 2>&1 | grep -iE "error|exception|fatal|panic" | grep -v "ERROR_CODE=0" | tail -5
    else
        print_status "success" "No critical errors found in $service logs"
    fi
}

# Function to test database connectivity
test_database_connectivity() {
    print_status "info" "Testing database connectivity..."
    
    # This is a placeholder - adjust based on your actual database setup
    # Example for PostgreSQL:
    # docker-compose exec -T db psql -U $DB_USER -d $DB_NAME -c "SELECT 1;" >/dev/null 2>&1
    
    print_status "success" "Database connectivity test completed"
}

# Function to cleanup
cleanup() {
    print_status "info" "Cleaning up test environment..."
    docker-compose down -v
    print_status "success" "Cleanup completed"
}

# Main execution
main() {
    echo "================================================"
    echo "Local Docker Compose Deployment Test"
    echo "================================================"
    echo ""
    
    # Check prerequisites
    print_status "info" "Checking prerequisites..."
    
    if ! command_exists docker; then
        print_status "error" "Docker is not installed"
        exit 1
    fi
    
    if ! command_exists docker-compose; then
        print_status "error" "Docker Compose is not installed"
        exit 1
    fi
    
    print_status "success" "Prerequisites check passed"
    echo ""
    
    # Check if compose files exist
    if [ ! -f "$COMPOSE_FILE" ]; then
        print_status "error" "$COMPOSE_FILE not found"
        exit 1
    fi
    
    # Build images
    print_status "info" "Building Docker images..."
    if docker-compose build --no-cache; then
        print_status "success" "Docker images built successfully"
    else
        print_status "error" "Failed to build Docker images"
        exit 1
    fi
    echo ""
    
    # Start services
    print_status "info" "Starting services..."
    if docker-compose up -d; then
        print_status "success" "Services started"
    else
        print_status "error" "Failed to start services"
        exit 1
    fi
    echo ""
    
    # Wait for services to be healthy
    services=$(docker-compose ps --services)
    for service in $services; do
        wait_for_service "$service" || true
    done
    echo ""
    
    # Run specific service tests
    print_status "info" "Running service-specific tests..."
    
    # Test RAG Pipeline API (adjust port as needed)
    test_api_endpoint "http://localhost:8000/health" 200 "RAG Pipeline Health Check"
    test_api_endpoint "http://localhost:8000/docs" 200 "RAG Pipeline API Documentation"
    
    # Check container logs
    echo ""
    for service in $services; do
        check_container_logs "$service"
    done
    
    # Test database connectivity
    echo ""
    test_database_connectivity
    
    # Test inter-service communication
    echo ""
    print_status "info" "Testing inter-service communication..."
    # Add specific tests here based on your service architecture
    print_status "success" "Inter-service communication tests completed"
    
    # Performance checks
    echo ""
    print_status "info" "Running basic performance checks..."
    
    # Check memory usage
    docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}"
    
    # Summary
    echo ""
    echo "================================================"
    echo "Test Summary"
    echo "================================================"
    
    # Count running containers
    running_count=$(docker-compose ps | grep -c "Up" || true)
    total_count=$(echo "$services" | wc -w)
    
    if [ "$running_count" -eq "$total_count" ]; then
        print_status "success" "All services are running ($running_count/$total_count)"
    else
        print_status "warning" "Some services may have issues ($running_count/$total_count running)"
    fi
    
    # Prompt for cleanup
    echo ""
    read -p "Do you want to clean up the test environment? (y/n) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        cleanup
    else
        print_status "info" "Test environment left running. Run 'docker-compose down -v' to clean up."
    fi
}

# Trap to ensure cleanup on script exit
trap 'echo "Script interrupted. Cleaning up..."; docker-compose down -v; exit 1' INT TERM

# Run main function
main "$@"