#!/usr/bin/env python3
"""
Test script for proposal section expansion flow.
Tests the backend /api/ai/generate-proposal endpoint.
"""

import requests
import json
import time

BACKEND_URL = "http://127.0.0.1:8000"

def test_batch_expand():
    """Test batch expansion of proposal sections."""
    print("\n" + "="*60)
    print("TEST: Batch Section Expansion")
    print("="*60)
    
    payload = {
        "mode": "batch_expand",
        "section_keys": [
            "vendor_information",
            "company_profile",
            "project_understanding"
        ],
        "all_sections": {
            "vendor_information": "We are a leading technology consulting firm with 15 years of experience.",
            "company_profile": "Our company specializes in digital transformation and cloud solutions.",
            "project_understanding": "We understand the need to modernize legacy systems while maintaining business continuity."
        },
        "rfp_context": "Looking for a vendor to help modernize our infrastructure and implement cloud-native solutions. Timeline: 12 months. Budget: $500k-1M."
    }
    
    print("\nSending request to /api/ai/generate-proposal with mode='batch_expand'...")
    print(f"Sections to expand: {payload['section_keys']}")
    
    try:
        response = requests.post(
            f"{BACKEND_URL}/api/ai/generate-proposal",
            json=payload,
            timeout=120
        )
        
        if response.status_code == 200:
            result = response.json()
            print("\n✓ Request successful!")
            print("\nExpanded sections:")
            for section_key, expanded_content in result.get("expanded_sections", {}).items():
                print(f"\n─── {section_key} ───")
                # Show first 300 chars of expanded content
                display_text = expanded_content[:300] + "..." if len(expanded_content) > 300 else expanded_content
                print(f"{display_text}")
            
            return result
        else:
            print(f"\n✗ Request failed with status {response.status_code}")
            print(f"Response: {response.text}")
            return None
    
    except Exception as e:
        print(f"\n✗ Error: {e}")
        return None

def test_executive_summary(expanded_sections):
    """Test executive summary generation."""
    print("\n" + "="*60)
    print("TEST: Executive Summary Generation")
    print("="*60)
    
    payload = {
        "mode": "executive_summary",
        "all_sections": expanded_sections,
        "rfp_context": "Looking for a vendor to help modernize our infrastructure and implement cloud-native solutions. Timeline: 12 months. Budget: $500k-1M.",
        "vendor_name": "TechConsult Inc.",
        "contract_title": "Cloud Infrastructure Modernization"
    }
    
    print("\nSending request to /api/ai/generate-proposal with mode='executive_summary'...")
    
    try:
        response = requests.post(
            f"{BACKEND_URL}/api/ai/generate-proposal",
            json=payload,
            timeout=120
        )
        
        if response.status_code == 200:
            result = response.json()
            print("\n✓ Request successful!")
            summary = result.get("executive_summary", "")
            print("\nGenerated Executive Summary:")
            print(f"{summary[:500]}..." if len(summary) > 500 else summary)
            
            return result
        else:
            print(f"\n✗ Request failed with status {response.status_code}")
            print(f"Response: {response.text}")
            return None
    
    except Exception as e:
        print(f"\n✗ Error: {e}")
        return None

def main():
    """Run all tests."""
    print("\n" + "#"*60)
    print("# PROPOSAL EXPANSION ENDPOINT TEST SUITE")
    print("#"*60)
    
    # Test 1: Batch expansion
    expanded = test_batch_expand()
    
    if expanded:
        # Test 2: Executive summary
        test_executive_summary(expanded.get("expanded_sections", {}))
    
    print("\n" + "#"*60)
    print("# TEST SUITE COMPLETE")
    print("#"*60)

if __name__ == "__main__":
    main()
