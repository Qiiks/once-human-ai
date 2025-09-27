#!/bin/bash

# validate-health-checks.sh - Comprehensive validation of health check implementations
# This script validates that all health check mechanisms are working correctly

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
ENVIRONMENT="${ENVIRONMENT:-local}"
TIMEOUT="${TIMEOUT:-30}"
VERBOSE="${VERBOSE:-false}"

# Test results tracking
declare -A TEST_RESULTS
TOTAL_TESTS=0
PASSED_TESTS=0

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

# Function to run a test
run_test() {
    local test_name=$1
    local test_command=$2
    local expected_result=${3:-0}
    
    ((TOTAL_TESTS++))
    print_status "info" "Running test: $test_name"
    
    if [ "$VERBOSE" = "true" ]; then
        echo "  Command: $test_command"
    fi
    
    local start_time=$(date +%s)
    if eval "$test_command" >/dev/null 2>&1; then
        local result=0
    else
        local result=$?
    fi
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    if [ $result -eq $expected_result ]; then
        TEST_RESULTS["$test_name"]="PASS"
        print_status "success" "$test_name (${duration}s)"
        ((PASSED_TESTS++))
        return 0
    else
        TEST_RESULTS["$test_name"]="FAIL"
        print_status "error" "$test_name (${duration}s) - Expected: $expected_result, Got: $result"
        return 1
    fi
}

# Function to test RAG service health endpoints
test_rag_service_health() {
    echo ""
    print_status "info" "Testing RAG Service Health Endpoints..."
    
    local base_url="http://localhost:5000"
    if [ "$ENVIRONMENT" != "local" ]; then
        base_url="${PRODUCTION_RAG_URL:-http://rag-service:5000}"
    fi
    
    # Test basic health endpoint
    run_test "rag_health_endpoint" "curl -f -s --connect-timeout 10 '$base_url/health' | jq -e '.status == \"healthy\"'"
    
    # Test readiness endpoint
    run_test "rag_readiness_endpoint" "curl -f -s --connect-timeout 10 '$base_url/readiness' | jq -e '.status == \"ready\"'"
    
    # Test liveness endpoint
    run_test "rag_liveness_endpoint" "curl -f -s --connect-timeout 10 '$base_url/liveness' | jq -e '.status == \"alive\"'"
    
    # Test metrics endpoint
    run_test "rag_metrics_endpoint" "curl -f -s --connect-timeout 10 '$base_url/metrics' | jq -e '.service_info.name == \"rag-service\"'"
    
    # Test health endpoint returns comprehensive checks
    run_test "rag_health_comprehensive" "curl -f -s --connect-timeout 10 '$base_url/health' | jq -e '.checks | has(\"chromadb_client\") and has(\"embedding_model\")'"
    
    # Test ChromaDB connectivity through health endpoint
    run_test "rag_chromadb_health" "curl -f -s --connect-timeout 10 '$base_url/health' | jq -e '.checks.chromadb_client.status == \"healthy\"'"
}

# Function to test Discord bot health endpoints
test_discord_bot_health() {
    echo ""
    print_status "info" "Testing Discord Bot Health Endpoints..."
    
    local base_url="http://localhost:3000"
    if [ "$ENVIRONMENT" != "local" ]; then
        base_url="${PRODUCTION_BOT_URL:-http://discord-bot:3000}"
    fi
    
    # Test basic health endpoint
    run_test "bot_health_endpoint" "curl -f -s --connect-timeout 10 '$base_url/health' | jq -e '.status'"
    
    # Test metrics endpoint
    run_test "bot_metrics_endpoint" "curl -f -s --connect-timeout 10 '$base_url/metrics' | jq -e '.service == \"discord-bot\"'"
    
    # Test health endpoint returns comprehensive checks
    run_test "bot_health_comprehensive" "curl -f -s --connect-timeout 10 '$base_url/health' | jq -e '.checks | has(\"discord\") and has(\"rag_service\")'"
    
    # Test RAG service connectivity check
    run_test "bot_rag_connectivity" "curl -f -s --connect-timeout 10 '$base_url/health' | jq -e '.checks.rag_service'"
}

# Function to test Docker health checks
test_docker_health_checks() {
    echo ""
    print_status "info" "Testing Docker Health Checks..."
    
    if [ "$ENVIRONMENT" = "local" ] && command -v docker >/dev/null 2>&1; then
        # Test RAG service container health
        run_test "docker_rag_health" "docker inspect --format='{{.State.Health.Status}}' once-human-rag | grep -q 'healthy'"
        
        # Test Discord bot container health
        run_test "docker_bot_health" "docker inspect --format='{{.State.Health.Status}}' once-human-bot | grep -q 'healthy'"
        
        # Test that containers are running
        run_test "docker_rag_running" "docker ps --format '{{.Names}}' | grep -q 'once-human-rag'"
        run_test "docker_bot_running" "docker ps --format '{{.Names}}' | grep -q 'once-human-bot'"
        
        # Test container restart policies
        run_test "docker_rag_restart_policy" "docker inspect --format='{{.HostConfig.RestartPolicy.Name}}' once-human-rag | grep -q 'unless-stopped'"
        run_test "docker_bot_restart_policy" "docker inspect --format='{{.HostConfig.RestartPolicy.Name}}' once-human-bot | grep -q 'unless-stopped'"
    else
        print_status "warning" "Skipping Docker health checks (not in local environment or Docker not available)"
    fi
}

# Function to test service dependencies
test_service_dependencies() {
    echo ""
    print_status "info" "Testing Service Dependencies..."
    
    local rag_url="http://localhost:5000"
    local bot_url="http://localhost:3000"
    
    if [ "$ENVIRONMENT" != "local" ]; then
        rag_url="${PRODUCTION_RAG_URL:-http://rag-service:5000}"
        bot_url="${PRODUCTION_BOT_URL:-http://discord-bot:3000}"
    fi
    
    # Test that Discord bot can reach RAG service
    run_test "dependency_bot_to_rag" "curl -f -s --connect-timeout 10 '$bot_url/health' | jq -e '.checks.rag_service.status == \"healthy\"'"
    
    # Test that RAG service has working ChromaDB connection
    run_test "dependency_rag_to_chromadb" "curl -f -s --connect-timeout 10 '$rag_url/health' | jq -e '.checks.chromadb_collection.status == \"healthy\"'"
    
    # Test that embedding model is loaded
    run_test "dependency_embedding_model" "curl -f -s --connect-timeout 10 '$rag_url/health' | jq -e '.checks.embedding_model.status == \"healthy\"'"
}

# Function to test health check response times
test_response_times() {
    echo ""
    print_status "info" "Testing Health Check Response Times..."
    
    local rag_url="http://localhost:5000"
    local bot_url="http://localhost:3000"
    
    if [ "$ENVIRONMENT" != "local" ]; then
        rag_url="${PRODUCTION_RAG_URL:-http://rag-service:5000}"
        bot_url="${PRODUCTION_BOT_URL:-http://discord-bot:3000}"
    fi
    
    # Test RAG service response time (should be under 5 seconds)
    run_test "rag_response_time" "timeout 5 curl -f -s '$rag_url/health' >/dev/null"
    
    # Test Discord bot response time (should be under 3 seconds)
    run_test "bot_response_time" "timeout 3 curl -f -s '$bot_url/health' >/dev/null"
    
    # Test readiness probe response time (should be very fast)
    run_test "rag_readiness_time" "timeout 2 curl -f -s '$rag_url/readiness' >/dev/null"
}

# Function to test error scenarios
test_error_scenarios() {
    echo ""
    print_status "info" "Testing Error Scenarios..."
    
    # Test invalid endpoints return 404
    run_test "invalid_endpoint_404" "curl -s -o /dev/null -w '%{http_code}' 'http://localhost:5000/invalid' | grep -q '404'" 
    
    # Test health endpoints handle malformed requests gracefully
    run_test "malformed_request_handling" "curl -s -X POST 'http://localhost:5000/health' | jq -e '.status'"
}

# Function to validate health check scripts
test_health_check_scripts() {
    echo ""
    print_status "info" "Testing Health Check Scripts..."
    
    # Test that health-check.sh exists and is executable
    run_test "health_script_exists" "test -x './scripts/health-check.sh'"
    
    # Test that health-check.sh runs without errors
    run_test "health_script_runs" "timeout 30 ./scripts/health-check.sh check"
    
    # Test that verify-deployment.sh exists and is executable
    run_test "verify_script_exists" "test -x './scripts/verify-deployment.sh'"
}

# Main validation function
main() {
    echo "================================================"
    echo "Health Check Validation Report"
    echo "Environment: $ENVIRONMENT"
    echo "Timestamp: $(date)"
    echo "================================================"
    
    # Check prerequisites
    if ! command -v curl >/dev/null 2>&1; then
        print_status "error" "curl is required but not installed"
        exit 1
    fi
    
    if ! command -v jq >/dev/null 2>&1; then
        print_status "warning" "jq is not installed - some tests will be skipped"
    fi
    
    # Run all test suites
    test_rag_service_health
    test_discord_bot_health
    test_docker_health_checks
    test_service_dependencies
    test_response_times
    test_error_scenarios
    test_health_check_scripts
    
    # Generate summary
    echo ""
    echo "================================================"
    echo "Validation Summary"
    echo "================================================"
    echo "Total Tests: $TOTAL_TESTS"
    echo "Passed: $PASSED_TESTS"
    echo "Failed: $((TOTAL_TESTS - PASSED_TESTS))"
    echo ""
    
    # Display detailed results
    echo "Test Results:"
    for test in "${!TEST_RESULTS[@]}"; do
        local result="${TEST_RESULTS[$test]}"
        case $result in
            "PASS")
                echo -e "  ${GREEN}✓${NC} $test"
                ;;
            "FAIL")
                echo -e "  ${RED}✗${NC} $test"
                ;;
        esac
    done
    
    echo "================================================"
    
    # Return appropriate exit code
    if [ $PASSED_TESTS -eq $TOTAL_TESTS ]; then
        print_status "success" "All health check validations passed!"
        return 0
    else
        print_status "error" "Some health check validations failed!"
        return 1
    fi
}

# Handle command line arguments
case "${1:-validate}" in
    "validate")
        main
        ;;
    "help")
        echo "Usage: $0 [validate|help]"
        echo ""
        echo "Commands:"
        echo "  validate - Run comprehensive health check validation (default)"
        echo "  help     - Show this help message"
        echo ""
        echo "Environment Variables:"
        echo "  ENVIRONMENT - Set to 'local' or 'production' (default: local)"
        echo "  TIMEOUT     - Test timeout in seconds (default: 30)"
        echo "  VERBOSE     - Set to 'true' for verbose output (default: false)"
        ;;
    *)
        print_status "error" "Unknown command: $1"
        echo "Run '$0 help' for usage information"
        exit 1
        ;;
esac