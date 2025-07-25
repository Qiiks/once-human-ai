import chromadb
from chromadb.utils import embedding_functions
import json
import os
import sys
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv() # Load environment variables from .env file

# Configure Gemini API
# It's recommended to set this as an environment variable:
# os.environ["GEMINI_API_KEY"] = "YOUR_API_KEY"
gemini_api_key = os.environ.get("GEMINI_API_KEY")
if not gemini_api_key:
    print("GEMINI_API_KEY environment variable not set. Please set it to your Gemini API key.")
    sys.exit(1)
genai.configure(api_key=gemini_api_key)


# Define the lists of items
WEAPON_LIST = [
    "Baseball Bat", "Torch", "DE.50", "MPS7", "SN700", "SOCR Outsider", "KVD Icebreaker",
    "SN700 – Gulped Lore", "KAM – Pioneer", "MPS5 Blue Tiger", "SOCR – The Last Valor",
    "KVD Boom! Boom!", "KAM – Abyss Glance", "KAM – Crank", "Compound Bow", "DE.50 Wildfire",
    "MG4 – Predator", "Recurve Crossbow", "AWS.338 - Bullseye", "DE.50 - Jaws",
    "M416 - Silent Anabasis", "R500 - Memento", "MG4 - Conflicting Memories", "Critical Pulse",
    "DB12 - Raining Cash", "DBSG - Doombringer", "G17 - Hazardous Object", "HAMR - Brahminy",
    "KV-SBR - Little Jaws", "ACS12 - Corrosion", "ACS12 - Pyroclasm Starter"
]

ARMOR_SET_LIST = [
    "Raid Armor Set", "Agent Armor Set", "Heavy Duty Armor Set", "Falcon Armor Set",
    "Bastille Armor Set", "Renegade Armor Set", "Lonewolf Armor Set", "Shelterer Armor Set",
    "Savior Armor Set", "Storm Weaver Set", "Protector Set", "Redeemer Set",
    "Explosive Set", "Scout Set", "Rustic Set", "Test Subject Set"
]

KEY_GEAR_LIST = [
    "Stealth Walker Wrap", "Covert Walker Shirt", "Snow Camo Gloves", "Gas Tight Helm",
    "Gas Mask Hood", "BBQ Gloves", "Oasis Mask", "Beret Helmet", "Cage Helmet",
    "Frost Tactical Vest", "Prickly Dance Pants", "Rainbow Armor", "Sharp Blade Pants",
    "Overload Pants", "Shaman Vulture Top", "Old Huntsman Boots"
]

WEAPON_MOD_LIST = [
    "Blaze Blessing", "Bombardier Souvenir", "Bounce Rampage", "Burning Wrath", "Cowboy",
    "Cryo Blast", "Decisive Blow", "Double Gunner", "Durable Territory", "Embers",
    "Fast Refurbish", "Final Territory", "Flame Resonance", "Frosty Blessing",
    "Heavy Explosives", "Hunters Perk", "Lasting Fortification", "Not Throw Away Your Shot",
    "Obliterate", "Portable Territory", "Precision Rush", "Reckless Bomber", "Recover Mark",
    "Shattering Ice", "Shatter Them All", "Shield Breaker", "Shock Diffusion",
    "Shock Rampage", "Shoot Out", "Shooting Blitz", "Shrapnel Smash", "Shrapnel Souvenir",
    "Spreading Marks", "Static Shock", "Super Bullet", "Super Charged", "Surge Amplifier",
    "Targeted Bounce", "United We Stand", "Vortex Multiplier", "Vulnerability Amplifier"
]

ARMOR_MOD_LIST = [
    "Abnormal Increase", "Ardent Shield", "Blitzkrieg", "Break Bounce",
    "Bullet Siphon", "Covered Advance", "Crit Amplifier", "Crit Boost", "Critical Rescue",
    "Deadshot", "Delayed Blast", "Deviation Expert", "Elemental Havoc", "Elemental Overload",
    "Enduring Shield", "Explosive Shrapnel", "Fateful Strike", "Ferocious Charge",
    "First Electrocution", "First-Move Advantage", "Gunslinger", "Head Guard",
    "Head-on Conflict", "Healing Fortification", "Lifeforce Boost", "Light Cannon",
    "Lingering Frost", "Mag Expansion", "Melee Amplifier", "Melee Momentum", "Momentum Up",
    "Most Wanted", "Munitions Amplifier", "Obliteration", "Point Detonation",
    "Precise Strike", "Precision Bounce", "Precision Charge", "Quick Comeback",
    "Rejuvenating", "Reload Rampage", "Resist Advantage", "Retrusion Explosion",
    "Rush Hour", "Ruthless Reaper", "Secluded Strike", "Shrapnel Carnage",
    "Slow and Steady", "Status Amplification", "Status Enhancement", "Status Immune",
    "Targeted Strike", "Three Strikes", "Thunderclap", "Unbreakable", "Unstoppable",
    "Weakspot DMG Boost", "Work of Proficiency"
]

def extract_entities(text):
    """Extract all entities mentioned in the text."""
    text_lower = text.lower()
    entities = {
        "weapons": [item for item in WEAPON_LIST if item.lower() in text_lower],
        "armor_sets": [item for item in ARMOR_SET_LIST if item.lower() in text_lower],
        "key_gear": [item for item in KEY_GEAR_LIST if item.lower() in text_lower],
        "weapon_mods": [item for item in WEAPON_MOD_LIST if item.lower() in text_lower],
        "armor_mods": [item for item in ARMOR_MOD_LIST if item.lower() in text_lower]
    }
    return {k: v for k, v in entities.items() if v}  # Only return non-empty lists

def gemini_structure_data(raw_text):
    """Uses Gemini to extract structured data from raw text."""
    model = genai.GenerativeModel('gemini-2.5-flash')
    prompt = f"""Given the following raw text about a game entity (item, weapon, armor, location, event, character, guide, lore, etc.) from Once Human, extract the following information into a JSON object. If a field is not present or not applicable, use null. Do not include any other text or formatting outside the JSON.

    Expected JSON format:
    {{
        "entity_name": "string",
        "entity_type": "string" (e.g., "weapon", "armor", "food", "mod", "material", "location", "event", "character", "guide", "lore"),
        "description": "string",
        "effects": ["string"],
        "stats": {{
            "percentages": ["string"],
            "numbers": ["string"],
            "durations": ["string"]
        }},
        "acquisition_method": "string" (e.g., "Crafted using X, Y, Z", "Found in location A", "Dropped by enemy B", "Purchased from vendor C"),
        "duration": "string" (e.g., "30 min", "24 hours", "Permanent"),
        "related_entities": ["string"],
        "notes": "string"
    }}

    Raw Text: '''{raw_text}'''
    """
    try:
        response = model.generate_content(prompt)
        raw_response_text = response.text.strip()
        # Remove markdown code block if present
        if raw_response_text.startswith('```json') and raw_response_text.endswith('```'):
            raw_response_text = raw_response_text[len('```json'):-len('```')].strip()

        if not raw_response_text:
            print("Gemini returned an empty response after stripping markdown.")
            return None

        structured_data = json.loads(raw_response_text)
        print(f"Gemini returned structured data: {json.dumps(structured_data, indent=2)}")
        return structured_data
    except json.JSONDecodeError as e:
        print(f"Error decoding JSON from Gemini response: {e}")
        print(f"Problematic response text: '{{raw_response_text}}'") # Log the problematic text
        return None
    except Exception as e:
        print(f"An unexpected error occurred with Gemini: {e}")
        return None

def extract_stats(text):
    """Extract numerical stats and effects from text."""
    import re
    
    # Pattern for percentage matches (e.g., "+25%", "25%")
    percentage_pattern = r'[+-]?\d+%'
    # Pattern for numerical effects (e.g., "+20", "-15")
    numerical_pattern = r'[+-]?\d+'
    # Pattern for time durations (e.g., "30 min", "24 hours")
    duration_pattern = r'\d+\s*(?:min(?:ute)?s?|hours?|s(?:econds?)?)'
    
    stats = {
        "percentages": re.findall(percentage_pattern, text),
        "numbers": re.findall(numerical_pattern, text),
        "durations": re.findall(duration_pattern, text)
    }
    return stats

def classify_chunk(text, gemini_data=None):
    """Enhanced chunk classification with metadata extraction, optionally using Gemini data."""
    text_lower = text.lower()
    
    entities = extract_entities(text)
    stats = extract_stats(text)

    category = "general"
    metadata = {
        "entities": entities,
        "stats": stats,
        "keywords": [],
        "effects": []
    }

    if gemini_data:
        if gemini_data.get("entity_type"):
            category = gemini_data["entity_type"]
        if gemini_data.get("entity_name"):
            metadata["item_name"] = gemini_data["entity_name"]
        if gemini_data.get("description"):
            metadata["description"] = gemini_data["description"]
        if gemini_data.get("effects"):
            metadata["effects"].extend(gemini_data["effects"])
        if gemini_data.get("stats"):
            for stat_type, values in gemini_data["stats"].items():
                if stat_type in metadata["stats"]:
                    metadata["stats"][stat_type].extend(values)
                else:
                    metadata["stats"][stat_type] = values
        if gemini_data.get("acquisition_method"):
            metadata["recipe"] = gemini_data["acquisition_method"]
        if gemini_data.get("duration"):
            metadata["buff_duration"] = gemini_data["duration"]
        if gemini_data.get("related_entities"):
            metadata["other_info"] = "; ".join(gemini_data["related_entities"])
        if gemini_data.get("notes"):
            metadata["other_info"] = metadata.get("other_info", "") + "; " + gemini_data["notes"] if metadata.get("other_info") else gemini_data["notes"]

    # Existing classification logic (can be augmented or overridden by Gemini data)
    if any(entities.get("weapons", [])):
        category = "weapon"
    elif any(entities.get("armor_sets", [])):
        category = "armor_set"
    elif any(entities.get("key_gear", [])):
        category = "key_gear"
    elif any(entities.get("weapon_mods", [])):
        category = "weapon_mod"
    elif any(entities.get("armor_mods", [])):
        category = "armor_mod"
    elif any(keyword in text_lower for keyword in ["gun", "weapon", "rifle", "pistol", "shotgun", "smg", "sniper", "lmg", "machine gun"]):
        category = "weapon"
    elif any(keyword in text_lower for keyword in ["armor", "set", "helmet", "vest", "pants", "gloves", "mask", "wrap", "shirt", "boots"]):
        category = "armor_general"
    elif any(keyword in text_lower for keyword in ["mod", "attachment", "upgrade", "scope", "magazine", "stock"]):
        category = "mod_general"
    elif any(keyword in text_lower for keyword in ["food", "buff", "cooking", "recipe", "dish", "effect", "drink"]):
        category = "food_buffs"

    effect_keywords = ["increase", "decrease", "boost", "reduce", "gain", "buff", "debuff", "bonus", "damage", "defense", "resistance"]
    metadata["keywords"].extend([word for word in effect_keywords if word in text_lower and word not in metadata["keywords"]])

    effect_pattern = r'(?:increases?|decreases?|boosts?|reduces?|gains?|buffs?|provides?)\s[^.]*'
    import re
    effects = re.findall(effect_pattern, text_lower)
    metadata["effects"].extend([effect.strip() for effect in effects if effect.strip() not in metadata["effects"]])

    return category, metadata

def add_verified_data(text, source):
    """Adds a new verified entry to the ChromaDB collection."""
    print("Initializing ChromaDB client...")
    chroma_client = chromadb.PersistentClient(path="c:/Users/Sanve/OneDrive/Documents/Code project/rag_pipeline/chroma_db")
    print("Initializing embedding function...")
    embedding_function = embedding_functions.SentenceTransformerEmbeddingFunction(
        model_name="all-MiniLM-L6-v2"
    )
    print("Getting or creating collection...")
    collection = chroma_client.get_or_create_collection(
        name="once_human_knowledge",
        embedding_function=embedding_function
    )
    print("Structuring data with Gemini...")
    gemini_structured_data = gemini_structure_data(text)

    print("Classifying chunk...")
    # Process the text to create a structured document
    category, chunk_metadata = classify_chunk(text, gemini_structured_data)

    processed_metadata = {
        "category": chunk_metadata.get("entity_type", category), # Use entity_type from Gemini, fallback to existing category
        "source": source,  # Use the source passed to the function
        "verified": True,  # Add the verified flag
        "item_name": chunk_metadata.get("entity_name", "Unknown"),
        "description": chunk_metadata.get("description", "Unknown"),
        "recipe": chunk_metadata.get("acquisition_method", "Unknown"),
        "buff_duration": chunk_metadata.get("duration", "Unknown"),
        "other_info": "; ".join(filter(None, [chunk_metadata.get("related_entities", "Unknown") if isinstance(chunk_metadata.get("related_entities"), str) else "; ".join(chunk_metadata.get("related_entities", [])), chunk_metadata.get("notes", "Unknown")])),
        "effects": "; ".join(chunk_metadata.get("effects", [])),
        "keywords": "; ".join(chunk_metadata.get("keywords", [])),
        "stats_percentages": "; ".join(chunk_metadata.get("stats", {}).get("percentages", [])),
        "stats_numbers": "; ".join(chunk_metadata.get("stats", {}).get("numbers", [])),
        "stats_durations": "; ".join(chunk_metadata.get("stats", {}).get("durations", [])),
        "entities_weapons": "; ".join(chunk_metadata.get("entities", {}).get("weapons", [])),
        "entities_armor_sets": "; ".join(chunk_metadata.get("entities", {}).get("armor_sets", [])),
        "entities_key_gear": "; ".join(chunk_metadata.get("entities", {}).get("key_gear", [])),
        "entities_weapon_mods": "; ".join(chunk_metadata.get("entities", {}).get("weapon_mods", [])),
        "entities_armor_mods": "; ".join(chunk_metadata.get("entities", {}).get("armor_mods", []))
    }

    # Create a unique ID for the new entry
    import uuid
    new_id = str(uuid.uuid4())

    print(f"Adding document with ID: {new_id}")
    # Add the new document to the collection
    collection.add(
        ids=[new_id],
        documents=[text],
        metadatas=[processed_metadata]
    )
    print("Document added successfully.")
    
    return new_id

if __name__ == "__main__":
    # This script is designed to be called from another script or process
    # It expects a JSON string as a command-line argument with "text" and "source"
    import json
    if len(sys.argv) > 1:
        try:
            input_data = json.loads(sys.argv[1])
            text = input_data["text"]
            source = input_data["source"]
            new_id = add_verified_data(text, source)
            print(f"Successfully added verified data with ID: {new_id}")
        except Exception as e:
            print(f"Error processing input: {e}")
    else:
        print("No input data provided.")
