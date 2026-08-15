# Jacob UI handoff checklist

Founder-facing follow-up only. Keep P0 behavior source-backed and do not add direct government-form submission.

- [x] Add founder name, role, and email fields; ask only for missing values when they are absent from intake evidence.
- [x] Complete the responsive hierarchy and design pass across intake, verified profile, opportunity map, and application workspace.
- [x] Capture direct URL, soft navigation, and hard reload screenshots at desktop and mobile widths in cached and fresh states; record console and network observations.
- [x] Finish the founder-facing application workspace presentation without inventing unsupported answers.
- [x] Show the exact OpenAI processing disclosure for website, PDF, and manual intake; require explicit consent before sending `externalProcessingConsent: true`.
- [x] Route manual and extracted/pasted PDF text through the shared evidence endpoint while keeping the 10 MB PDF binary in the browser.
- [x] Render Assistance Listings as a separate program-context section with ALN, agency, objective, official source, retrieval state, and an explicit “not open funding” label.
- [x] Add the prepared-statement D1 workspace adapter, migration, runtime binding detection, tested client contract, local fallback, opaque credential restoration, and truthful save mode.
- [ ] Create and bind the production D1 database as `WORKSPACE_DB`, apply `migrations/0001_workspace.sql`, configure the server-only OpenAI secret, and verify deployment; no database ID or secret is committed.
- [ ] Re-run direct URL, soft navigation, hard reload, cached/fresh, desktop/mobile, console/network, consent, manual/PDF fallback, program-context, and durable checklist transitions for this integration.
- [ ] After P0 passes twice, consider OAuth, email, calendar, settings, help, and mascot work.

## Local verification record — August 14, 2026

- Commit `ed0265b` changes only the founder-facing workbench and global presentation styles.
- The Node suite passed 24/24, and ESLint, TypeScript, `git diff --check`, and an isolated Linux production build passed.
- Browser QA covered direct load, soft navigation, hard reload, desktop and mobile layouts, fresh and cached source states, checklist persistence, source-state restoration, console errors, page errors, and the opportunity-search network request.
- Production deployment, production secret/model presence, and the production browser matrix remain unverified.

## P0 integration record — August 15, 2026

- Focused tests cover consent/success/fallback/size for manual/PDF intake, supported profile suggestions, the POST/GET/PUT workspace client contract, bearer credentials, D1 prepared-statement behavior, and runtime binding selection.
- Local storage remains the immediate fallback. A 503 disables further durable calls for the session, and a 401 removes invalid local credentials without exposing the access token.
- D1 resource creation/binding, migration application, the Cloudflare/OpenAI secrets, browser evidence, and deployment verification remain outstanding.

## Coordination boundaries

- Do not edit backend logic, shared contracts, source adapters, matching, persistence contracts, routes, tests, package files, lockfiles, or Cloudflare configuration without coordinating with Lincoln and the owner of that area.
- Do not add secrets, direct government-form submission, or claims that browser, model, secret, or deployment verification is complete.
