# Jacob UI handoff checklist

Founder-facing follow-up only. Keep P0 behavior source-backed and do not add direct government-form submission.

- [ ] Add founder name, role, and email fields; ask only for missing values when they are absent from intake evidence.
- [ ] Complete the responsive hierarchy and design pass across intake, verified profile, opportunity map, and application workspace.
- [ ] Capture direct URL, soft navigation, and hard reload screenshots at desktop and mobile widths in cached and fresh states; record console and network observations.
- [ ] Finish the founder-facing application workspace presentation without inventing unsupported answers.
- [ ] Verify dependency and lockfile state, Cloudflare configuration, secret/model configuration, and deployment with the owner of those areas; never expose secrets.
- [ ] After P0 passes twice, consider OAuth, email, calendar, settings, help, and mascot work.

## Coordination boundaries

- Do not edit backend logic, shared contracts, source adapters, matching, persistence contracts, routes, tests, package files, lockfiles, or Cloudflare configuration without coordinating with Lincoln and the owner of that area.
- Do not add secrets, direct government-form submission, or claims that browser, model, secret, or deployment verification is complete.
