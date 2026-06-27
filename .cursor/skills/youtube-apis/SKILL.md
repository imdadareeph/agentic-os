---
name: youtube-apis
description: >-
  Integrates with YouTube Data API v3 and YouTube Analytics API — video metadata,
  search, channels, playlists, analytics reports, and OAuth. Use when building
  YouTube integrations, fetching video stats, channel analytics, OAuth flows,
  or when the user mentions YouTube API, videos.list, reports.query, or
  yt-analytics.
---

# YouTube APIs

Official docs:
- [YouTube Data API v3](https://developers.google.com/youtube/v3)
- [videos.list](https://developers.google.com/youtube/v3/docs/videos/list)
- [YouTube Analytics API](https://developers.google.com/youtube/analytics/reference)
- [reports.query](https://developers.google.com/youtube/analytics/reference/reports/query)

## Which API?

| Need | API | Base URL |
|------|-----|----------|
| Video metadata, search, uploads, playlists, comments | **Data API v3** | `https://www.googleapis.com/youtube/v3` |
| Views, watch time, demographics, revenue, traffic sources | **Analytics API v2** | `https://youtubeanalytics.googleapis.com/v2` |
| Bulk historical CSV dumps (content owners) | **Reporting API** | Separate bulk-download flow |

Data API answers "what is this video?" Analytics answers "how did it perform?"

## Setup checklist

1. Create a Google Cloud project and enable **YouTube Data API v3** and/or **YouTube Analytics API**.
2. Create credentials:
   - **API key** — public read-only Data API calls (search, public video metadata).
   - **OAuth 2.0** — user-owned data (`myRating`, uploads, Analytics reports).
3. Configure OAuth consent screen; add test users while in testing mode.
4. Store secrets in env vars (`YOUTUBE_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) — never commit.

## Auth scopes

| Scope | Use |
|-------|-----|
| `https://www.googleapis.com/auth/youtube.readonly` | Read channel/video data (Data API); **required** for Analytics `reports.query` |
| `https://www.googleapis.com/auth/youtube` | Manage account; Analytics group management |
| `https://www.googleapis.com/auth/yt-analytics.readonly` | View analytics (views, likes, watch time) |
| `https://www.googleapis.com/auth/yt-analytics-monetary.readonly` | Revenue and ad metrics |
| `https://www.googleapis.com/auth/youtubepartner` | Content-owner reports and asset groups |

Request the **minimum** scopes needed. Analytics monetary scope requires YouTube Partner Program access for revenue data.

## Common workflows

### 1. Get video metadata by ID

```
GET https://www.googleapis.com/youtube/v3/videos
  ?part=snippet,contentDetails,statistics
  &id=VIDEO_ID_1,VIDEO_ID_2
  &key=API_KEY
```

- Quota cost: **1 unit** per call.
- Up to 50 video IDs per request (comma-separated `id`).
- `statistics` includes `viewCount`, `likeCount`, `commentCount`.
- `contentDetails` includes `duration` (ISO 8601, e.g. `PT4M13S`).

### 2. Most popular videos (chart)

```
GET .../videos?part=snippet,statistics&chart=mostPopular&regionCode=US&videoCategoryId=0&maxResults=25&key=API_KEY
```

Requires `chart=mostPopular`. Optional `regionCode` (ISO 3166-1 alpha-2) and `videoCategoryId`.

### 3. Search then enrich

Search (`search.list`, 100 quota units) returns video IDs — follow with `videos.list` (1 unit) for full metadata:

```
GET .../search?part=snippet&type=video&q=QUERY&maxResults=10&key=API_KEY
GET .../videos?part=snippet,statistics&id=ID1,ID2,...&key=API_KEY
```

### 4. Channel analytics (daily views)

OAuth required. Use Analytics `reports.query`:

```
GET https://youtubeanalytics.googleapis.com/v2/reports
  ?ids=channel==MINE
  &startDate=2025-01-01
  &endDate=2025-12-31
  &metrics=views,estimatedMinutesWatched,subscribersGained
  &dimensions=day
  &sort=day
```

- `ids`: `channel==MINE` or `channel==CHANNEL_ID` for channels; `contentOwner==OWNER_NAME` for MCNs.
- Dates: `YYYY-MM-DD`. Response may truncate to last day where **all** requested metrics are available.
- Filter a video: `filters=video==VIDEO_ID`

### 5. Per-video performance report

```
.../reports?ids=channel==MINE&startDate=2025-01-01&endDate=2025-03-31
  &metrics=views,likes,estimatedMinutesWatched,averageViewDuration
  &dimensions=video
  &sort=-views
  &maxResults=25
```

## Decision rules

- **Public metadata only** → API key + Data API (`videos.list`, `search.list`, `channels.list`).
- **Authenticated user data** → OAuth + appropriate scope.
- **Analytics time-series** → Analytics API `reports.query` (not Data API `statistics`, which is cumulative snapshot).
- **Revenue** → `yt-analytics-monetary.readonly` + monetary metrics (`estimatedRevenue`, `cpm`, etc.).
- **Multiple videos in one analytics query** → `filters=video==ID1,ID2` (up to 500 IDs); join filters with `;`.

## Quota (Data API v3)

Default daily quota: **10,000 units**. High-cost methods:

| Method | Cost |
|--------|------|
| `videos.list` | 1 |
| `channels.list` | 1 |
| `search.list` | 100 |
| `videos.insert` | 1,600 |

Batch video lookups via `id` param; avoid search when IDs are known.

## Error handling

| Code | Typical cause | Fix |
|------|---------------|-----|
| 400 `videoChartNotFound` | Invalid chart/region combo | Check `regionCode` + `videoCategoryId` |
| 403 `forbidden` | Missing scope or owner-only `part` | Add OAuth scope; drop `fileDetails`/`processingDetails` |
| 403 quota | Daily limit exceeded | Cache, batch, reduce `search.list` |
| 404 `videoNotFound` | Bad video ID | Validate ID format (11 chars) |

## Implementation defaults

**Node.js** — `googleapis` package:
```javascript
import { google } from 'googleapis';
const youtube = google.youtube({ version: 'v3', auth: apiKey });
const { data } = await youtube.videos.list({
  part: ['snippet', 'statistics'],
  id: ['dQw4w9WgXcQ'],
});
```

**Python** — `google-api-python-client`:
```python
from googleapiclient.discovery import build
youtube = build('youtube', 'v3', developerKey=api_key)
resp = youtube.videos().list(part='snippet,statistics', id='VIDEO_ID').execute()
```

For Analytics, use service name `youtubeAnalytics`, version `v2`, OAuth credentials.

## Pitfalls

- `videos.list` filter: specify **exactly one** of `chart`, `id`, or `myRating`.
- `maxResults` / `pageToken` work with `myRating`, **not** with `id`.
- `fileDetails`, `processingDetails`, `suggestions` parts are **owner-only**.
- Analytics `day` dimension omits the most recent days (processing lag).
- Valid metric/dimension combos are restricted — check [channel reports](https://developers.google.com/youtube/analytics/channel_reports) before building queries.
- `statistics.viewCount` (Data API) is a lifetime snapshot; Analytics `views` is time-bucketed by `startDate`/`endDate`.

## Additional resources

- Data API endpoints and `part` values: [data-api.md](data-api.md)
- Analytics metrics, dimensions, groups: [analytics-api.md](analytics-api.md)
