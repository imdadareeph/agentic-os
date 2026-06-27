# YouTube Analytics API v2 — Reference

Base: `https://youtubeanalytics.googleapis.com/v2`

Overview: [API Reference](https://developers.google.com/youtube/analytics/reference)

## reports.query

`GET /reports` — real-time analytics reports.

**Requires OAuth.** Must include `https://www.googleapis.com/auth/youtube.readonly` plus `yt-analytics.readonly` (or monetary scope for revenue).

### Required parameters

| Param | Format | Example |
|-------|--------|---------|
| `ids` | `channel==MINE`, `channel==UC...`, or `contentOwner==OWNER` | `channel==MINE` |
| `startDate` | `YYYY-MM-DD` | `2025-01-01` |
| `endDate` | `YYYY-MM-DD` | `2025-12-31` |
| `metrics` | Comma-separated metric names | `views,likes,estimatedMinutesWatched` |

### Optional parameters

| Param | Description |
|-------|-------------|
| `dimensions` | Comma-separated grouping (e.g. `day`, `video`, `country`, `ageGroup,gender`) |
| `filters` | Semicolon-joined filters (e.g. `video==ID1,ID2;country==US`) |
| `sort` | Comma-separated; prefix `-` for descending (e.g. `-views`) |
| `maxResults` | Max rows returned |
| `startIndex` | 1-based pagination offset |
| `currency` | ISO 4217 code for revenue metrics (default `USD`) |
| `includeHistoricalChannelData` | Content-owner only; include pre-linking data |

### Concepts

- **Metrics** — measurements (`views`, `likes`, `estimatedMinutesWatched`, `subscribersGained`).
- **Dimensions** — aggregation axes (`day`, `month`, `video`, `playlist`, `country`, `deviceType`, `insightTrafficSourceType`).
- **Filters** — restrict rows (`video==ID`, `country==US`). Multiple filters joined with `;` (AND). Up to 500 IDs for `video`, `playlist`, `channel` filters.

### Response (JSON)

```json
{
  "kind": "youtubeAnalytics#resultTable",
  "columnHeaders": [
    { "name": "day", "columnType": "DIMENSION", "dataType": "STRING" },
    { "name": "views", "columnType": "METRIC", "dataType": "INTEGER" }
  ],
  "rows": [["2025-01-01", 1234], ["2025-01-02", 1567]]
}
```

Column order = dimensions first (request order), then metrics (request order). Empty result omits `rows`.

### Common metric bundles

**Channel overview (daily)**
```
metrics=views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,subscribersGained
dimensions=day
sort=day
```

**Top videos**
```
metrics=views,estimatedMinutesWatched,likes
dimensions=video
sort=-views
maxResults=25
```

**Traffic sources**
```
metrics=views,estimatedMinutesWatched
dimensions=insightTrafficSourceType
```

**Demographics**
```
metrics=viewerPercentage
dimensions=ageGroup,gender
```

**Revenue** (requires `yt-analytics-monetary.readonly`)
```
metrics=estimatedRevenue,estimatedAdRevenue,cpm,playbackBasedCpm
dimensions=day
currency=USD
```

### Report compatibility

Not every metric works with every dimension. Before building a query, verify against:
- [Channel reports](https://developers.google.com/youtube/analytics/channel_reports)
- [Content owner reports](https://developers.google.com/youtube/analytics/content_owner_reports)
- [Metrics definitions](https://developers.google.com/youtube/analytics/metrics)
- [Dimensions definitions](https://developers.google.com/youtube/analytics/dimensions)

### Data lag

- `day` dimension: most recent days may be missing from response.
- `endDate` may be clipped to last day where **all** requested metrics are available.

---

## Groups API

Custom collections (up to 500 items of same type) for aggregated analytics.

| Resource | Methods | Base path |
|----------|---------|-----------|
| Groups | list, insert, update, delete | `/groups` |
| GroupItems | list, insert, delete | `/groupItems` |

Scopes for group management: `youtube` (channel owners) or `youtubepartner` (content owners).

Query group data via `reports.query` using a group filter on the `group` dimension.

---

## Auth scopes summary

| Scope | Access |
|-------|--------|
| `yt-analytics.readonly` | Activity metrics (views, likes, watch time) |
| `yt-analytics-monetary.readonly` | Revenue + ad performance |
| `youtube.readonly` | Required for `reports.query` |
| `youtube` | Group CRUD (channel owners) |
| `youtubepartner` | Group CRUD + content-owner reports |

---

## Code sample (Python)

```python
from googleapiclient.discovery import build

analytics = build('youtubeAnalytics', 'v2', credentials=creds)
result = analytics.reports().query(
    ids='channel==MINE',
    startDate='2025-01-01',
    endDate='2025-03-31',
    metrics='views,estimatedMinutesWatched,likes',
    dimensions='day',
    sort='day',
).execute()
```

---

## Links

- [reports.query](https://developers.google.com/youtube/analytics/reference/reports/query)
- [API Reference overview](https://developers.google.com/youtube/analytics/reference)
- [Authorization guide](https://developers.google.com/youtube/analytics/guides/authorization)
