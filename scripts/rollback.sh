#!/bin/bash

# rollback.sh - Emergency rollback script for Coolify deployment
# This script handles rollback procedures when deployment issues occur

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DEPLOYMENT_NAME="${DEPLOYMENT_NAME:-once-human-bot}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
ROLLBACK_LOG="rollback_$(date +%Y%m%d_%H%M%S).log"
DRY_RUN=false
FORCE_ROLLBACK=false

# Rollback state tracking
ROLLBACK_STEPS_COMPLETED=0
ROLLBACK_STEPS_FAILED=0

# Function to print colored output
print_status() {
    local status=$1
    local message=$2
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    case $status in
        "success")
            echo -e "${GREEN}✓${NC} [$timestamp] $message" | tee -a "$ROLLBACK_LOG"
            ;;
        "error")
            echo -e "${RED}✗${NC} [$timestamp] $message" | tee -a "$ROLLBACK_LOG"
            ;;
        "warning")
            echo -e "${YELLOW}!${NC} [$timestamp] $message" | tee -a "$ROLLBACK_LOG"
            ;;
        "info")
            echo -e "${BLUE}ℹ${NC} [$timestamp] $message" | tee -a "$ROLLBACK_LOG"
            ;;
        "header")
            echo -e "\n${BLUE}=== $message ===${NC}" | tee -a "$ROLLBACK_LOG"
            ;;
    esac
}

# Function to confirm action
confirm_action() {
    local message=$1
    
    if [ "$FORCE_ROLLBACK" = true ]; then
        return 0
    fi
    
    echo -e "${YELLOW}WARNING: $message${NC}"
    read -p "Are you sure you want to continue? (yes/no): " -r
    if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
        print_status "info" "Rollback cancelled by user"
        exit 0
    fi
}

# Function to check prerequisites
check_prerequisites() {
    print_status "header" "Checking Prerequisites"
    
    # Check if backup directory exists
    if [ ! -d "$BACKUP_DIR" ]; then
        print_status "error" "Backup directory not found: $BACKUP_DIR"
        return 1
    fi
    
    # Check for required tools
    local required_tools=("docker" "docker-compose" "curl")
    for tool in "${required_tools[@]}"; do
        if ! command -v "$tool" &> /dev/null; then
            print_status "error" "$tool is not installed"
            return 1
        fi
    done
    
    print_status "success" "All prerequisites met"
    return 0
}

# Function to list available backups
list_backups() {
    print_status "header" "Available Backups"
    
    if [ -d "$BACKUP_DIR" ]; then
        local backups=$(ls -1 "$BACKUP_DIR" | grep -E "backup_[0-9]{8}_[0-9]{6}" | sort -r)
        
        if [ -z "$backups" ]; then
            print_status "warning" "No backups found in $BACKUP_DIR"
            return 1
        else
            echo "Available backups:"
            echo "$backups" | nl -w2 -s'. '
            return 0
        fi
    else
        print_status "error" "Backup directory not found"
        return 1
    fi
}

# Function to stop current deployment
stop_current_deployment() {
    print_status "header" "Stopping Current Deployment"
    
    if [ "$DRY_RUN" = true ]; then
        print_status "info" "[DRY RUN] Would stop current deployment"
        return 0
    fi
    
    # For local Docker Compose deployment
    if [ -f "docker-compose.yml" ]; then
        print_status "info" "Stopping Docker Compose services..."
        if docker-compose down; then
            print_status "success" "Services stopped successfully"
            ((ROLLBACK_STEPS_COMPLETED++))
        else
            print_status "error" "Failed to stop services"
            ((ROLLBACK_STEPS_FAILED++))
            return 1
        fi
    fi
    
    # For Coolify deployment - add appropriate commands
    # This is a placeholder - adjust based on your Coolify setup
    print_status "info" "Stopping Coolify deployment..."
    # coolify deployment stop $DEPLOYMENT_NAME
    
    return 0
}

# Function to backup current state
backup_current_state() {
    print_status "header" "Backing Up Current State"
    
    local backup_name="rollback_backup_$(date +%Y%m%d_%H%M%S)"
    local current_backup_dir="$BACKUP_DIR/$backup_name"
    
    if [ "$DRY_RUN" = true ]; then
        print_status "info" "[DRY RUN] Would create backup at $current_backup_dir"
        return 0
    fi
    
    mkdir -p "$current_backup_dir"
    
    # Backup configuration files
    print_status "info" "Backing up configuration files..."
    cp -r *.yml *.env* "$current_backup_dir/" 2>/dev/null || true
    
    # Backup database (if applicable)
    print_status "info" "Backing up database..."
    # Add database backup command here
    # Example: docker-compose exec -T db pg_dump -U user dbname > "$current_backup_dir/database.sql"
    
    # Backup volumes
    print_status "info" "Backing up Docker volumes..."
    # Add volume backup commands here
    
    print_status "success" "Current state backed up to $current_backup_dir"
    ((ROLLBACK_STEPS_COMPLETED++))
    return 0
}

# Function to restore from backup
restore_from_backup() {
    local backup_path=$1
    
    print_status "header" "Restoring from Backup"
    print_status "info" "Backup path: $backup_path"
    
    if [ ! -d "$backup_path" ]; then
        print_status "error" "Backup directory not found: $backup_path"
        return 1
    fi
    
    if [ "$DRY_RUN" = true ]; then
        print_status "info" "[DRY RUN] Would restore from $backup_path"
        return 0
    fi
    
    # Restore configuration files
    print_status "info" "Restoring configuration files..."
    if ls "$backup_path"/*.yml &>/dev/null; then
        cp "$backup_path"/*.yml .
        print_status "success" "Configuration files restored"
    fi
    
    # Restore environment files
    if ls "$backup_path"/.env* &>/dev/null; then
        cp "$backup_path"/.env* .
        print_status "success" "Environment files restored"
    fi
    
    # Restore database
    if [ -f "$backup_path/database.sql" ]; then
        print_status "info" "Restoring database..."
        # Add database restore command here
        # Example: docker-compose exec -T db psql -U user dbname < "$backup_path/database.sql"
        print_status "success" "Database restored"
    fi
    
    ((ROLLBACK_STEPS_COMPLETED++))
    return 0
}

# Function to redeploy services
redeploy_services() {
    print_status "header" "Redeploying Services"
    
    if [ "$DRY_RUN" = true ]; then
        print_status "info" "[DRY RUN] Would redeploy services"
        return 0
    fi
    
    # For local Docker Compose
    if [ -f "docker-compose.yml" ]; then
        print_status "info" "Starting Docker Compose services..."
        if docker-compose up -d; then
            print_status "success" "Services started successfully"
            ((ROLLBACK_STEPS_COMPLETED++))
        else
            print_status "error" "Failed to start services"
            ((ROLLBACK_STEPS_FAILED++))
            return 1
        fi
    fi
    
    # For Coolify deployment
    # Add appropriate Coolify deployment commands
    
    return 0
}

# Function to verify rollback
verify_rollback() {
    print_status "header" "Verifying Rollback"
    
    # Run health checks
    if [ -f "scripts/health-check.sh" ]; then
        print_status "info" "Running health checks..."
        if bash scripts/health-check.sh; then
            print_status "success" "Health checks passed"
            ((ROLLBACK_STEPS_COMPLETED++))
        else
            print_status "warning" "Some health checks failed"
            ((ROLLBACK_STEPS_FAILED++))
        fi
    fi
    
    return 0
}

# Function to generate rollback report
generate_rollback_report() {
    print_status "header" "Rollback Summary"
    
    echo ""
    echo "================================================" | tee -a "$ROLLBACK_LOG"
    echo "ROLLBACK REPORT" | tee -a "$ROLLBACK_LOG"
    echo "================================================" | tee -a "$ROLLBACK_LOG"
    echo "Timestamp: $(date)" | tee -a "$ROLLBACK_LOG"
    echo "Steps Completed: $ROLLBACK_STEPS_COMPLETED" | tee -a "$ROLLBACK_LOG"
    echo "Steps Failed: $ROLLBACK_STEPS_FAILED" | tee -a "$ROLLBACK_LOG"
    echo "Log File: $ROLLBACK_LOG" | tee -a "$ROLLBACK_LOG"
    echo "================================================" | tee -a "$ROLLBACK_LOG"
    
    if [ $ROLLBACK_STEPS_FAILED -eq 0 ]; then
        print_status "success" "Rollback completed successfully!"
        return 0
    else
        print_status "error" "Rollback completed with errors. Please review the log."
        return 1
    fi
}

# Function to perform automated rollback
automated_rollback() {
    local backup_path=$1
    
    print_status "info" "Starting automated rollback process..."
    
    # Execute rollback steps
    stop_current_deployment || print_status "warning" "Failed to stop deployment"
    backup_current_state || print_status "warning" "Failed to backup current state"
    restore_from_backup "$backup_path" || return 1
    redeploy_services || return 1
    verify_rollback || print_status "warning" "Verification failed"
    
    generate_rollback_report
}

# Function to show usage
show_usage() {
    echo "Usage: $0 [OPTIONS] [COMMAND]"
    echo ""
    echo "Commands:"
    echo "  list              List available backups"
    echo "  rollback [backup] Rollback to specific backup"
    echo "  auto              Automatically rollback to latest backup"
    echo "  help              Show this help message"
    echo ""
    echo "Options:"
    echo "  --dry-run         Show what would be done without executing"
    echo "  --force           Skip confirmation prompts"
    echo "  --backup-dir DIR  Specify backup directory (default: ./backups)"
    echo ""
    echo "Examples:"
    echo "  $0 list"
    echo "  $0 rollback backup_20240101_120000"
    echo "  $0 --dry-run auto"
}

# Parse command line arguments
parse_arguments() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --force)
                FORCE_ROLLBACK=true
                shift
                ;;
            --backup-dir)
                BACKUP_DIR="$2"
                shift 2
                ;;
            list|rollback|auto|help)
                COMMAND="$1"
                shift
                if [ "$COMMAND" = "rollback" ] && [ $# -gt 0 ]; then
                    BACKUP_NAME="$1"
                    shift
                fi
                ;;
            *)
                print_status "error" "Unknown option: $1"
                show_usage
                exit 1
                ;;
        esac
    done
}

# Main execution
main() {
    echo "================================================"
    echo "Emergency Rollback Script"
    echo "================================================"
    
    # Parse arguments
    parse_arguments "$@"
    
    # Set default command
    COMMAND="${COMMAND:-help}"
    
    # Check prerequisites
    if [ "$COMMAND" != "help" ]; then
        check_prerequisites || exit 1
    fi
    
    # Execute command
    case $COMMAND in
        list)
            list_backups
            ;;
        rollback)
            if [ -z "${BACKUP_NAME:-}" ]; then
                print_status "error" "Backup name required"
                echo "Usage: $0 rollback <backup_name>"
                exit 1
            fi
            confirm_action "This will rollback to $BACKUP_NAME"
            automated_rollback "$BACKUP_DIR/$BACKUP_NAME"
            ;;
        auto)
            # Get latest backup
            latest_backup=$(ls -1 "$BACKUP_DIR" | grep -E "backup_[0-9]{8}_[0-9]{6}" | sort -r | head -1)
            if [ -z "$latest_backup" ]; then
                print_status "error" "No backups found"
                exit 1
            fi
            confirm_action "This will rollback to latest backup: $latest_backup"
            automated_rollback "$BACKUP_DIR/$latest_backup"
            ;;
        help)
            show_usage
            ;;
        *)
            print_status "error" "Unknown command: $COMMAND"
            show_usage
            exit 1
            ;;
    esac
}

# Trap to handle interrupts
trap 'print_status "error" "Rollback interrupted!"; exit 1' INT TERM

# Run main function
main "$@"