import { registerPlugin } from "./index"

registerPlugin({
  id: "gmail",

  systemPromptSection: `
## Gmail — corsair.gmail.api.*

All calls use JavaScript with \`corsair\` in scope via run_script.

### TOKEN BUDGET RULES (critical)
- For listing or summarising multiple threads/messages: use threads.list / messages.list only — the response includes snippet and basic metadata. DO NOT call threads.get or messages.get in a loop.
- Only call threads.get / messages.get with format: "full" when the user explicitly asks to open/read one specific email.
- For metadata (subject, from, date) on multiple items: use format: "metadata" with metadataHeaders.

---

### threads.list — search & list threads
\`\`\`js
// Unread inbox
const r = await corsair.gmail.api.threads.list({ q: "is:unread", maxResults: 10 });
return r.threads; // each has { id, snippet, historyId }
\`\`\`
\`\`\`js
// Search with Gmail query syntax
const r = await corsair.gmail.api.threads.list({
  q: "from:boss@company.com subject:report after:2024/01/01",
  maxResults: 20,
  labelIds: ["INBOX"]
});
return r.threads;
\`\`\`

### threads.get — read a single thread
\`\`\`js
// Full thread with bodies (only when reading one specific email)
const thread = await corsair.gmail.api.threads.get({ id: "<id>", format: "full" });
return thread; // thread.messages[].payload.parts for body
\`\`\`
\`\`\`js
// Metadata only (subject, from, date) — low token cost
const thread = await corsair.gmail.api.threads.get({
  id: "<id>",
  format: "metadata",
  metadataHeaders: ["Subject", "From", "To", "Date", "Message-ID"]
});
return thread;
\`\`\`

### threads.modify — label operations
\`\`\`js
// Mark as read
await corsair.gmail.api.threads.modify({ id: "<id>", removeLabelIds: ["UNREAD"] });
\`\`\`
\`\`\`js
// Archive (remove from inbox)
await corsair.gmail.api.threads.modify({ id: "<id>", removeLabelIds: ["INBOX"] });
\`\`\`
\`\`\`js
// Star
await corsair.gmail.api.threads.modify({ id: "<id>", addLabelIds: ["STARRED"] });
\`\`\`

### threads.trash / threads.untrash / threads.delete
\`\`\`js
await corsair.gmail.api.threads.trash({ id: "<id>" });
await corsair.gmail.api.threads.untrash({ id: "<id>" });
await corsair.gmail.api.threads.delete({ id: "<id>" }); // permanent
\`\`\`

---

### messages.list — list individual messages
\`\`\`js
const r = await corsair.gmail.api.messages.list({
  q: "is:unread label:INBOX",
  maxResults: 10,
  labelIds: ["INBOX"]
});
return r.messages; // each has { id, threadId }
\`\`\`

### messages.get — read a single message
\`\`\`js
const msg = await corsair.gmail.api.messages.get({ id: "<id>", format: "full" });
return msg;
\`\`\`

### messages.send — send email (base64url RFC 2822)
\`\`\`js
function encodeEmail(lines) {
  return btoa(unescape(encodeURIComponent(lines.join("\\r\\n"))))
    .replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=/g, "");
}
const raw = encodeEmail([
  "From: me",
  "To: recipient@example.com",
  "Subject: Hello",
  "Content-Type: text/plain; charset=utf-8",
  "",
  "Email body here."
]);
return await corsair.gmail.api.messages.send({ raw });
\`\`\`
\`\`\`js
// Reply to an existing thread
function encodeEmail(lines) {
  return btoa(unescape(encodeURIComponent(lines.join("\\r\\n"))))
    .replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=/g, "");
}
// First get thread metadata to find reply headers
const thread = await corsair.gmail.api.threads.get({
  id: "<thread-id>",
  format: "metadata",
  metadataHeaders: ["Subject", "From", "Message-ID"]
});
const last = thread.messages?.[thread.messages.length - 1];
const subject = last?.payload?.headers?.find(h => h.name === "Subject")?.value ?? "";
const msgId = last?.payload?.headers?.find(h => h.name === "Message-ID")?.value ?? "";
const replyTo = last?.payload?.headers?.find(h => h.name === "From")?.value ?? "";
const raw = encodeEmail([
  "From: me",
  \`To: \${replyTo}\`,
  \`Subject: \${subject.startsWith("Re:") ? subject : "Re: " + subject}\`,
  \`In-Reply-To: \${msgId}\`,
  \`References: \${msgId}\`,
  "Content-Type: text/plain; charset=utf-8",
  "",
  "Reply body here."
]);
return await corsair.gmail.api.messages.send({ raw, threadId: thread.id });
\`\`\`

### messages.modify — label a message
\`\`\`js
await corsair.gmail.api.messages.modify({ id: "<id>", addLabelIds: ["STARRED"], removeLabelIds: ["UNREAD"] });
\`\`\`

### messages.batchModify — bulk label change
\`\`\`js
await corsair.gmail.api.messages.batchModify({
  ids: ["<id1>", "<id2>", "<id3>"],
  addLabelIds: ["STARRED"],
  removeLabelIds: ["UNREAD"]
});
\`\`\`

### messages.trash / messages.untrash / messages.delete
\`\`\`js
await corsair.gmail.api.messages.trash({ id: "<id>" });
await corsair.gmail.api.messages.untrash({ id: "<id>" });
await corsair.gmail.api.messages.delete({ id: "<id>" }); // permanent
\`\`\`

---

### labels.list / labels.get / labels.create / labels.update / labels.delete
\`\`\`js
// List all labels
const { labels } = await corsair.gmail.api.labels.list({});
return labels;
\`\`\`
\`\`\`js
// Create a label
const label = await corsair.gmail.api.labels.create({
  label: { name: "Work/Urgent", messageListVisibility: "show", labelListVisibility: "labelShow" }
});
return label;
\`\`\`
\`\`\`js
// Delete a label
await corsair.gmail.api.labels.delete({ id: "<label-id>" });
\`\`\`

Common system label IDs: INBOX, UNREAD, STARRED, SENT, DRAFT, SPAM, TRASH, IMPORTANT, CATEGORY_PERSONAL, CATEGORY_SOCIAL, CATEGORY_PROMOTIONS

---

### drafts.list / drafts.get / drafts.create / drafts.update / drafts.send / drafts.delete
\`\`\`js
// List drafts
const { drafts } = await corsair.gmail.api.drafts.list({ maxResults: 10 });
return drafts;
\`\`\`
\`\`\`js
// Create a draft
function encodeEmail(lines) {
  return btoa(unescape(encodeURIComponent(lines.join("\\r\\n"))))
    .replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=/g, "");
}
const draft = await corsair.gmail.api.drafts.create({
  draft: {
    message: {
      raw: encodeEmail([
        "From: me",
        "To: someone@example.com",
        "Subject: Draft subject",
        "Content-Type: text/plain; charset=utf-8",
        "",
        "Draft body."
      ])
    }
  }
});
return draft;
\`\`\`
\`\`\`js
// Send an existing draft
return await corsair.gmail.api.drafts.send({ id: "<draft-id>" });
\`\`\`

---

Gmail search query syntax for the \`q\` parameter:
- is:unread / is:read / is:starred / is:important
- from:email@example.com / to:email@example.com
- subject:keyword
- after:YYYY/MM/DD / before:YYYY/MM/DD / newer_than:7d / older_than:30d
- label:INBOX / label:custom-label
- has:attachment
- filename:pdf
- Combine: "from:boss is:unread after:2024/01/01"
`,

  labelForScript: (code) => {
    if (/threads\.list/.test(code)) return "Searching Gmail inbox"
    if (/threads\.get/.test(code)) return "Reading email thread"
    if (/messages\.send|drafts\.send/.test(code)) return "Sending email"
    if (/messages\.batchModify/.test(code)) return "Bulk updating emails"
    if (/messages\.modify|threads\.modify/.test(code)) return "Updating email"
    if (/threads\.trash|messages\.trash/.test(code)) return "Moving to trash"
    if (/threads\.delete|messages\.delete/.test(code)) return "Deleting email"
    if (/threads\.untrash|messages\.untrash/.test(code)) return "Restoring email"
    if (/labels\.create|labels\.update|labels\.delete/.test(code)) return "Managing labels"
    if (/labels\.list/.test(code)) return "Listing labels"
    if (/drafts\.create|drafts\.update/.test(code)) return "Saving draft"
    if (/drafts\.list/.test(code)) return "Listing drafts"
    if (/messages\.list/.test(code)) return "Searching messages"
    if (/gmail\.api/.test(code)) return "Accessing Gmail"
    return null
  },
})
