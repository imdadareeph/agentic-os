#!/usr/bin/env python3
"""Quick test script for HITL feature"""
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from utils.hitl import ask_permission

def main():
    print("🚀 Sending HITL permission request...")
    print("📊 Check your dashboard at http://localhost:5173")
    print("⏳ Waiting for your response...\n")

    session_data = {
        "source_app": "hitl-test",
        "session_id": "test-session-001"
    }

    question = """⚠️ DANGER: Agent wants to execute a potentially dangerous command:

    $ rm -rf /tmp/old_backups

This will permanently delete all files in /tmp/old_backups.

Do you want to allow this operation?"""

    approved = ask_permission(question, session_data, timeout=120)

    print("\n" + "="*60)
    if approved:
        print("✅ PERMISSION GRANTED!")
        print("The agent would now proceed with the operation.")
    else:
        print("❌ PERMISSION DENIED!")
        print("The operation has been blocked.")
    print("="*60)

    return 0 if approved else 1

if __name__ == "__main__":
    sys.exit(main())
