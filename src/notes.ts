import type { Bucket } from "@myfield/sdk";

const NOTE_OBJECT_PREFIX = "note:";

export type NoteIndexEntry = {
  noteId: string;
  title: string;
  updatedAt: string;
  deleted: boolean;
};
export type NoteIndex = NoteIndexEntry[];

export function liveNoteEntries(index: NoteIndex): NoteIndex {
  return index.filter((entry) => !entry.deleted);
}

export function isNoteObjectId(objectId: string): boolean {
  return objectId.startsWith(NOTE_OBJECT_PREFIX);
}

export function createNoteRepository(bucket: Bucket, deriveTitle: (markdownText: string) => string) {
  // Titles are derived from note markdown (never stored); this cache keeps
  // list rendering synchronous and avoids re-reading every note on each list.
  const noteTitles = new Map<string, string>();

  async function list(): Promise<NoteIndex> {
    const entries = await bucket.list({ prefix: NOTE_OBJECT_PREFIX });
    const rows: NoteIndex = [];
    for (const entry of entries) {
      if (!entry.deleted && !noteTitles.has(entry.id)) {
        const markdownText = await readMarkdown(entry.id);
        if (markdownText) noteTitles.set(entry.id, deriveTitle(markdownText));
      }
      rows.push({
        noteId: entry.id,
        title: noteTitles.get(entry.id) || "",
        updatedAt: entry.updatedAt,
        deleted: entry.deleted === true,
      });
    }
    const listed = new Set(entries.map((entry) => entry.id));
    for (const id of [...noteTitles.keys()]) {
      if (!listed.has(id)) noteTitles.delete(id);
    }
    return rows;
  }

  async function readMarkdown(noteId: string): Promise<string> {
    const note = await bucket.get(noteId);
    return typeof note?.markdown === "string" ? note.markdown : "";
  }

  async function saveMarkdown(noteId: string, markdownText: string): Promise<void> {
    await bucket.update(noteId, { markdown: markdownText });
    noteTitles.set(noteId, deriveTitle(markdownText));
  }

  async function deleteNote(noteId: string): Promise<void> {
    await bucket.delete(noteId);
    noteTitles.delete(noteId);
  }

  async function refreshTitle(noteId: string): Promise<void> {
    const markdownText = await readMarkdown(noteId);
    if (markdownText) noteTitles.set(noteId, deriveTitle(markdownText));
    else noteTitles.delete(noteId);
  }

  return { deleteNote, list, readMarkdown, refreshTitle, saveMarkdown };
}
