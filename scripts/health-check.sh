#!/bin/bash

# health-check.sh - Script to check all service health endpoints
# This script performs comprehensive health checks on all services

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
ENVIRONMENT="${ENVIRONMENT:-local}"
CHECK_INTERVAL="${CHECK_INTERVAL:-5}"
MAX_RETRIES="${MAX_RETRIES:-3}"

# Service endpoints configuration
declare -A SERVICE_ENDPOINTS
declare -A SERVICE_PORTS

# Local environment endpoints
if [ "$ENVIRONMENT" = "local" ]; then
    SERVICE_ENDPOINTS["rag-pipeline"]="http://localhost:8000/health"
    SERVICE_ENDPOINTS["rag-docs"]="http://localhost:8000/docs"
    SERVICE_PORTS["discord-bot"]="3000"  # If bot exposes a health port
    SERVICE_PORTS["database"]="5432"     # Adjust based on your DB
else
    # Production endpoints - update these based on your Coolify deployment
    SERVICE_ENDPOINTS["rag-pipeline"]="${PRODUCTION_RAG_URL}/health"
    SERVICE_ENDPOINTS["rag-docs"]="${PRODUCTION_RAG_URL}/docs"
fi

# Health check results
declare -A HEALTH_STATUS
declare -A RESPONSE_TIMES
TOTAL_CHECKS=0
HEALTHY_CHECKS=0

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
            echo -e "${BLUE}ℹ${NC} $message"
            ;;
    esac
}

# Function to check HTTP endpoint health
check_http_endpoint() {
    local name=$1
    local url=$2
    local expected_status=${3:-200}
    local retry_count=0
    
    print_status "info" "Checking $name..."
    
    while [ $retry_count -lt $MAX_RETRIES ]; do
        local start_time=$(date +%s.%N)
        local response=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 10 "$url" 2>/dev/null || echo "000")
        local end_time=$(date +%s.%N)
        local response_time=$(echo "$end_time - $start_time" | bc)
        
        if [ "$response" = "$expected_status" ]; then
            HEALTH_STATUS["$name"]="healthy"
            RESPONSE_TIMES["$name"]=$response_time
            print_status "success" "$name is healthy (${response_time}s)"
            ((HEALTHY_CHECKS++))
            ((TOTAL_CHECKS++))
            return 0
        fi
        
        ((retry_count++))
        if [ $retry_count -lt $MAX_RETRIES ]; then
            print_status "warning" "$name check failed (attempt $retry_count/$MAX_RETRIES), retrying..."
            sleep $CHECK_INTERVAL
        fi
    done
    
    HEALTH_STATUS["$name"]="unhealthy"
    RESPONSE_TIMES["$name"]="N/A"
    print_status "error" "$name is unhealthy (Status: $response)"
    ((TOTAL_CHECKS++))
    return 1
}

# Function to check TCP port health
check_tcp_port() {
    local name=$1
    local host=$2
    local port=$3
    local retry_count=0
    
    print_status "info" "Checking $name port $port..."
    
    while [ $retry_count -lt $MAX_RETRIES ]; do
        if timeout 5 bash -c "echo >/dev/tcp/$host/$port" 2>/dev/null; then
            HEALTH_STATUS["$name"]="healthy"
            print_status "success" "$name is listening on port $port"
            ((HEALTHY_CHECKS++))
            ((TOTAL_CHECKS++))
            return 0
        fi
        
        ((retry_count++))
        if [ $retry_count -lt $MAX_RETRIES ]; then
            print_status "warning" "$name port check failed (attempt $retry_count/$MAX_RETRIES), retrying..."
            sleep $CHECK_INTERVAL
        fi
    done
    
    HEALTH_STATUS["$name"]="unhealthy"
    print_status "error" "$name is not listening on port $port"
    ((TOTAL_CHECKS++))
    return 1
}

# Function to check database health
check_database_health() {
    local name="database"
    print_status "info" "Checking database health..."
    
    # Example for PostgreSQL - adjust based on your database
    if [ "$ENVIRONMENT" = "local" ]; then
        # For local Docker deployment
        if docker-compose ps | grep -q "postgres.*Up.*healthy"; then
            HEALTH_STATUS["$name"]="healthy"
            print_status "success" "Database is healthy"
            ((HEALTHY_CHECKS++))
        else
            HEALTH_STATUS["$name"]="unhealthy"
            print_status "error" "Database health check failed"
        fi
    else
        # For production - implement based on your setup
        check_tcp_port "$name" "${DATABASE_HOST:-localhost}" "${DATABASE_PORT:-5432}"
    fi
    ((TOTAL_CHECKS++))
}

# Function to check Discord bot health
check_discord_bot_health() {
    local name="discord-bot"
    print_status "info" "Checking Discord bot health..."
    
    if [ "$ENVIRONMENT" = "local" ]; then
        # Check if bot container is running
        if docker-compose ps 2>/dev/null | grep -q "bot.*Up"; then
            # Check logs for successful Discord connection
            local bot_logs=$(docker-compose logs --tail=50 bot 2>&1 || echo "")
            if echo "$bot_logs" | grep -q "Ready!"; then
                HEALTH_STATUS["$name"]="healthy"
                print_status "success" "Discord bot is connected and ready"
                ((HEALTHY_CHECKS++))
            else
                HEALTH_STATUS["$name"]="unhealthy"
                print_status "error" "Discord bot is running but not connected"
            fi
        else
            HEALTH_STATUS["$name"]="unhealthy"
            print_status "error" "Discord bot container is not running"
        fi
    else
        # For production - check via logs or monitoring
        HEALTH_STATUS["$name"]="unknown"
        print_status "warning" "Discord bot health check not implemented for production"
    fi
    ((TOTAL_CHECKS++))
}

# Function to check memory usage
check_memory_health() {
    print_status "info" "Checking memory usage..."
    
    if [ "$ENVIRONMENT" = "local" ]; then
        # Get memory stats from Docker
        local memory_stats=$(docker stats --no-stream --format "table {{.Container}}\t{{.MemPerc}}" 2>/dev/null || echo "")
        
        if [ -n "$memory_stats" ]; then
            echo "$memory_stats"
            
            # Check if any container is using > 90% memory
            if echo "$memory_stats" | grep -E "[9][0-9]\.[0-9]+%|100\."; then
                print_status "warning" "Some containers are using high memory"
            else
                print_status "success" "Memory usage is within acceptable limits"
            fi
        fi
    else
        print_status "info" "Memory checks should be performed via Coolify monitoring"
    fi
}

# Function to perform comprehensive health check
perform_health_check() {
    echo "================================================"
    echo "Service Health Check Report"
    echo "Environment: $ENVIRONMENT"
    echo "Timestamp: $(date)"
    echo "================================================"
    echo ""
    
    # Check HTTP endpoints
    for service in "${!SERVICE_ENDPOINTS[@]}"; do
        check_http_endpoint "$service" "${SERVICE_ENDPOINTS[$service]}"
    done
    
    # Check TCP ports
    for service in "${!SERVICE_PORTS[@]}"; do
        check_tcp_port "$service" "localhost" "${SERVICE_PORTS[$service]}"
    done
    
    # Check database
    check_database_health
    
    # Check Discord bot
    check_discord_bot_health
    
    # Check system resources
    echo ""
    check_memory_health
    
    # Generate summary
    echo ""
    echo "================================================"
    echo "Health Check Summary"
    echo "================================================"
    echo "Total Checks: $TOTAL_CHECKS"
    echo "Healthy: $HEALTHY_CHECKS"
    echo "Unhealthy: $((TOTAL_CHECKS - HEALTHY_CHECKS))"
    echo ""
    
    # Display detailed status
    echo "Service Status:"
    for service in "${!HEALTH_STATUS[@]}"; do
        local status="${HEALTH_STATUS[$service]}"
        local response_time="${RESPONSE_TIMES[$service]:-N/A}"
        
        case $status in
            "healthy")
                echo -e "  ${GREEN}✓${NC} $service: $status (Response: ${response_time}s)"
                ;;
            "unhealthy")
                echo -e "  ${RED}✗${NC} $service: $status"
                ;;
            *)
                echo -e "  ${YELLOW}?${NC} $service: $status"
                ;;
        esac
    done
    
    echo "================================================"
    
    # Return appropriate exit code
    if [ $HEALTHY_CHECKS -eq $TOTAL_CHECKS ]; then
        print_status "success" "All services are healthy!"
        return 0
    else
        print_status "error" "Some services are unhealthy!"
        return 1
    fi
}

# Function to run continuous monitoring
continuous_monitoring() {
    local interval=${1:-30}
    
    print_status "info" "Starting continuous health monitoring (interval: ${interval}s)"
    print_status "info" "Press Ctrl+C to stop"
    
    while true; do
        clear
        perform_health_check || true
        echo ""
        print_status "info" "Next check in ${interval} seconds..."
        sleep $interval
    done
}

# Main execution
main() {
    case "${1:-check}" in
        "check")
            perform_health_check
            ;;
        "monitor")
            continuous_monitoring "${2:-30}"
            ;;
        "help")
            echo "Usage: $0 [check|monitor] [interval]"
            echo ""
            echo "Commands:"
            echo "  check    - Perform a single health check (default)"
            echo "  monitor  - Continuously monitor health status"
            echo ""
            echo "Options:"
            echo "  interval - Monitoring interval in seconds (default: 30)"
            echo ""
            echo "Environment Variables:"
            echo "  ENVIRONMENT    - Set to 'local' or 'production' (default: local)"
            echo "  CHECK_INTERVAL - Retry interval in seconds (default: 5)"
            echo "  MAX_RETRIES    - Maximum retry attempts (default: 3)"
            ;;
        *)
            print_status "error" "Unknown command: $1"
            echo "Run '$0 help' for usage information"
            exit 1
            ;;
    esac
}

# Run main function
main "$@"