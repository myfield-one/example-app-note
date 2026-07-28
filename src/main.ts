import "./style.css";
import { createInstance, type Bucket, type BucketState } from "@myfield/sdk";
import { createNoteRepository, isNoteObjectId, liveNoteEntries, type NoteIndex, type NoteIndexEntry } from "./notes";

const MYFIELD_AUTH_URL = String(import.meta.env.MYFIELD_AUTH_URL || "").trim() || undefined;
const BUCKET_ID = "example-app-note.myfield.one";
const LOCAL_SAVE_DEBOUNCE_MS = 250;
const ACTIVE_SYNC_THROTTLE_MS = 1000;

type SyncUiState = "local" | "connecting" | "connected" | "error";

const editorEl = requireElement("editor") as HTMLTextAreaElement;
const noteListEl = requireElement("noteList");
const noteTitleEl = requireElement("noteTitle");
const newNoteButton = requireElement("newNoteButton") as HTMLButtonElement;
const deleteNoteButton = requireElement("deleteNoteButton") as HTMLButtonElement;
const connectButton = requireElement("connectButton") as HTMLButtonElement;
const connectButtonLabel = requireElement("connectButtonLabel");
const localErrorEl = requireElement("localError");

const instance = createInstance({ namespace: "default" });
const bucket: Bucket = instance.createBucket({ id: BUCKET_ID });
const notes = createNoteRepository(bucket, deriveTitle);

let noteIndex: NoteIndex = [];
let openNoteId = "";
let openNoteIsDraft = true;
let loaded = false;
let applyingBucketValue = false;
let lastSavedMarkdown = "";
let saveTimer: number | null = null;
let localSaving = false;
let localSavePending = false;
let syncConnected = false;
let syncUiState: SyncUiState = "local";
let activeSyncInFlight: Promise<void> | null = null;
let lastActiveSyncAt = 0;

bucket.on("state", handleBucketState);
bucket.on("change", (objectId) => {
  if (!loaded) return;
  void handleBucketChange(objectId);
});

newNoteButton.addEventListener("click", () => {
  openDraftNote();
  renderNoteList();
});

deleteNoteButton.addEventListener("click", () => {
  void deleteOpenNote();
});

connectButton.addEventListener("click", () => {
  if (syncUiState === "connecting") return;
  if (syncConnected) void disconnectSync();
  else void connectSync();
});

editorEl.addEventListener("input", () => {
  updateOpenNoteTitle();
  if (!loaded || applyingBucketValue) return;
  scheduleSave();
});

window.addEventListener("focus", () => {
  syncWhenPageBecomesActive();
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && bucket.state === "connected") {
    syncWhenPageBecomesActive();
  }
});

void boot();

async function boot(): Promise<void> {
  setSyncState("local");
  setLocalError(null);
  try {
    await bucket.resume();
  } catch (error) {
    setSyncState("local", formatError(error));
  }
  await refreshNotes();
  const initialNoteId = newestNoteId();
  if (initialNoteId) await openNote(initialNoteId);
  else openDraftNote();
  renderNoteList();
}

async function refreshNotes(): Promise<void> {
  noteIndex = await notes.list();
  renderNoteList();
}

function newestNoteId(): string | null {
  const live = liveNotes();
  const newest = live.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0];
  return newest?.noteId || null;
}

function liveNotes(): NoteIndex {
  return liveNoteEntries(noteIndex);
}

function openDraftNote(): void {
  clearSaveTimer();
  openNoteId = createNoteId();
  openNoteIsDraft = true;
  setEditorValue("");
  lastSavedMarkdown = "";
  loaded = true;
  editorEl.disabled = false;
  setLocalError(null);
  updateOpenNoteTitle();
}

async function openNote(noteId: string): Promise<void> {
  clearSaveTimer();
  loaded = false;
  openNoteId = noteId;
  openNoteIsDraft = false;
  setEditorValue(await notes.readMarkdown(noteId));
  lastSavedMarkdown = editorEl.value;
  loaded = true;
  editorEl.disabled = false;
  setLocalError(null);
  updateOpenNoteTitle();
  renderNoteList();
}

async function deleteOpenNote(): Promise<void> {
  if (openNoteIsDraft) {
    openDraftNote();
    return;
  }
  await notes.deleteNote(openNoteId);
  await refreshNotes();
  const nextNoteId = newestNoteId();
  if (nextNoteId) await openNote(nextNoteId);
  else openDraftNote();
}

function renderNoteList(): void {
  const live = liveNotes().sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  noteListEl.innerHTML = "";
  if (live.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty-list";
    empty.textContent = "No notes yet.";
    noteListEl.append(empty);
    deleteNoteButton.disabled = true;
    return;
  }
  for (const entry of live) {
    const item = document.createElement("li");
    item.className = "note-list-item";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "note-list-item-button";
    button.dataset.noteId = entry.noteId;
    button.dataset.active = entry.noteId === openNoteId ? "true" : "false";
    button.addEventListener("click", () => {
      void openNote(entry.noteId);
    });

    const title = document.createElement("span");
    title.className = "note-list-item-title";
    title.textContent = titleFor(entry);
    button.append(title);
    item.append(button);
    noteListEl.append(item);
  }
  deleteNoteButton.disabled = openNoteIsDraft;
}

function titleFor(entry: NoteIndexEntry): string {
  if (entry.noteId === openNoteId) {
    const currentTitle = deriveTitle(editorEl.value);
    if (currentTitle) return currentTitle;
  }
  return entry.title || "Untitled";
}

function updateOpenNoteTitle(): void {
  noteTitleEl.textContent = deriveTitle(editorEl.value) || "Untitled";
  deleteNoteButton.disabled = openNoteIsDraft;
}

function deriveTitle(markdownText: string): string {
  for (const rawLine of markdownText.split(/\r?\n/)) {
    const line = rawLine.trim().replace(/^#{1,6}\s*/, "").trim();
    if (line) return line.slice(0, 120);
  }
  return "";
}

function scheduleSave(): void {
  if (saveTimer != null) window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    void saveOpenNote();
  }, LOCAL_SAVE_DEBOUNCE_MS);
}

async function saveOpenNote(): Promise<void> {
  clearSaveTimer();
  if (localSaving) {
    localSavePending = true;
    return;
  }
  if (editorEl.value === lastSavedMarkdown) return;

  localSaving = true;
  try {
    await notes.saveMarkdown(openNoteId, editorEl.value);
    openNoteIsDraft = false;
    lastSavedMarkdown = editorEl.value;
    setLocalError(null);
    await refreshNotes();
    updateOpenNoteTitle();
  } catch (error) {
    setLocalError(`Local save failed: ${formatError(error)}`);
  } finally {
    localSaving = false;
    if (localSavePending && editorEl.value !== lastSavedMarkdown) {
      localSavePending = false;
      scheduleSave();
    } else {
      localSavePending = false;
    }
  }
}

async function connectSync(): Promise<void> {
  setSyncState("connecting");
  try {
    await bucket.connect(MYFIELD_AUTH_URL ? { authBase: MYFIELD_AUTH_URL } : undefined);
  } catch (error) {
    setSyncState("error", formatError(error));
  }
}

async function disconnectSync(): Promise<void> {
  await bucket.disconnect();
}

function syncWhenPageBecomesActive(): void {
  if (bucket.state !== "connected") return;
  const now = Date.now();
  if (activeSyncInFlight || now - lastActiveSyncAt < ACTIVE_SYNC_THROTTLE_MS) return;
  lastActiveSyncAt = now;
  activeSyncInFlight = bucket.sync().finally(() => {
    activeSyncInFlight = null;
  });
  void activeSyncInFlight;
}

function handleBucketState(state: BucketState, detail?: string): void {
  if (state === "connected") {
    syncConnected = true;
    setSyncState("connected");
    return;
  }
  if (state === "connecting") {
    setSyncState("connecting", detail);
    return;
  }
  syncConnected = false;
  setSyncState("local", detail);
}

async function handleBucketChange(objectId: string): Promise<void> {
  if (isNoteObjectId(objectId)) {
    await notes.refreshTitle(objectId);
    if (objectId === openNoteId) await refreshOpenNote();
  }
  await refreshNotes();
}

async function refreshOpenNote(): Promise<void> {
  if (openNoteIsDraft) return;
  if (editorEl.value !== lastSavedMarkdown) {
    scheduleSave();
    return;
  }
  const markdownText = await notes.readMarkdown(openNoteId);
  if (markdownText === editorEl.value) return;
  setEditorValue(markdownText);
  lastSavedMarkdown = markdownText;
  updateOpenNoteTitle();
}

function setEditorValue(markdownText: string): void {
  applyingBucketValue = true;
  editorEl.value = markdownText;
  applyingBucketValue = false;
}

function setSyncState(state: SyncUiState, label?: string): void {
  syncUiState = state;
  const title = label || syncStateLabel(state);
  connectButton.dataset.state = state;
  connectButton.disabled = state === "connecting";
  connectButtonLabel.textContent = syncActionLabel(state);
  connectButton.setAttribute("title", title);
  connectButton.setAttribute("aria-label", title);
}

function syncStateLabel(state: SyncUiState): string {
  if (state === "connecting") return "Connecting to sync";
  if (state === "connected") return "Synced up to date";
  if (state === "error") return "Unable to sync";
  return "Local mode";
}

function syncActionLabel(state: SyncUiState): string {
  if (state === "connected") return "Disconnect";
  if (state === "connecting") return "Connecting";
  return "Connect";
}

function setLocalError(message: string | null): void {
  localErrorEl.textContent = message || "";
  localErrorEl.hidden = !message;
}

function clearSaveTimer(): void {
  if (saveTimer == null) return;
  window.clearTimeout(saveTimer);
  saveTimer = null;
}

function createNoteId(): string {
  return `note:${globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function requireElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`page shell missing #${id}`);
  return element;
}
