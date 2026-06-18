# WSAI 1-Minute YC-Style Video Script

Email and calendar are where work actually happens, but Gmail and Google Calendar are generic tools built for everyone.

WSAI is an AI workspace that makes email and scheduling feel custom to how you work.

Here is the inbox. Messages sync from Gmail into a fast local cache, so I can search, open threads, reply, forward, archive, and compose without fighting the usual Gmail layout.

Here is the calendar. I can move through my week, search events, and create meetings that send real Google Calendar invites.

The biggest unlock is the agent. I can say, “Schedule a meeting with Alex next Thursday at 9 AM, and email him that I’m looking forward to it.” WSAI can draft the email, create the event, and ask for approval before anything risky goes out.

Under the hood, everything runs through Corsair: OAuth, Gmail, Calendar, local sync, webhooks, and MCP tools for the agent. New emails and calendar changes hit one webhook endpoint, update the cache, and trigger durable sync jobs through Inngest.

Superhuman proved people will pay for a faster inbox. WSAI is the next step: an AI workspace that understands communication and scheduling together, then helps you act on it.

The vision is simple: your workspace should adapt to how you work, not the other way around.
