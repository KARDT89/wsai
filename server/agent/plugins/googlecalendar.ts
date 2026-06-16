import { registerPlugin } from "./index"

registerPlugin({
  id: "googlecalendar",

  systemPromptSection: `
## Google Calendar — corsair.googlecalendar.api.*

### events.getMany — list events
\`\`\`js
// Upcoming events (next 7 days)
const r = await corsair.googlecalendar.api.events.getMany({
  timeMin: new Date().toISOString(),
  timeMax: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  singleEvents: true,
  orderBy: "startTime",
  maxResults: 20
});
return r.items; // each item has { id, summary, start, end, description, location, attendees, status }
\`\`\`
\`\`\`js
// Search by keyword
const r = await corsair.googlecalendar.api.events.getMany({
  q: "standup",
  timeMin: new Date().toISOString(),
  timeMax: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  singleEvents: true,
  orderBy: "startTime"
});
return r.items;
\`\`\`

### events.get — get a specific event (requires id from events.getMany)
\`\`\`js
const event = await corsair.googlecalendar.api.events.get({ id: "<event-id>" });
return event;
\`\`\`

### events.create — create an event
\`\`\`js
// Timed event
const event = await corsair.googlecalendar.api.events.create({
  event: {
    summary: "Team standup",
    description: "Daily sync",
    location: "Conference Room A",
    start: { dateTime: "2025-01-15T10:00:00Z", timeZone: "UTC" },
    end:   { dateTime: "2025-01-15T10:30:00Z", timeZone: "UTC" },
    attendees: [{ email: "alice@example.com" }],
    reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 10 }] }
  },
  sendUpdates: "all"
});
return event;
\`\`\`
\`\`\`js
// All-day event (use date not dateTime)
const event = await corsair.googlecalendar.api.events.create({
  event: {
    summary: "Company holiday",
    start: { date: "2025-01-15" },
    end:   { date: "2025-01-16" }  // end date is exclusive
  }
});
return event;
\`\`\`
\`\`\`js
// Recurring event
const event = await corsair.googlecalendar.api.events.create({
  event: {
    summary: "Weekly standup",
    start: { dateTime: "2025-01-15T09:00:00Z", timeZone: "UTC" },
    end:   { dateTime: "2025-01-15T09:15:00Z", timeZone: "UTC" },
    recurrence: ["RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR"]
  }
});
return event;
\`\`\`

### events.update — update an event (requires id from events.getMany)
\`\`\`js
const updated = await corsair.googlecalendar.api.events.update({
  id: "<event-id>",
  event: {
    summary: "New title",
    start: { dateTime: "2025-01-15T11:00:00Z", timeZone: "UTC" },
    end:   { dateTime: "2025-01-15T11:30:00Z", timeZone: "UTC" }
  },
  sendUpdates: "all"
});
return updated;
\`\`\`

### events.delete — delete an event (requires id from events.getMany)
\`\`\`js
// Step 1: find the event
const r = await corsair.googlecalendar.api.events.getMany({
  q: "standup",
  timeMin: new Date().toISOString(),
  timeMax: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  singleEvents: true,
  maxResults: 5
});
// Step 2: delete by id
const target = r.items?.[0];
if (!target?.id) return "Event not found";
await corsair.googlecalendar.api.events.delete({ id: target.id, sendUpdates: "all" });
return \`Deleted: \${target.summary}\`;
\`\`\`

### calendar.getAvailability — free/busy check
\`\`\`js
const avail = await corsair.googlecalendar.api.calendar.getAvailability({
  timeMin: "2025-01-15T09:00:00Z",
  timeMax: "2025-01-15T18:00:00Z",
  items: [{ id: "primary" }]
});
return avail; // avail.calendars["primary"].busy = [{ start, end }]
\`\`\`

---
Event fields: id, summary, description, location, start.dateTime, end.dateTime, attendees[].email, recurrence, colorId, visibility, transparency, reminders, status
sendUpdates: "all" | "externalOnly" | "none"
orderBy: "startTime" (requires singleEvents:true) | "updated"
eventType: "default" | "outOfOffice" | "focusTime" | "workingLocation"
`,

  labelForScript: (code) => {
    if (/events\.getMany/.test(code)) return "Fetching calendar events"
    if (/events\.create/.test(code)) return "Creating calendar event"
    if (/events\.update/.test(code)) return "Updating calendar event"
    if (/events\.delete/.test(code)) return "Deleting calendar event"
    if (/events\.get[^M]/.test(code)) return "Getting event details"
    if (/calendar\.getAvailability/.test(code)) return "Checking availability"
    if (/googlecalendar\.api/.test(code)) return "Accessing Google Calendar"
    return null
  },
})
