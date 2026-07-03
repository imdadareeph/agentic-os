#!/usr/bin/env python3
"""
Example: Human-in-the-Loop (HITL) Integration

This example demonstrates how to use the HITL utility in hooks
to request human feedback, permissions, or choices during agent execution.

Usage Examples:
1. Question: Ask a free-form question
2. Permission: Request approval for an action
3. Choice: Present multiple options

To test this example:
1. Ensure the observability server is running (bun run dev in apps/server)
2. Ensure the client dashboard is running (bun run dev in apps/client)
3. Run this script directly to see different HITL request types
"""

import sys
import json
import os

# Add utils to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from utils.hitl import ask_question, ask_permission, ask_choice


def example_question():
    """Example: Ask a free-form question"""
    print("Example 1: Asking a question...")

    session_data = {
        "source_app": "hitl_example",
        "session_id": "example_session_123"
    }

    question = "What coding style should I use for this project: functional or object-oriented?"
    print(f"Sending question: {question}")

    answer = ask_question(question, session_data, timeout=60)

    if answer:
        print(f"✅ Received answer: {answer}")
        return answer
    else:
        print("❌ No response received (timeout or error)")
        return None


def example_permission():
    """Example: Request permission for an action"""
    print("\nExample 2: Requesting permission...")

    session_data = {
        "source_app": "hitl_example",
        "session_id": "example_session_456"
    }

    question = "⚠️  Agent wants to execute: rm -rf /tmp/test_data\n\nThis will delete temporary test data. Do you want to allow this?"
    print(f"Requesting permission: {question}")

    approved = ask_permission(question, session_data, timeout=60)

    if approved:
        print("✅ Permission granted!")
        # Proceed with dangerous operation
        return True
    else:
        print("❌ Permission denied!")
        # Block the operation
        return False


def example_choice():
    """Example: Present multiple choices"""
    print("\nExample 3: Requesting a choice...")

    session_data = {
        "source_app": "hitl_example",
        "session_id": "example_session_789"
    }

    question = "Which testing framework should I use for this project?"
    choices = ["Jest", "Vitest", "Mocha", "Jasmine"]
    print(f"Presenting choices: {choices}")

    selected = ask_choice(question, choices, session_data, timeout=60)

    if selected:
        print(f"✅ User selected: {selected}")
        return selected
    else:
        print("❌ No choice made (timeout or error)")
        return None


def main():
    """
    Run all examples

    Note: Each example will pause and wait for human response
    via the observability dashboard
    """
    print("=" * 60)
    print("Human-in-the-Loop (HITL) Examples")
    print("=" * 60)
    print("\nMake sure:")
    print("1. Observability server is running (apps/server)")
    print("2. Client dashboard is open (apps/client)")
    print("3. You're ready to respond to requests in the dashboard")
    print("\n" + "=" * 60 + "\n")

    # Run examples
    example_question()
    example_permission()
    example_choice()

    print("\n" + "=" * 60)
    print("Examples completed!")
    print("=" * 60)


if __name__ == "__main__":
    main()
