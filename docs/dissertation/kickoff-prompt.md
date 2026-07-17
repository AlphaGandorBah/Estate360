# Estate360 Dissertation — Kickoff Prompt & Progress Tracker

Required structure (from supervisor's slide):

- [ ] Abstract
- [ ] Introduction and Background
- [ ] Problem Definition and Scope
- [ ] Literature Review / Methodology
- [ ] Analysis and Design
- [ ] Results and Discussion
- [ ] Summary, Conclusion and Recommendations

Check a box off once that section is drafted and approved by the supervisor.

---

## Prompt to paste into a new Claude conversation

```
I'm writing my undergraduate final-year dissertation on a project called Estate360 — a
property rental platform for Freetown, Sierra Leone. Help me draft it section by section,
in the exact structure my supervisor requires:

1. Abstract
2. Introduction and Background
3. Problem Definition and Scope
4. Literature Review / Methodology
5. Analysis and Design
6. Results and Discussion
7. Summary, Conclusion and Recommendations

PROJECT CONTEXT (use this, don't invent features):
- Problem: Sierra Leone's rental market relies on word-of-mouth and in-person agents.
  Tenants can't verify listings or landlords remotely, travel costs/time are wasted
  viewing properties in person, and there's no trusted channel for tenant-landlord
  communication or fraud prevention.
- Solution: Estate360, a full-stack web platform (Django REST Framework backend,
  React + TypeScript/Vite frontend) with:
  - JWT auth (15-min access token, rotating refresh in httpOnly cookie) with OTP
    email verification and identity verification for listing providers (admin-reviewed)
  - Listings with an admin moderation/approval workflow (draft -> pending -> approved)
  - 360-degree panorama virtual tours per listing (Pillow/piexif processing,
    ClamAV antivirus scanning on upload, Celery async processing)
  - A locally-hosted LLM chatbot (llama-cpp-python, runs on CPU, no external API
    calls or cost) for tenant assistance — chosen deliberately to avoid recurring
    API costs and keep data on-premise, relevant given connectivity/cost constraints
    in the target market
  - A scikit-learn based recommendation engine suggesting listings to users
  - Real-time messaging between tenants and the landlord or agent managing a listing
    via Django Channels/WebSockets
  - Search/filtering by area (Aberdeen, Lumley, Goderich, Hill Station, Wilberforce,
    Murray Town, Brookfields, Kissy, Wellington, Calaba Town), price (SLE/USD),
    bedrooms, property type
- Target users: tenants, landlords, and rental agents in Freetown; admins for
  moderation/verification
- Stack: Django 5, DRF, PostgreSQL, Redis, Celery, Channels/Daphne, boto3 (S3-compatible
  storage), React 19, TypeScript, Vite

MY DISSERTATION LEVEL: Undergraduate final-year project (~10,000-12,000 words total —
confirm with me if you think a section needs more/less)

HOW I WANT TO WORK:
- Go section by section, not all at once. Wait for me to say "next" before moving on.
- For Literature Review, ask me what specific themes my supervisor wants covered
  (e.g. PropTech platforms, trust/verification in online marketplaces, on-device LLM
  deployment, recommender systems) before drafting — don't invent sources; flag every
  claim that needs a citation as [CITATION NEEDED] rather than fabricating one.
- For Analysis and Design, ask me for my actual ERD/architecture diagrams or describe
  the system to me in plain English and I'll correct details — don't assume.
- Match formal academic UK dissertation tone, third person, no contractions.
- After each section, give me a one-line note on what evidence/screenshot/diagram I
  should gather from the actual running app to support it.

Start with the Abstract — draft it, then stop and wait for my feedback.
```

---

## Notes / open items

- Confirm exact word count target and citation style (Harvard/IEEE/APA) with supervisor.
- Literature Review themes to confirm with supervisor before drafting: PropTech platforms,
  trust & verification in online marketplaces, on-device/offline LLM deployment, recommender
  systems for real estate.
- Evidence to collect from the running app as each chapter is drafted: architecture diagram,
  ERD, screenshots of listing moderation flow, panorama upload/AV-scan pipeline, chatbot
  interaction, recommendation output, real-time messaging demo.
