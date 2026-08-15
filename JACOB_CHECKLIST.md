# Jacob UI handoff checklist

Founder-facing follow-up only. Keep P0 behavior source-backed and do not add direct government-form submission.

- [x] Add founder name, role, and email fields; ask only for missing values when they are absent from intake evidence.
- [x] Complete the responsive hierarchy and design pass across intake, verified profile, opportunity map, and application workspace.
- [x] Capture direct URL, soft navigation, and hard reload screenshots at desktop and mobile widths in cached and fresh states; record console and network observations.
- [x] Finish the founder-facing application workspace presentation without inventing unsupported answers.
- [ ] Verify dependency and lockfile state, Cloudflare configuration, secret/model configuration, and deployment with the owner of those areas; never expose secrets.
- [ ] After P0 passes twice, consider OAuth, email, calendar, settings, help, and mascot work.

## Local verification record — August 14, 2026

- Commit `ed0265b` changes only the founder-facing workbench and global presentation styles.
- The Node suite passed 24/24, and ESLint, TypeScript, `git diff --check`, and an isolated Linux production build passed.
- Browser QA covered direct load, soft navigation, hard reload, desktop and mobile layouts, fresh and cached source states, checklist persistence, source-state restoration, console errors, page errors, and the opportunity-search network request.
- Production deployment, production secret/model presence, and the production browser matrix remain unverified.

## Coordination boundaries

- Do not edit backend logic, shared contracts, source adapters, matching, persistence contracts, routes, tests, package files, lockfiles, or Cloudflare configuration without coordinating with Lincoln and the owner of that area.
- Do not add secrets, direct government-form submission, or claims that browser, model, secret, or deployment verification is complete.
