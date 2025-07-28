import requests
import json
from tqdm import tqdm

# --- Configuration ---
LOCAL_URL = "http://localhost:5000"
# IMPORTANT: Replace with your actual Fly.io app URL
REMOTE_URL = "https://once-human-bot-and-rag.fly.dev" 

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

def sync_databases():
    """
    Synchronizes the remote database with the local one by fetching all
    local documents and adding them to the remote database.
    """
    print("--- Starting Database Sync ---")
    
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

    print("\n--- Sync Complete ---")
    print(f"Successfully synced: {success_count}")
    print(f"Failed to sync: {fail_count}")

if __name__ == "__main__":
    sync_databases()