# YouTube APIs — Knowledge Base

Status: Reference  
Cursor skill: `.cursor/skills/youtube-apis/`  
Last synced: 2026-06-27

---

## Overview

Google exposes two primary APIs for YouTube integrations:

| API | Purpose | Auth |
|-----|---------|------|
| [YouTube Data API v3](https://developers.google.com/youtube/v3) | Metadata, search, uploads, playlists, comments | API key (public) or OAuth (private) |
| [YouTube Analytics API v2](https://developers.google.com/youtube/analytics/reference) | Performance reports — views, watch time, demographics, revenue | OAuth only |

Use Data API for **what exists**; Analytics API for **how it performed over time**.

---

## Quick reference

### videos.list (Data API)

```
GET https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=VIDEO_ID&key=API_KEY
```

- [Official docs](https://developers.google.com/youtube/v3/docs/videos/list)
- Quota: 1 unit
- Filter: exactly one of `id`, `chart=mostPopular`, or `myRating`

### reports.query (Analytics API)

```
GET https://youtubeanalytics.googleapis.com/v2/reports
  ?ids=channel==MINE&startDate=2025-01-01&endDate=2025-12-31
  &metrics=views,estimatedMinutesWatched&dimensions=day&sort=day
```

- [Official docs](https://developers.google.com/youtube/analytics/reference/reports/query)
- Requires `youtube.readonly` + `yt-analytics.readonly` scopes

---

## When to use which

| Task | API | Endpoint |
|------|-----|----------|
| Video title, thumbnail, description | Data | `videos.list` |
| Current view/like counts (snapshot) | Data | `videos.list` part=statistics |
| Search YouTube | Data | `search.list` (100 units) |
| Daily view trends | Analytics | `reports.query` dimensions=day |
| Top performing videos | Analytics | `reports.query` dimensions=video |
| Revenue / CPM | Analytics | monetary scope + revenue metrics |
| Upload a video | Data | `videos.insert` (1600 units) |

---

## Credentials

| Type | Use case |
|------|----------|
| API key | Public read: metadata, search, trending |
| OAuth 2.0 | User channel data, analytics, uploads, likes |

Env vars: `YOUTUBE_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.

---

## See also

- `.cursor/skills/youtube-apis/SKILL.md` — agent workflow and pitfalls
- `.cursor/skills/youtube-apis/data-api.md` — Data API field reference
- `.cursor/skills/youtube-apis/analytics-api.md` — Analytics metrics and dimensions
