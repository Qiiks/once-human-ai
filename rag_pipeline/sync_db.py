import requests
import json
from tqdm import tqdm
import os
import sys
import datetime

# --- Configuration ---
LOCAL_URL = "http://localhost:5000"
# IMPORTANT: Set `REMOTE_URL` to your deployed RAG service URL (e.g., Coolify).
# It can be provided via the environment variable `REMOTE_URL`.
REMOTE_URL = os.environ.get('REMOTE_URL', "https://your-rag-service.example.com")
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

def delete_document(base_url, doc_id):
    """Deletes a single document from the specified RAG service by its ID."""
    try:
        response = requests.post(f"{base_url}/delete", json={"id": doc_id})
        response.raise_for_status()
        return response.json().get("success", False)
    except requests.exceptions.RequestException as e:
        print(f"Error deleting document {doc_id}: {e}")
        return False

def get_timestamp(doc):
    """Safely retrieves and parses a timestamp from a document's metadata."""
    ts_str = doc.get("metadata", {}).get("updated_at")
    if not ts_str:
        return None
    try:
        # Handle both ISO format with 'Z' and without
        if ts_str.endswith('Z'):
            ts_str = ts_str[:-1] + '+00:00'
        return datetime.datetime.fromisoformat(ts_str)
    except (ValueError, TypeError):
        return None

def push_to_remote():
    """
    Synchronizes databases based on timestamps. The most recent version of a
    document takes precedence.
    - Adds new documents from local to remote.
    - Updates documents on remote if the local version is newer.
    - Skips updates if the remote version is newer.
    - Deletes documents from remote that are not in local.
    """
    print("--- Starting Timestamp-based Sync to Remote ---")

    # 1. Fetch all documents from both databases
    print("Fetching documents from local database...")
    local_documents = fetch_all_documents(LOCAL_URL)
    if local_documents is None:
        print("Could not retrieve documents from local database. Aborting sync.")
        return

    print("Fetching documents from remote database...")
    remote_documents = fetch_all_documents(REMOTE_URL)
    if remote_documents is None:
        print("Could not retrieve documents from remote database. Aborting sync.")
        return

    # 2. Create maps for efficient lookup
    local_doc_map = {
        (doc['metadata']['source'], doc['metadata'].get('page_number')): doc
        for doc in local_documents
    }
    remote_doc_map = {
        (doc['metadata']['source'], doc['metadata'].get('page_number')): doc
        for doc in remote_documents
    }
    print(f"Found {len(local_doc_map)} local documents and {len(remote_doc_map)} remote documents.")

    # 3. Initialize counters
    added_count = 0
    updated_count = 0
    skipped_count = 0
    deleted_count = 0
    fail_count = 0

    # 4. Process local documents (Additions and Updates)
    print("\nProcessing local documents (checking for additions/updates)...")
    for key, local_doc in tqdm(local_doc_map.items(), desc="Syncing local to remote"):
        remote_doc = remote_doc_map.get(key)

        if not remote_doc:
            # Document is new, add it
            if add_document(REMOTE_URL, local_doc):
                added_count += 1
            else:
                fail_count += 1
                print(f"Failed to add new document: {key}")
        else:
            # Document exists on both, compare timestamps
            local_ts = get_timestamp(local_doc)
            remote_ts = get_timestamp(remote_doc)

            # Decision logic based on timestamps
            if local_ts and remote_ts:
                if local_ts > remote_ts:
                    # Local is newer, update remote
                    if delete_document(REMOTE_URL, remote_doc['id']) and add_document(REMOTE_URL, local_doc):
                        updated_count += 1
                    else:
                        fail_count += 1
                        print(f"Failed to update document with newer timestamp: {key}")
                elif remote_ts > local_ts:
                    # Remote is newer, skip
                    skipped_count += 1
                else:
                    # Timestamps are identical, skip
                    skipped_count += 1
            elif local_ts:
                # Only local has a timestamp, so it's newer
                if delete_document(REMOTE_URL, remote_doc['id']) and add_document(REMOTE_URL, local_doc):
                    updated_count += 1
                else:
                    fail_count += 1
                    print(f"Failed to update document with new timestamp: {key}")
            else:
                # Local has no timestamp, or neither do. Keep remote version.
                skipped_count += 1

    # 5. Process remote documents (Deletions)
    print("\nProcessing remote documents (checking for deletions)...")
    for key, remote_doc in tqdm(remote_doc_map.items(), desc="Checking for remote deletions"):
        if key not in local_doc_map:
            # Document was deleted locally, so delete it from remote
            if delete_document(REMOTE_URL, remote_doc['id']):
                deleted_count += 1
            else:
                fail_count += 1
                print(f"Failed to delete document from remote: {key}")

    # 6. Final summary
    print("\n--- Sync Complete ---")
    print(f"Documents Added:   {added_count} (new)")
    print(f"Documents Updated: {updated_count} (local was newer)")
    print(f"Documents Deleted: {deleted_count} (removed from local)")
    print(f"Documents Skipped: {skipped_count} (remote was newer or unchanged)")
    print(f"Operations Failed: {fail_count}")

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