# YouTube Data API v3 — Reference

Base: `https://www.googleapis.com/youtube/v3`

## videos.list

`GET /videos` — **1 quota unit**

### Required

| Param | Description |
|-------|-------------|
| `part` | Comma-separated resource parts to return |

### Filter (exactly one)

| Param | Description |
|-------|-------------|
| `id` | Comma-separated video IDs (up to 50) |
| `chart` | `mostPopular` — trending for region/category |
| `myRating` | `like` or `dislike` (OAuth required) |

### Optional

| Param | Description |
|-------|-------------|
| `maxResults` | 1–50 (default 5); only with `myRating` |
| `pageToken` | Pagination; only with `myRating` |
| `regionCode` | ISO country code; only with `chart` |
| `videoCategoryId` | Category filter; only with `chart` (default `0`) |
| `hl` | Localization language code |
| `maxHeight` / `maxWidth` | Embed player dimensions (72–8192) |
| `onBehalfOfContentOwner` | CMS content-owner proxy (partners only) |

### part values

| Part | Key fields |
|------|------------|
| `snippet` | `title`, `description`, `tags`, `channelId`, `publishedAt`, `thumbnails`, `categoryId` |
| `contentDetails` | `duration`, `dimension`, `definition`, `caption`, `licensedContent` |
| `statistics` | `viewCount`, `likeCount`, `dislikeCount`, `favoriteCount`, `commentCount` |
| `status` | `privacyStatus`, `uploadStatus`, `license`, `embeddable`, `madeForKids` |
| `player` | `embedHtml` |
| `liveStreamingDetails` | `actualStartTime`, `concurrentViewers`, `activeLiveChatId` |
| `topicDetails` | `topicCategories` (Wikipedia URLs) |
| `recordingDetails` | `recordingDate`, `location` |
| `localizations` | Translated title/description map |
| `id` | Video ID only |
| `fileDetails` | Owner only — file name, size, codecs |
| `processingDetails` | Owner only — upload processing state |
| `suggestions` | Owner only — tag/playlist suggestions |

### Response shape

```json
{
  "kind": "youtube#videoListResponse",
  "pageInfo": { "totalResults": 1, "resultsPerPage": 1 },
  "items": [{ "id": "...", "snippet": {}, "statistics": {} }]
}
```

### Errors

| HTTP | Detail | Cause |
|------|--------|-------|
| 400 | `videoChartNotFound` | Chart unavailable for region |
| 403 | `forbidden` | Owner-only part or missing `myRating` auth |
| 404 | `videoNotFound` | Invalid video ID |

---

## Related high-value endpoints

### search.list — 100 units

`GET /search?part=snippet&type=video&q=QUERY&maxResults=25`

Filter by `channelId`, `publishedAfter`, `videoDuration`, `order` (`date`, `rating`, `relevance`, `viewCount`).

### channels.list — 1 unit

`GET /channels?part=snippet,statistics&id=CHANNEL_ID`

Or `forUsername=NAME` / `mine=true` (OAuth).

### playlistItems.list — 1 unit

`GET /playlistItems?part=snippet&playlistId=PLAYLIST_ID&maxResults=50`

Page with `pageToken`. Uploads playlist ID = channel's `contentDetails.relatedPlaylists.uploads`.

### videos.insert — 1,600 units

`POST /videos?part=snippet,status` — multipart upload (OAuth `youtube` or `youtube.upload` scope).

### commentThreads.list — 1 unit

`GET /commentThreads?part=snippet&videoId=VIDEO_ID`

---

## Standard query parameters

All Data API methods accept: `key` (API key), `access_token` (OAuth), `fields` (partial response), `prettyPrint`.

## Duration parsing

`contentDetails.duration` is ISO 8601: `PT1H2M3S` = 1h 2m 3s. Parse with a duration library or regex — do not treat as seconds.

## ID formats

- Video ID: 11 characters (e.g. `dQw4w9WgXcQ`)
- Channel ID: starts with `UC` (24 chars)
- Playlist ID: starts with `PL`, `UU`, `FL`, etc.

## Links

- [videos.list](https://developers.google.com/youtube/v3/docs/videos/list)
- [API reference index](https://developers.google.com/youtube/v3/docs)
- [Quota calculator](https://developers.google.com/youtube/v3/determine_quota_cost)
