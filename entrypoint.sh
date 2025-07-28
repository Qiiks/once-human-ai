#!/bin/bash
set -e

# --- Configuration ---
SOURCE_DB_PATH="/app/prebuilt_db"
DEST_DB_PATH="/data/chroma_db"
MIGRATION_FLAG="/data/.migration_complete"

echo "--- Running Application Entrypoint ---"

# --- Step 1: Run Database Migration (if needed) ---
# This logic runs on every start, but only copies the DB on the very first launch.
echo "Checking for initial database setup..."

if [ -f "$MIGRATION_FLAG" ]; then
    echo "Migration flag found. Skipping initial database copy."
else
    echo "Migration flag not found. Proceeding with first-time setup."
    
    # Check if the source database exists in the image.
    if [ ! -d "$SOURCE_DB_PATH" ]; then
        echo "Error: Pre-built database not found at $SOURCE_DB_PATH. The service will start with an empty database."
    else
        # Check if the destination is empty. This is a safety check.
        if [ -d "$DEST_DB_PATH" ] && [ "$(ls -A $DEST_DB_PATH)" ]; then
            echo "Warning: Destination directory ($DEST_DB_PATH) already exists and is not empty."
            echo "Assuming migration was completed but flag is missing. Creating flag and skipping copy."
            touch "$MIGRATION_FLAG"
        else
            echo "Copying pre-built database from $SOURCE_DB_PATH to $DEST_DB_PATH..."
            # Create the destination directory and copy the contents.
            # 'cp -a' preserves file attributes and copies recursively.
            mkdir -p "$DEST_DB_PATH"
            cp -a "$SOURCE_DB_PATH/." "$DEST_DB_PATH/"
            
            # Create the flag file to prevent this from running again.
            echo "Database copy complete. Creating migration flag."
            touch "$MIGRATION_FLAG"
        fi
    fi
fi

echo "--- Database setup check complete ---"

# --- Step 2: Start the Main Application Services ---
echo "--- Starting Main Services (Flask & Node.js) ---"

# Start the Flask RAG service in the background
python3 /app/rag_pipeline/rag_service.py &

# Start the Node.js bot in the foreground. This keeps the container running.
exec node /app/once-human-bot/index.js