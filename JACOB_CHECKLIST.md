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
- [x] Create and bind the D1 database as `WORKSPACE_DB`, apply `migrations/0001_workspace.sql`, verify the server-only `OPENAI_API_KEY` binding without reading its value, and verify both through the deployed P0 preview.
- [x] Re-run direct URL, soft navigation, hard reload, cached/fresh, desktop/mobile, network, consent, website/manual/PDF, program-context, external-source confirmation, and durable checklist/contact transitions against the P0 preview.
- [x] Deploy the reviewed merged version to production traffic and repeat the production smoke matrix.
- [ ] Deploy and inject persistent Assistance Listings/SBIR source stores plus a Cloudflare scheduled hook. This is Blocked on architecture/ownership because the current repo has only in-memory stores and no scheduled Worker entry point.
- [ ] After P0 passes twice, consider OAuth, email, calendar, settings, help, and mascot work.

## Local verification record — August 14, 2026

- Commit `ed0265b` changes only the founder-facing workbench and global presentation styles.
- The Node suite passed 24/24, and ESLint, TypeScript, `git diff --check`, and an isolated Linux production build passed.
- Browser QA covered direct load, soft navigation, hard reload, desktop and mobile layouts, fresh and cached source states, checklist persistence, source-state restoration, console errors, page errors, and the opportunity-search network request.
- At this August 14 local checkpoint, production deployment, production secret/model presence, and the production browser matrix remained unverified.

## P0 integration record — August 15, 2026

- Focused tests cover consent/success/fallback/size for manual/PDF intake, supported profile suggestions, the POST/GET/PUT workspace client contract, bearer credentials, D1 prepared-statement behavior, and runtime binding selection.
- Local storage remains the immediate fallback. A 503 disables further durable calls for the session, and a 401 removes invalid local credentials without exposing the access token.
- At this integration checkpoint, D1 resource creation/binding, migration application, Cloudflare/OpenAI secret-name evidence, browser evidence, and deployment verification remained outstanding; the later deployment record below supersedes this status.

## P0 deployment evidence — August 15, 2026

- `WORKSPACE_DB` is bound on Worker preview version `21484ab5-799a-4d44-93fb-b13a5f94610c`; remote D1 returned both `d1_migrations` and `workspaces` successfully.
- Browser D1 proof used the real UI, changed the checklist to 1/6, added three non-sensitive QA contact fields, deleted only the local workspace/contact copy while retaining opaque credentials, hard reloaded, and recovered all four values with `Saved durably` shown.
- Five real browser cases used manual intake, founder review, and `/api/opportunities/search`: healthcare 5, manufacturing 5, water 3, cybersecurity 5, consumer 0 with the honest no-match UI. The first five search requests were 200; their five evidence requests were 200 and workspace creates were 201.
- Grants.gov displayed live counts of 52, 33, 43, and 48 for the four positive cases. Assistance Listings stayed visibly separate as `cached-fallback`, and unsupported historical insight was not substituted.
- The 430px Chrome window completed direct load, soft navigation, and hard reload with document width 430px and no horizontal overflow; desktop ran at 1440px.
- Without consent, intake stayed disabled and sent zero intake requests. Consented non-sensitive website, manual, and PDF requests reported `attempted: true`, `completed: true`, model `gpt-5.6-luna`; the PDF binary remained in-browser and only extracted text was posted. A synthetic fail-closed safety case returned status 200, no provider attempt, and an editable deterministic profile.
- Every official-record action is now a button that opens a five-check confirmation dialog first. Browser proof showed no new tab before confirmation, then a confirmed Grants.gov URL opened successfully; program context was labeled `not open funding` in the dialog.
- The exact final gate passed and passed again after the screenshot-driven dialog-focus fixes: two consecutive 93/93 suites, ESLint, TypeScript, production build, and `git diff --check`.
- PR #5 merged as `a3be94befa6ab2362277050902964d46e6e8d691`; mobile confirmation follow-ups PR #6 and PR #7 merged as `272e7611f9941f03024688e35f9499e40c379e8a` and `65593ee58eba78fff387762befee325ce775ec87`.
- Cloudflare deployment `f9020150-5229-4d07-806d-339eb6905fd6` routes 100% of production traffic to Worker version `079997a8-2adb-48dc-a7fc-2f5bd267deb5` at `https://government-opportunity-map.bigtoken.workers.dev/`.
- Production smoke covered direct load, a five-route manufacturing map, the honest consumer no-match, D1 recovery after removing local workspace/contact state, completed Luna manual metadata, mobile hard reload, and no captured runtime errors.
- At 430px, production document width remained 430px. The source confirmation opened at its heading with all five checks and dialog focus; it opened no tab before confirmation, and `Go back` restored focus to `Open official source`.
- The deployed source-store gap remains explicit: `/api/opportunities/search` does not inject Assistance Listings/SBIR stores, only in-memory implementations exist, and the Worker has no scheduled hook or cron binding.

## Coordination boundaries

- Do not edit backend logic, shared contracts, source adapters, matching, persistence contracts, routes, tests, package files, lockfiles, or Cloudflare configuration without coordinating with Lincoln and the owner of that area.
- Do not add secrets, direct government-form submission, or any browser, model, secret, or deployment verification claim without recorded evidence.
