# Myfield Note Example

A small local-first notes app built with `@myfield/sdk`.

This reference demo shows how an external static web app can use a Myfield
bucket for offline-first object storage, end-to-end encrypted sync, and
user-controlled authorization. The app owns the note UI and object model; the
SDK owns local persistence, auth, encryption, merge, object-id blinding, and
sync.

This is not a production notes product or an app framework template. It stays
small so the SDK usage is easy to inspect.

Live demo: <https://example-app-note.myfield.one>

## What It Demonstrates

- Create a local SDK instance with `createInstance()`.
- Create an explicit app-owned bucket with
  `instance.createBucket({ id: "example-app-note.myfield.one" })`.
- Read and write note objects locally before the user connects an account.
- Use `bucket.resume()` on startup and `bucket.connect()` from a user action.
- Use `bucket.list({ prefix: "note:" })` to render a note list from the
  SDK's internal encrypted bucket index.
- Store each note as one object: `note:<uuid>` with fields `{ markdown }`.
- React to SDK change events and re-read merged remote data from local storage.
- Keep the app intentionally small: a note list, a native `<textarea>`, and a
  direct Connect/Disconnect button.

## Run Locally

```sh
npm install
npm run dev
```

## Versioned deployment

`releases.json` lists published versions and full commit IDs, newest first.
`latest` selects the version served at `/`; each listed version also has its
own `/vVERSION/` path. Builds verify that each `vVERSION` Git tag matches the
listed commit, then use that release's source and npm lockfile. Shallow clones
may fetch missing tags.

- `npm run build`: published versions only, ready for static hosting from `dist/`.
- `npm run build:preview`: also adds the working version at `/vVERSION/` if unreleased.
- `npm run preview`: serves the built paths. `npm run dev` serves the working app only.

Add a version to the JSON and update `latest` after its release commit and tag
are established. Until then it is available only in development previews.
All paths on one origin share local data; paths do not isolate browser storage.
Use separate browser profiles or origins for independent test data.

## Core SDK Usage

```ts
import { createInstance } from "@myfield/sdk";

const instance = createInstance({ namespace: "default" });
const bucket = instance.createBucket({ id: "example-app-note.myfield.one" });

await bucket.resume();

await bucket.update("note:1", { markdown: "# Hello" });
const note = await bucket.get("note:1");
const notes = await bucket.list({ prefix: "note:" });

await bucket.connect();
```

Local reads and writes work without a network connection or Myfield account.
Connecting only adds encrypted multi-device sync.

## App Structure

- `src/main.ts` wires the UI, textarea editor, sync state, and SDK lifecycle.
- `src/notes.ts` is the small app-level repository around the bucket API.

The example intentionally keeps the app data model simple: one object per
note, no search, no collaboration UI, no rich conflict UI, and no custom
storage adapter. It also avoids PWA install/update handling, cross-tab
coordination, rich editor controls, and settings panels so SDK usage remains
easy to inspect.

## Verification

```sh
npm run typecheck
npm run test:build
```

## Before Reuse

- Use your own stable bucket id instead of `example-app-note.myfield.one`.
- Add the error handling, export/backup flows, and data model your app needs.
- Keep private plaintext local unless your own product clearly asks the user to
  send it somewhere else.

## License

Apache-2.0.
