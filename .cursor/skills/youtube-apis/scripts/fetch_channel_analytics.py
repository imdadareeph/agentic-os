#!/usr/bin/env python3
"""Fetch ElectrifywithMe / any YouTube channel stats and analytics.

Requires:
  - YOUTUBE_API_KEY — public channel + video stats (Data API v3)
  - OAuth client JSON — private analytics (Analytics API v2)

Usage:
  export YOUTUBE_API_KEY=your_key
  python fetch_channel_analytics.py --channel UCbg8GDBk6s2yIWAWqhIUaxA
  python fetch_channel_analytics.py --channel UCbg8GDBk6s2yIWAWqhIUaxA --analytics --days 90
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import date, timedelta
from pathlib import Path

CHANNEL_DEFAULT = "UCbg8GDBk6s2yIWAWqhIUaxA"
SCOPES = [
    "https://www.googleapis.com/auth/youtube.readonly",
    "https://www.googleapis.com/auth/yt-analytics.readonly",
]


def require_google_client():
    try:
        from googleapiclient.discovery import build
        from googleapiclient.errors import HttpError
    except ImportError:
        print(
            "Missing dependency. Install:\n"
            "  pip install google-api-python-client google-auth-oauthlib",
            file=sys.stderr,
        )
        sys.exit(1)
    return build, HttpError


def get_data_api():
    build, _ = require_google_client()
    api_key = os.environ.get("YOUTUBE_API_KEY")
    if not api_key:
        print("Set YOUTUBE_API_KEY for Data API access.", file=sys.stderr)
        return None
    return build("youtube", "v3", developerKey=api_key)


def get_analytics_api():
    build, _ = require_google_client()
    try:
        from google.auth.transport.requests import Request
        from google.oauth2.credentials import Credentials
        from google_auth_oauthlib.flow import InstalledAppFlow
    except ImportError:
        print(
            "Missing OAuth dependency. Install:\n"
            "  pip install google-auth-oauthlib",
            file=sys.stderr,
        )
        return None

    token_path = Path.home() / ".config" / "agentic-os" / "youtube_token.json"
    client_secret = os.environ.get("GOOGLE_CLIENT_SECRETS_FILE")
    if not client_secret:
        for candidate in (
            Path("client_secret.json"),
            Path.home() / "Downloads" / "client_secret.json",
        ):
            if candidate.exists():
                client_secret = str(candidate)
                break

    creds = None
    if token_path.exists():
        creds = Credentials.from_authorized_user_file(str(token_path), SCOPES)

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            if not client_secret:
                print(
                    "OAuth required for analytics. Set GOOGLE_CLIENT_SECRETS_FILE "
                    "or place client_secret.json in cwd.",
                    file=sys.stderr,
                )
                return None
            flow = InstalledAppFlow.from_client_secrets_file(client_secret, SCOPES)
            creds = flow.run_local_server(port=0)
        token_path.parent.mkdir(parents=True, exist_ok=True)
        token_path.write_text(creds.to_json())

    return build("youtubeAnalytics", "v2", credentials=creds)


def fetch_channel_stats(youtube, channel_id: str) -> dict:
    _, HttpError = require_google_client()
    try:
        resp = (
            youtube.channels()
            .list(part="snippet,statistics,contentDetails", id=channel_id)
            .execute()
        )
    except HttpError as err:
        raise SystemExit(f"Data API error: {err}") from err

    items = resp.get("items", [])
    if not items:
        raise SystemExit(f"Channel not found: {channel_id}")

    ch = items[0]
    uploads_id = ch["contentDetails"]["relatedPlaylists"]["uploads"]
    return {
        "channel_id": channel_id,
        "title": ch["snippet"]["title"],
        "description": ch["snippet"]["description"][:200],
        "published_at": ch["snippet"]["publishedAt"],
        "subscribers": ch["statistics"].get("subscriberCount"),
        "total_views": ch["statistics"].get("viewCount"),
        "video_count": ch["statistics"].get("videoCount"),
        "uploads_playlist_id": uploads_id,
    }


def fetch_recent_videos(youtube, uploads_playlist_id: str, max_results: int = 10) -> list:
    _, HttpError = require_google_client()
    try:
        pl = (
            youtube.playlistItems()
            .list(part="snippet", playlistId=uploads_playlist_id, maxResults=max_results)
            .execute()
        )
        video_ids = [
            item["snippet"]["resourceId"]["videoId"] for item in pl.get("items", [])
        ]
        if not video_ids:
            return []

        videos = (
            youtube.videos()
            .list(part="snippet,statistics,contentDetails", id=",".join(video_ids))
            .execute()
        )
    except HttpError as err:
        raise SystemExit(f"Data API error: {err}") from err

    results = []
    for v in videos.get("items", []):
        results.append(
            {
                "id": v["id"],
                "title": v["snippet"]["title"],
                "published_at": v["snippet"]["publishedAt"],
                "duration": v["contentDetails"]["duration"],
                "views": v["statistics"].get("viewCount"),
                "likes": v["statistics"].get("likeCount"),
                "comments": v["statistics"].get("commentCount"),
            }
        )
    return sorted(results, key=lambda x: x["published_at"], reverse=True)


def fetch_analytics(analytics, channel_id: str, days: int) -> dict:
    _, HttpError = require_google_client()
    end = date.today()
    start = end - timedelta(days=days)

    try:
        daily = (
            analytics.reports()
            .query(
                ids=f"channel=={channel_id}",
                startDate=start.isoformat(),
                endDate=end.isoformat(),
                metrics="views,estimatedMinutesWatched,subscribersGained,likes",
                dimensions="day",
                sort="day",
            )
            .execute()
        )
        top_videos = (
            analytics.reports()
            .query(
                ids=f"channel=={channel_id}",
                startDate=start.isoformat(),
                endDate=end.isoformat(),
                metrics="views,estimatedMinutesWatched,likes",
                dimensions="video",
                sort="-views",
                maxResults=10,
            )
            .execute()
        )
        traffic = (
            analytics.reports()
            .query(
                ids=f"channel=={channel_id}",
                startDate=start.isoformat(),
                endDate=end.isoformat(),
                metrics="views,estimatedMinutesWatched",
                dimensions="insightTrafficSourceType",
                sort="-views",
            )
            .execute()
        )
    except HttpError as err:
        raise SystemExit(f"Analytics API error: {err}") from err

    return {
        "period": {"start": start.isoformat(), "end": end.isoformat(), "days": days},
        "daily": table_to_dicts(daily),
        "top_videos": table_to_dicts(top_videos),
        "traffic_sources": table_to_dicts(traffic),
    }


def table_to_dicts(table: dict) -> list[dict]:
    headers = [h["name"] for h in table.get("columnHeaders", [])]
    rows = table.get("rows", [])
    return [dict(zip(headers, row)) for row in rows]


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch YouTube channel stats and analytics")
    parser.add_argument("--channel", default=CHANNEL_DEFAULT, help="Channel ID (UC...)")
    parser.add_argument("--analytics", action="store_true", help="Include Analytics API reports (OAuth)")
    parser.add_argument("--days", type=int, default=90, help="Analytics lookback days")
    parser.add_argument("--videos", type=int, default=10, help="Recent videos to fetch")
    args = parser.parse_args()

    output: dict = {"channel_id": args.channel}

    youtube = get_data_api()
    if youtube:
        output["channel"] = fetch_channel_stats(youtube, args.channel)
        output["recent_videos"] = fetch_recent_videos(
            youtube, output["channel"]["uploads_playlist_id"], args.videos
        )
    else:
        output["channel"] = None
        output["recent_videos"] = None
        output["data_api_note"] = "Set YOUTUBE_API_KEY to fetch public channel stats."

    if args.analytics:
        analytics = get_analytics_api()
        if analytics:
            output["analytics"] = fetch_analytics(analytics, args.channel, args.days)
        else:
            output["analytics"] = None
            output["analytics_note"] = "OAuth setup required — see skill docs."
    else:
        output["analytics_note"] = "Pass --analytics for time-series reports (OAuth required)."

    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()
