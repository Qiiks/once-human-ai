import os
import shutil
import logging

# Set up basic logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# --- Configuration ---
# This is the path inside the Docker image where you've copied your pre-built DB.
# It should not be on a persistent volume.
SOURCE_DB_PATH = "/app/prebuilt_db" 

# This is the path on the persistent volume where the live DB should reside.
# It corresponds to the `destination` in your fly.toml `[mounts]` section.
DESTINATION_DB_PATH = "/data/chroma_db"

# A simple flag file to indicate that the initial setup has been completed.
# This prevents the migration from running on every single deployment.
FLAG_FILE = os.path.join(os.path.dirname(DESTINATION_DB_PATH), ".migration_complete")

def run_initial_setup():
    """
    Copies the pre-built database to the persistent volume if it's the first run.
    """
    logging.info("--- Starting Database Migration Check ---")

    # Check if the migration has already been completed
    if os.path.exists(FLAG_FILE):
        logging.info("Migration has already been completed. Skipping setup.")
        return

    # Check if the destination directory already has a database.
    # This is a safety check in case the flag file was somehow deleted.
    if os.path.exists(DESTINATION_DB_PATH) and os.listdir(DESTINATION_DB_PATH):
        logging.warning("Destination DB path exists and is not empty, but migration flag was not found.")
        logging.warning("Assuming setup is complete. Creating flag file and skipping copy.")
        # Create the flag file to prevent this from running again
        with open(FLAG_FILE, "w") as f:
            f.write("Completed on: " + str(os.path.getmtime(DESTINATION_DB_PATH)))
        return

    # Check if the source database exists in the image
    if not os.path.exists(SOURCE_DB_PATH):
        logging.error(f"Pre-built database not found at {SOURCE_DB_PATH}. Cannot perform initial setup.")
        # If there's no source, there's nothing to do.
        return

    logging.info(f"First-time setup. Copying database from {SOURCE_DB_PATH} to {DESTINATION_DB_PATH}.")
    
    try:
        # Ensure the parent directory of the destination exists
        os.makedirs(os.path.dirname(DESTINATION_DB_PATH), exist_ok=True)
        
        # Copy the entire directory tree
        shutil.copytree(SOURCE_DB_PATH, DESTINATION_DB_PATH)
        
        # Create the flag file to prevent this from running again
        with open(FLAG_FILE, "w") as f:
            f.write("Completed at: " + str(__import__('datetime').datetime.now()))
            
        logging.info("--- Database Migration Successful ---")
        
    except Exception as e:
        logging.error(f"An error occurred during database migration: {e}")
        # If the copy fails, we should not create the flag file.
        # It will be re-attempted on the next deployment.
        raise

if __name__ == "__main__":
    run_initial_setup()