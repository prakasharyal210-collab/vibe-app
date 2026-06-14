---
name: Posts table missing columns
description: Columns that do NOT exist in the Supabase posts table — inserting them causes a schema-cache error and silently kills post creation.
---

## Rule

Never include these columns in a `posts` table INSERT:
- `visibility`
- `comments_enabled`
- `downloads_enabled`

The Supabase schema cache will reject the entire INSERT with:
`"Could not find the 'visibility' column of 'posts' in the schema cache"`

## Why

These columns were referenced in `artifacts/api-server/src/routes/posts/create.ts` but were never added to the actual Supabase posts table. The error is silent from the mobile side because `uploadPostMedia` in `db.ts` catches all errors and returns `null`, showing a celebration modal to the user anyway.

## How to apply

- `create.ts` post payload must NOT include `visibility`, `comments_enabled`, or `downloads_enabled`.
- If visibility filtering is needed in the future, add the column to Supabase via dashboard SQL first, then add it to the payload.
- Always smoke-test post creation with `curl -X POST localhost:80/api/posts/create` after any payload changes.
