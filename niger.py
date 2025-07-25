import os
import time
import json
from pinecone import Pinecone, ServerlessSpec
from dotenv import load_dotenv
import google.generativeai as genai

# Load environment variables from .env file
load_dotenv()

# --- Configuration ---
STRUCTURED_DATA_PATH = r"C:\Users\Sanve\OneDrive\Documents\Code project\rag_pipeline\structured_data.json"
PINECONE_API_KEY = os.getenv("PINECONE_API_KEY")
PINECONE_ENVIRONMENT = os.getenv("PINECONE_ENVIRONMENT")
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")

if not all([PINECONE_API_KEY, PINECONE_ENVIRONMENT, GOOGLE_API_KEY]):
    raise ValueError("Please set PINECONE_API_KEY, PINECONE_ENVIRONMENT, and GOOGLE_API_KEY environment variables.")

# Initialize clients
pc = Pinecone(api_key=PINECONE_API_KEY, environment=PINECONE_ENVIRONMENT)
genai.configure(api_key=GOOGLE_API_KEY)

# Index configuration
from datetime import datetime
INDEX_NAME = f"once-human-lore-{int(datetime.now().timestamp())}"  # Add timestamp to make it unique
DIMENSION = 768  # Google's embedding dimension

print(f"Will create index: {INDEX_NAME}")

def get_embeddings(texts, batch_size=100):
    """Get embeddings for a list of texts using Google's Generative AI API"""
    all_embeddings = []
    model = 'models/embedding-001'  # Google's text embedding model
    
    for i in range(0, len(texts), batch_size):
        batch = texts[i:i + batch_size]
        # Process each text individually as Google's API expects single strings
        batch_embeddings = [
            genai.embed_content(
                model=model,
                content=text,
                task_type="retrieval_query"
            )["embedding"]
            for text in batch
        ]
        all_embeddings.extend(batch_embeddings)
    return all_embeddings

# --- Data Processing Functions (using structured_data.json) ---
def load_structured_data(json_path):
    try:
        with open(json_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        print(f"Loaded {len(data)} items from {json_path}")
        return data
    except FileNotFoundError:
        print(f"Error: structured_data.json not found at {json_path}")
        return []
    except json.JSONDecodeError as e:
        print(f"Error decoding JSON from {json_path}: {e}")
        return []

def prepare_data_for_pinecone(structured_data):
    chunks = []
    for i, item in enumerate(structured_data):
        chunk_id = f"structured_data_{i}"
        chunk_dict = {
            "id": chunk_id,
            "text": item["text"],
            "metadata": {"category": item["category"], "original_index": i}
        }
        chunks.append(chunk_dict)
    return chunks

# --- Main Ingestion Logic ---
def wait_for_index_deletion(index_name, max_attempts=30):
    """Wait for index to be fully deleted"""
    for attempt in range(max_attempts):
        try:
            if index_name not in pc.list_indexes():
                print(f"Confirmed index '{index_name}' is deleted")
                return True
            print(f"Waiting for deletion... (attempt {attempt + 1}/{max_attempts})")
            time.sleep(2)
        except Exception:
            time.sleep(2)
    return False

def ingest_data_to_pinecone():
    print("\n=== Starting Structured Data Processing and Pinecone Ingestion ===\n")
    
    # 0. Handle existing index
    print("Checking for existing index...")
    try:
        indexes = pc.list_indexes()
        if INDEX_NAME in indexes:
            print(f"Found existing index '{INDEX_NAME}', attempting to delete...")
            try:
                pc.delete_index(INDEX_NAME)
                print(f"Delete command sent, waiting for confirmation...")
                if not wait_for_index_deletion(INDEX_NAME):
                    print("Failed to confirm index deletion after multiple attempts")
                    return
            except Exception as e:
                print(f"❌ Failed to delete index: {str(e)}")
                return
    except Exception as e:
        print(f"❌ Error checking indexes: {str(e)}")
        return

    # 1. Load and process structured data
    structured_data = load_structured_data(STRUCTURED_DATA_PATH)
    if not structured_data:
        print(f"No structured data found in {STRUCTURED_DATA_PATH}. Exiting ingestion.")
        return

    chunks = prepare_data_for_pinecone(structured_data)
    print(f"Prepared {len(chunks)} chunks for ingestion.")

    # 2. Create or verify Pinecone Index
    print("\nSetting up Pinecone index...")
    
    # Double check the index doesn't exist
    if INDEX_NAME in pc.list_indexes():
        print(f"❌ Index '{INDEX_NAME}' still exists despite deletion attempt")
        return
        
    try:
        print(f"Creating new index '{INDEX_NAME}'...")
        pc.create_index(
            name=INDEX_NAME,
            dimension=DIMENSION,
            metric='cosine',
            spec=ServerlessSpec(cloud='aws', region='us-east-1')
        )
        
        # Wait for index to be ready with timeout
        print("Waiting for index to be ready...")
        max_wait = 60  # Maximum seconds to wait
        start_time = time.time()
        
        while time.time() - start_time < max_wait:
            try:
                index_info = pc.describe_index(INDEX_NAME)
                if index_info.status['ready']:
                    print(f"[OK] Index '{INDEX_NAME}' created and ready")
                    print(f"Index details:")
                    print(f"- Dimensions: {index_info.dimension}")
                    print(f"- Metric: {index_info.metric}")
                    break
                time.sleep(2)
            except Exception as e:
                print(f"Waiting... ({e})")
                time.sleep(2)
        else:
            print("❌ Timeout waiting for index to be ready")
            return
            
    except Exception as e:
        print(f"❌ Error with index setup: {str(e)}")
        return

    index = pc.Index(INDEX_NAME)

    # 3. Upsert to Pinecone in batches with embeddings
    batch_size = 50  # Smaller batch size to avoid timeouts
    max_retries = 3
    
    for i in range(0, len(chunks), batch_size):
        batch_chunks = chunks[i:i + batch_size]
        # Get embeddings for the batch
        print(f"\nProcessing batch {i//batch_size + 1}/{(len(chunks) + batch_size - 1)//batch_size}:")
        print(f"- Generating embeddings for {len(batch_chunks)} text chunks...")
        texts = [chunk["text"] for chunk in batch_chunks]
        embeddings = get_embeddings(texts)
        print("- Embeddings generated successfully.")
        
        # Create items for upserting with embeddings
        print("- Preparing vectors for Pinecone...")
        items_for_upsert = [
            {
                "id": chunk["id"],
                "values": embedding,
                "metadata": {**chunk["metadata"], "text": chunk["text"]}
            }
            for chunk, embedding in zip(batch_chunks, embeddings)
        ]
        
        # Retry logic for upsert
        for attempt in range(max_retries):
            try:
                print(f"- Upserting vectors to Pinecone (attempt {attempt + 1}/{max_retries})...")
                start_time = time.time()
                index.upsert(vectors=items_for_upsert)
                end_time = time.time()
                print(f"[OK] Batch {i//batch_size + 1} upserted successfully in {end_time - start_time:.2f} seconds")
                break
            except Exception as e:
                if attempt == max_retries - 1:  # Last attempt
                    print(f"❌ Failed to upsert batch {i//batch_size + 1} after {max_retries} attempts.")
                    print(f"Error details: {str(e)}")
                    raise
                print(f"[WARNING] Attempt {attempt + 1} failed. Error: {str(e)}")
                print(f"   Waiting 5 seconds before retry...")
                time.sleep(5)  # Wait 5 seconds before retrying

    # Get final statistics
    try:
        stats = index.describe_index_stats()
        final_count = stats.total_vector_count
        print("\n=== Ingestion Complete ===")
        print(f"Total vectors in index: {final_count}")
        print(f"Average vectors per batch: {final_count / ((len(chunks) + batch_size - 1)//batch_size):.1f}")
        print(f"Namespace counts: {stats.namespaces}")
        print("==============================\n")
    except Exception as e:
        print("\n=== Ingestion Complete ===")
        print(f"Total chunks processed: {len(chunks)}")
        print(f"Total batches: {(len(chunks) + batch_size - 1)//batch_size}")
        print(f"Note: Could not fetch final statistics: {str(e)}")
        print("==============================\n")

if __name__ == "__main__":
    ingest_data_to_pinecone()