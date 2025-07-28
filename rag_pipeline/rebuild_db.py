import json
import chromadb
import os
import hashlib
from chromadb.utils import embedding_functions
from tqdm import tqdm

def rebuild_database():
    """
    Rebuilds the ChromaDB database from the structured_data.json file.
    This is designed to be run inside the container.
    """
    # In the container, the data is copied to /app/rag_pipeline
    structured_data_path = '/app/rag_pipeline/structured_data.json'
    # The database is on a persistent volume
    db_path = "/data/chroma_db"
    collection_name = "once_human_knowledge"

    # Check if the DB already exists and has been populated.
    # A simple check is to see if the SQLite file is larger than a few KB.
    db_file_path = os.path.join(db_path, 'chroma.sqlite3')
    if os.path.exists(db_file_path) and os.path.getsize(db_file_path) > 4096:
        print("Database already exists and appears to be populated. Skipping rebuild.")
        return

    if not os.path.exists(structured_data_path):
        print(f"Error: '{structured_data_path}' not found. Cannot rebuild database.")
        return

    print(f"Loading structured data from '{structured_data_path}'...")
    with open(structured_data_path, "r", encoding="utf-8") as f:
        all_structured_data = json.load(f)
    
    if not all_structured_data:
        print("No data found in structured_data.json. Aborting.")
        return

    print("Initializing ChromaDB client...")
    chroma_client = chromadb.PersistentClient(path=db_path)

    embedding_function = embedding_functions.SentenceTransformerEmbeddingFunction(
        model_name="all-MiniLM-L6-v2"
    )

    print(f"Resetting collection: '{collection_name}'...")
    try:
        chroma_client.delete_collection(name=collection_name)
        print(f"Successfully deleted existing collection '{collection_name}'.")
    except Exception as e:
        print(f"Collection '{collection_name}' did not exist, which is fine. Proceeding to create.")

    collection = chroma_client.create_collection(
        name=collection_name,
        embedding_function=embedding_function,
        metadata={"description": "Once Human game knowledge base"}
    )

    print("Preparing documents to add to the database...")
    documents = []
    metadatas = []
    ids = []

    for item in tqdm(all_structured_data, desc="Preparing data"):
        doc_text = item.get("text", "")
        final_metadata = item.get("metadata", {}).copy()
        
        for key, value in final_metadata.items():
            if isinstance(value, list):
                final_metadata[key] = "; ".join(map(str, value))
            elif isinstance(value, dict):
                dict_str = "; ".join([f"{k}: {v}" for k, v in value.items()])
                final_metadata[key] = dict_str
            elif value is None:
                final_metadata[key] = ""
        
        doc_id = hashlib.sha256(doc_text.encode('utf-8')).hexdigest()

        documents.append(doc_text)
        metadatas.append(final_metadata)
        ids.append(doc_id)

    print(f"Adding {len(documents)} documents to ChromaDB...")
    batch_size = 100
    for i in tqdm(range(0, len(documents), batch_size), desc="Adding to ChromaDB"):
        end_idx = min(i + batch_size, len(documents))
        collection.add(
            documents=documents[i:end_idx],
            metadatas=metadatas[i:end_idx],
            ids=ids[i:end_idx]
        )

    print("\nDatabase rebuild complete!")
    print(f"Total documents in collection: {collection.count()}")

if __name__ == "__main__":
    rebuild_database()