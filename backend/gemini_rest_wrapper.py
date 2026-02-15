#!/usr/bin/env python3
"""
Gemini API Wrapper - Pure REST (No grpcio)
"""
import requests
import json
import os # Import os to access environment variables

class GeminiWrapper:
    def __init__(self): # Removed config_path as it's no longer needed
        self.api_key = os.environ.get("GEMINI_API_KEY") # Retrieve API key from environment variable
        
        if not self.api_key:
            raise ValueError("GEMINI_API_KEY environment variable is not set. Please set it.")
        
        self.base_url = "https://generativelanguage.googleapis.com/v1beta/models"
        self.model = "gemini-2.0-flash-exp"
    
    def generate(self, prompt, response_format='text'):
        """Generate content via REST API"""
        url = f"{self.base_url}/{self.model}:generateContent?key={self.api_key}"
        
        payload = {
            "contents": [{
                "parts": [{"text": prompt}]
            }],
            "generationConfig": {
                "temperature": 0.7,
                "maxOutputTokens": 8192
            }
        }
        
        try:
            response = requests.post(url, json=payload, timeout=60)
            
            if response.status_code != 200:
                raise Exception(f"API error {response.status_code}: {response.text}")
            
            result = response.json()
            # Safely extract text, handling potential missing keys
            text = result.get('candidates', [{}])[0].get('content', {}).get('parts', [{}])[0].get('text', '')
            
            if not text:
                raise Exception("No text found in Gemini API response.")

            if response_format == 'json':
                try:
                    return json.loads(text)
                except json.JSONDecodeError:
                    print(f"[WARNING] Gemini response not valid JSON for response_format='json': {text}")
                    return {"raw": text, "error": "JSON parse error"}
            
            return text
            
        except requests.exceptions.RequestException as e:
            raise Exception(f"Network or request error: {e}")
        except Exception as e:
            raise Exception(f"Gemini API call failed: {e}")

if __name__ == '__main__':
    # For local testing, ensure GEMINI_API_KEY is set in your environment:
    # export GEMINI_API_KEY="YOUR_API_KEY_HERE"
    if "GEMINI_API_KEY" not in os.environ:
        print("Error: GEMINI_API_KEY environment variable is not set. Please set it for testing.")
        exit(1)

    try:
        wrapper = GeminiWrapper()
        result = wrapper.generate("Say 'Code City is online'")
        print(result)

        json_result = wrapper.generate("Provide a very short JSON object with 'status' and 'message' fields for 'Code City is online'.", response_format='json')
        print(json.dumps(json_result, indent=2))
        
    except ValueError as e:
        print(f"Configuration Error: {e}")
    except Exception as e:
        print(f"Gemini Interaction Error: {e}")