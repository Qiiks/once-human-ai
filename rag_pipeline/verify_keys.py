import google.generativeai as genai
import os
from google.api_core import exceptions

# List of API keys to test
api_keys = [
    "AIzaSyC3wUM3FZiddeZGlc5w7MSJkM5aOaH4y5g",
    "AIzaSyDcZgPI4jxtc7kvojkrDpl9zEYCGUF7Nck",
    "AIzaSyAfmYm50XVXDw1IvlweG59ujFuwYJPrFzs",
    "AIzaSyATdqRRMW4XZYKNjjCx2MwFPLoisYj0u6I",
    "AIzaSyCEde-LqXCAUmJ32JiSEawIj-8MsWdahe0",
    "AIzaSyCfr1aaVsEJVIlNZjWVF9YF2-Pn7LPkNJo",
    "AIzaSyAfmYm50XVXDw1IvlweG59ujFuwYJPrFzs",
    "AIzaSyDLCqM6gLfey3WODW82hIG0EOiqT6As4fI",
    "AIzaSyC824D6zUIZHjwZe3oeORh6WdxYg1cnPe4",
    "AIzaSyD-IziFtoCy9Tv92743AuucgTA-AVMXdLU",
]

# Configure the generative model
model = "gemini-2.5-pro"
output_file = "working_keys.txt"

with open(output_file, "w") as f:
    for key in api_keys:
        try:
            # Configure the genai client with the current key
            genai.configure(api_key=key)
            
            # Create a client for the model
            client = genai.GenerativeModel(model)
            
            # Make a simple test call
            response = client.generate_content("test")
            
            # If the call is successful, print the status and write to file
            print(f"[{key}] - WORKING")
            f.write(key + "\n")
            
        except exceptions.ResourceExhausted as e:
            # Handle 429 Too Many Requests error
            print(f"[{key}] - RATE LIMITED")
            f.write(key + "\n")
            
        except exceptions.PermissionDenied as e:
            # Handle other permission or authentication errors
            print(f"[{key}] - FAILED")
            
        except Exception as e:
            # Handle any other unexpected errors
            print(f"[{key}] - FAILED ({type(e).__name__})")

print(f"\nWorking and rate-limited keys have been saved to {output_file}")
