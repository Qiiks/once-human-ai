import requests
from collections import defaultdict
from tqdm import tqdm

# --- Configuration ---
# IMPORTANT: Set `REMOTE_URL` to your deployed RAG service URL (e.g., Coolify).
# It can be provided via the environment variable `REMOTE_URL`.
REMOTE_URL = "https://your-rag-service.example.com"

def fetch_all_documents(base_url):
    """Fetches all documents from the specified RAG service."""
    print(f"Fetching all documents from {base_url}...")
    try:
        response = requests.get(f"{base_url}/documents")
        response.raise_for_status()
        data = response.json()
        if data.get("success"):
            print(f"Successfully fetched {len(data['documents'])} documents.")
            return data["documents"]
        else:
            print(f"Error fetching documents: {data.get('error')}")
            return None
    except requests.exceptions.RequestException as e:
        print(f"Failed to connect to {base_url}. Is the service running? Error: {e}")
        return None

def delete_document(base_url, doc_id):
    """Deletes a single document by its ID from the specified RAG service."""
    try:
        # Assuming the RAG service has a DELETE endpoint like /delete/<id>
        response = requests.delete(f"{base_url}/delete/{doc_id}")
        response.raise_for_status()
        return response.json().get("success", False)
    except requests.exceptions.RequestException as e:
        print(f"Error deleting document {doc_id}: {e}")
        return False

def find_and_remove_duplicates():
    """
    Connects to the remote database, finds documents with duplicate content,
    and removes them, keeping only the first instance of each document.
    """
    print("--- Starting Remote DB Cleanup ---")

    # 1. Fetch all documents from the remote database
    all_docs = fetch_all_documents(REMOTE_URL)
    if not all_docs:
        print("Could not retrieve documents from remote database. Aborting cleanup.")
        return

    # 2. Group documents by their content to find duplicates
    print("Identifying duplicates...")
    content_to_ids = defaultdict(list)
    for doc in tqdm(all_docs, desc="Grouping documents"):
        # Use the 'document' field as the unique key for content
        content_key = doc.get("document")
        doc_id = doc.get("id")
        if content_key and doc_id:
            content_to_ids[content_key].append(doc_id)

    # 3. Identify which documents are duplicates
    duplicates_to_delete = []
    for content, ids in content_to_ids.items():
        if len(ids) > 1:
            # Keep the first one, mark the rest for deletion
            duplicates_to_delete.extend(ids[1:])

    if not duplicates_to_delete:
        print("No duplicate documents found. The database is clean.")
        print("--- Cleanup Complete ---")
        return

    # 4. Delete the identified duplicates
    print(f"\nFound {len(duplicates_to_delete)} duplicate entries to remove.")
    delete_success_count = 0
    delete_fail_count = 0

    for doc_id in tqdm(duplicates_to_delete, desc="Deleting duplicates"):
        if delete_document(REMOTE_URL, doc_id):
            delete_success_count += 1
        else:
            delete_fail_count += 1

    print("\n--- Cleanup Complete ---")
    print(f"Successfully deleted: {delete_success_count}")
    print(f"Failed to delete: {delete_fail_count}")

if __name__ == "__main__":
    # Add a confirmation step to prevent accidental runs
    print("This script will permanently delete duplicate documents from the remote database.")
    print(f"TARGET URL: {REMOTE_URL}")
    confirm = input("Are you sure you want to continue? (yes/no): ")
    if confirm.lower() == 'yes':
        find_and_remove_duplicates()
    else:
        print("Cleanup aborted by user.")