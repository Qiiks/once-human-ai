import requests
import json
from tqdm import tqdm
import os
import sys
import datetime

# --- Configuration ---
LOCAL_URL = "http://localhost:5000"
# IMPORTANT: Replace with your actual Fly.io app URL
REMOTE_URL = "https://once-human-bot-and-rag.fly.dev"
BACKUP_DIR = "rag_pipeline/backups"

def fetch_all_documents(base_url):
    """Fetches all documents from the specified RAG service."""
    try:
        response = requests.get(f"{base_url}/documents")
        response.raise_for_status()
        data = response.json()
        if data.get("success"):
            print(f"Successfully fetched {len(data['documents'])} documents from {base_url}.")
            return data["documents"]
        else:
            print(f"Error fetching documents from {base_url}: {data.get('error')}")
            return None
    except requests.exceptions.RequestException as e:
        print(f"Failed to connect to {base_url}. Is the service running? Error: {e}")
        return None

def add_document(base_url, document_data):
    """Adds a single document to the specified RAG service."""
    # The /add endpoint expects 'document' and 'metadata' keys.
    # The /documents endpoint returns 'id', 'document', and 'metadata'.
    # We need to re-format it slightly.
    post_data = {
        "document": document_data["document"],
        "metadata": document_data["metadata"]
    }
    try:
        response = requests.post(f"{base_url}/add", json=post_data)
        response.raise_for_status()
        return response.json().get("success", False)
    except requests.exceptions.RequestException as e:
        print(f"Error adding document: {e}")
        return False

def push_to_remote():
    """
    Synchronizes the remote database with the local one by fetching all
    local documents and adding them to the remote database.
    """
    print("--- Starting Push to Remote ---")
    
    # 1. Fetch all data from the local database
    local_documents = fetch_all_documents(LOCAL_URL)
    if not local_documents:
        print("Could not retrieve documents from local database. Aborting sync.")
        return

    # 2. Add each document to the remote database
    print(f"\nPreparing to sync {len(local_documents)} documents to {REMOTE_URL}...")
    success_count = 0
    fail_count = 0

    for doc in tqdm(local_documents, desc="Syncing to remote DB"):
        if add_document(REMOTE_URL, doc):
            success_count += 1
        else:
            fail_count += 1
            print(f"Failed to add document ID (from local): {doc.get('id')}")

    print("\n--- Push Complete ---")
    print(f"Successfully synced: {success_count}")
    print(f"Failed to sync: {fail_count}")

def pull_from_remote():
    """
    Fetches the entire database from the remote server via the /backup
    endpoint and saves it locally as a timestamped zip file.
    """
    print(f"--- Starting Pull from {REMOTE_URL} ---")
    try:
        # 1. Make the request to the /backup endpoint
        response = requests.get(f"{REMOTE_URL}/backup", stream=True)
        response.raise_for_status()

        # 2. Create the backup directory if it doesn't exist
        os.makedirs(BACKUP_DIR, exist_ok=True)

        # 3. Define the backup file path with a timestamp
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_filename = f"remote_db_backup_{timestamp}.zip"
        backup_filepath = os.path.join(BACKUP_DIR, backup_filename)

        # 4. Save the file
        with open(backup_filepath, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)

        print("\n--- Pull Complete ---")
        print(f"Successfully saved remote database to: {backup_filepath}")

    except requests.exceptions.RequestException as e:
        print(f"Failed to connect to {REMOTE_URL}. Is the service running? Error: {e}")
    except Exception as e:
        print(f"An unexpected error occurred: {e}")


if __name__ == "__main__":
    # Default to 'push' if no argument is provided
    direction = "push"
    if len(sys.argv) > 1:
        direction = sys.argv[1].lower()

    if direction == "pull":
        pull_from_remote()
    elif direction == "push":
        push_to_remote() # Renamed from main() for clarity
    else:
        print(f"Error: Invalid argument '{direction}'. Use 'push' or 'pull'.")