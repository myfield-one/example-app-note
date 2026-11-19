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

- Create an instance with appId `example-app-note.myfield.one` and obtain its
  Local bucket through `instance.getBucket()`.
- Read and write note objects locally before the user connects an account.
- Read local notes first, then restore access with `instance.resume()` in the
  background. Use `instance.connect()` from a user action.
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

`npm run build` builds the current app at `/` and adds historical releases from
`releases.json` at `/vVERSION/`. The list records versions and commits newest first;
each commit must match its `vVERSION` Git tag. Add releases after creating their tags.

`npm run preview` serves `dist/`; `npm run dev` runs the current app as before.
Versions on the same origin share local data. Use separate profiles or origins
for independent data.

## Core SDK Usage

```ts
import { createInstance } from "@myfield/sdk";

const instance = createInstance({
  appId: "example-app-note.myfield.one",
  namespace: "default",
});
const bucket = instance.getBucket();

await bucket.update("note:1", { markdown: "# Hello" });
const note = await bucket.get("note:1");
const notes = await bucket.list({ prefix: "note:" });

void instance.resume().catch(console.error);
await instance.connect(); // Call from the Connect button.
```

Local reads and writes work without a network connection or Myfield account.
Connecting only adds encrypted multi-device sync.

The existing storage namespace and bucket id are retained. The canonical Note
host keeps its identity scope; other preview hosts may need authorization again.
Set `MYFIELD_AUTH_URL` to use a custom Auth page.

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
