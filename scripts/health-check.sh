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
declare -A SERVICE_METRICS

# Local environment endpoints
if [ "$ENVIRONMENT" = "local" ]; then
    SERVICE_ENDPOINTS["rag-service"]="http://localhost:5000/health"
    SERVICE_ENDPOINTS["discord-bot"]="http://localhost:3000/health"
    SERVICE_METRICS["rag-service"]="http://localhost:5000/metrics"
    SERVICE_METRICS["discord-bot"]="http://localhost:3000/metrics"
    SERVICE_PORTS["rag-service-readiness"]="5000"
    SERVICE_PORTS["discord-bot-health"]="3000"
else
    # Production endpoints - update these based on your Coolify deployment
    SERVICE_ENDPOINTS["rag-service"]="${PRODUCTION_RAG_URL:-http://rag-service:5000}/health"
    SERVICE_ENDPOINTS["discord-bot"]="${PRODUCTION_BOT_URL:-http://discord-bot:3000}/health"
    SERVICE_METRICS["rag-service"]="${PRODUCTION_RAG_URL:-http://rag-service:5000}/metrics"
    SERVICE_METRICS["discord-bot"]="${PRODUCTION_BOT_URL:-http://discord-bot:3000}/metrics"
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

# Function to check HTTP endpoint health with detailed analysis
check_http_endpoint() {
    local name=$1
    local url=$2
    local expected_status=${3:-200}
    local retry_count=0
    
    print_status "info" "Checking $name..."
    
    while [ $retry_count -lt $MAX_RETRIES ]; do
        local start_time=$(date +%s.%N)
        local temp_file=$(mktemp)
        local response=$(curl -s -w "%{http_code}" --connect-timeout 10 --max-time 15 -o "$temp_file" "$url" 2>/dev/null || echo "000")
        local end_time=$(date +%s.%N)
        local response_time=$(echo "$end_time - $start_time" | bc 2>/dev/null || echo "0")
        
        if [ "$response" = "$expected_status" ]; then
            # Try to parse health response for detailed status
            if command -v jq >/dev/null 2>&1 && [ -s "$temp_file" ]; then
                local health_status=$(jq -r '.status // "unknown"' "$temp_file" 2>/dev/null || echo "unknown")
                local service_name=$(jq -r '.service // "unknown"' "$temp_file" 2>/dev/null || echo "unknown")
                local checks_summary=$(jq -r '.checks | to_entries | map(select(.value.status == "unhealthy" or .value.status == "error")) | length' "$temp_file" 2>/dev/null || echo "0")
                
                if [ "$health_status" = "healthy" ]; then
                    HEALTH_STATUS["$name"]="healthy"
                    RESPONSE_TIMES["$name"]=$response_time
                    print_status "success" "$name ($service_name) is healthy (${response_time}s)"
                    ((HEALTHY_CHECKS++))
                else
                    HEALTH_STATUS["$name"]="degraded"
                    RESPONSE_TIMES["$name"]=$response_time
                    print_status "warning" "$name ($service_name) reports status: $health_status ($checks_summary issues)"
                fi
            else
                HEALTH_STATUS["$name"]="healthy"
                RESPONSE_TIMES["$name"]=$response_time
                print_status "success" "$name is responding (${response_time}s)"
                ((HEALTHY_CHECKS++))
            fi
            rm -f "$temp_file"
            ((TOTAL_CHECKS++))
            return 0
        fi
        
        ((retry_count++))
        if [ $retry_count -lt $MAX_RETRIES ]; then
            print_status "warning" "$name check failed (attempt $retry_count/$MAX_RETRIES), retrying..."
            sleep $CHECK_INTERVAL
        fi
        rm -f "$temp_file"
    done
    
    HEALTH_STATUS["$name"]="unhealthy"
    RESPONSE_TIMES["$name"]="N/A"
    print_status "error" "$name is unhealthy (Status: $response)"
    ((TOTAL_CHECKS++))
    return 1
}

# Function to check metrics endpoint
check_metrics_endpoint() {
    local name=$1
    local url=$2
    
    print_status "info" "Checking $name metrics..."
    
    local temp_file=$(mktemp)
    local response=$(curl -s -w "%{http_code}" --connect-timeout 5 --max-time 10 -o "$temp_file" "$url" 2>/dev/null || echo "000")
    
    if [ "$response" = "200" ] && command -v jq >/dev/null 2>&1 && [ -s "$temp_file" ]; then
        local uptime=$(jq -r '.uptime_seconds // .service_info.uptime_seconds // "unknown"' "$temp_file" 2>/dev/null)
        local memory_usage=$(jq -r '.system_metrics.memory_usage_percent // .memory_usage.heapUsed // "unknown"' "$temp_file" 2>/dev/null)
        local requests=$(jq -r '.request_metrics.total // "unknown"' "$temp_file" 2>/dev/null)
        
        print_status "info" "  Uptime: ${uptime}s, Memory: ${memory_usage}MB, Requests: $requests"
    else
        print_status "warning" "  Metrics not available for $name"
    fi
    
    rm -f "$temp_file"
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
    
    # Check HTTP health endpoints
    for service in "${!SERVICE_ENDPOINTS[@]}"; do
        check_http_endpoint "$service" "${SERVICE_ENDPOINTS[$service]}"
        
        # Also check metrics if available
        if [ -n "${SERVICE_METRICS[$service]:-}" ]; then
            check_metrics_endpoint "$service" "${SERVICE_METRICS[$service]}"
        fi
        echo ""
    done
    
    # Check TCP ports for additional validation
    for service in "${!SERVICE_PORTS[@]}"; do
        check_tcp_port "$service" "localhost" "${SERVICE_PORTS[$service]}"
    done
    
    # Check Docker container health if in local environment
    if [ "$ENVIRONMENT" = "local" ]; then
        check_docker_health
    fi
    
    # Check system resources
    echo ""
    check_memory_health
    
    # Check service dependencies
    echo ""
    check_service_dependencies
    
    # Generate summary
    echo ""
    echo "================================================"
    echo "Health Check Summary"
    echo "================================================"
    echo "Total Checks: $TOTAL_CHECKS"
    echo "Healthy: $HEALTHY_CHECKS"
    echo "Degraded: $(echo "${HEALTH_STATUS[@]}" | tr ' ' '\n' | grep -c "degraded" || echo "0")"
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
            "degraded")
                echo -e "  ${YELLOW}!${NC} $service: $status (Response: ${response_time}s)"
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
    local degraded_count=$(echo "${HEALTH_STATUS[@]}" | tr ' ' '\n' | grep -c "degraded" || echo "0")
    if [ $HEALTHY_CHECKS -eq $TOTAL_CHECKS ]; then
        print_status "success" "All services are healthy!"
        return 0
    elif [ $degraded_count -gt 0 ] && [ $((HEALTHY_CHECKS + degraded_count)) -eq $TOTAL_CHECKS ]; then
        print_status "warning" "Some services are degraded but functional!"
        return 0
    else
        print_status "error" "Some services are unhealthy!"
        return 1
    fi
}

# Function to check Docker container health
check_docker_health() {
    print_status "info" "Checking Docker container health..."
    
    if command -v docker >/dev/null 2>&1; then
        local containers=("once-human-rag" "once-human-bot")
        
        for container in "${containers[@]}"; do
            if docker ps --format "table {{.Names}}\t{{.Status}}" | grep -q "$container"; then
                local health_status=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo "no-healthcheck")
                local container_status=$(docker inspect --format='{{.State.Status}}' "$container" 2>/dev/null || echo "unknown")
                
                if [ "$health_status" = "healthy" ]; then
                    print_status "success" "Container $container: healthy"
                elif [ "$health_status" = "unhealthy" ]; then
                    print_status "error" "Container $container: unhealthy"
                elif [ "$container_status" = "running" ]; then
                    print_status "info" "Container $container: running (no health check)"
                else
                    print_status "error" "Container $container: $container_status"
                fi
            else
                print_status "warning" "Container $container: not found or not running"
            fi
        done
    else
        print_status "warning" "Docker not available for container health checks"
    fi
}

# Function to check service dependencies
check_service_dependencies() {
    print_status "info" "Checking service dependencies..."
    
    # Check if RAG service can reach ChromaDB
    if [ -n "${SERVICE_ENDPOINTS[rag-service]:-}" ]; then
        local rag_health_url="${SERVICE_ENDPOINTS[rag-service]}"
        local temp_file=$(mktemp)
        
        if curl -s --connect-timeout 5 --max-time 10 -o "$temp_file" "$rag_health_url" 2>/dev/null; then
            if command -v jq >/dev/null 2>&1; then
                local chromadb_status=$(jq -r '.checks.chromadb_client.status // "unknown"' "$temp_file" 2>/dev/null)
                local collection_status=$(jq -r '.checks.chromadb_collection.status // "unknown"' "$temp_file" 2>/dev/null)
                
                if [ "$chromadb_status" = "healthy" ] && [ "$collection_status" = "healthy" ]; then
                    print_status "success" "RAG service → ChromaDB: healthy"
                else
                    print_status "error" "RAG service → ChromaDB: $chromadb_status/$collection_status"
                fi
            fi
        fi
        rm -f "$temp_file"
    fi
    
    # Check if Discord bot can reach RAG service
    if [ -n "${SERVICE_ENDPOINTS[discord-bot]:-}" ]; then
        local bot_health_url="${SERVICE_ENDPOINTS[discord-bot]}"
        local temp_file=$(mktemp)
        
        if curl -s --connect-timeout 5 --max-time 10 -o "$temp_file" "$bot_health_url" 2>/dev/null; then
            if command -v jq >/dev/null 2>&1; then
                local rag_connectivity=$(jq -r '.checks.rag_service.status // "unknown"' "$temp_file" 2>/dev/null)
                
                if [ "$rag_connectivity" = "healthy" ]; then
                    print_status "success" "Discord bot → RAG service: healthy"
                else
                    print_status "error" "Discord bot → RAG service: $rag_connectivity"
                fi
            fi
        fi
        rm -f "$temp_file"
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