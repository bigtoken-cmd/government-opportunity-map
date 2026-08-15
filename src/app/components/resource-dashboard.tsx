"use client";

import { useMemo, useState } from "react";
import type {
  CompanyProfile,
  RankedOpportunityCard,
} from "./opportunity-workbench";
import {
  ContextCard,
  SignalMeter,
  TaskRows,
  type TaskRowItem,
} from "./product-primitives";

type DashboardTab = "opportunities" | "next-steps" | "profile";
type SortMode = "relevance" | "amount" | "deadline";

const decisionLabels: Record<RankedOpportunityCard["decision"], string> = {
  "Pursue now": "Pursue",
  "Verify first": "Verify one thing",
  "Partner-dependent": "Needs a partner",
  Watch: "Watch",
  Skip: "Skip",
};

const applicationTasks: ReadonlyArray<TaskRowItem> = [
  { id: "registrations", label: "Confirm SAM.gov registration and UEI", detail: "Required before many federal submissions." },
  { id: "eligibility", label: "Verify applicant type and eligibility", detail: "Check ownership, location, size, and notice-specific rules." },
  { id: "notice", label: "Read the current official notice", detail: "Confirm that the exact record is current and accepting applications." },
  { id: "scope", label: "Draft the project scope", detail: "Tie the company’s work to the public-purpose problem in the notice." },
  { id: "budget", label: "Build the allowed-cost budget", detail: "Include only costs permitted by the selected notice." },
  { id: "package", label: "Gather the official application package", detail: "Leave unsupported answers blank until the founder supplies them." },
];

function signalLevel(score: number) {
  if (score >= 75) return 3;
  if (score >= 55) return 2;
  return 1;
}

function signalTone(decision: RankedOpportunityCard["decision"]): "blue" | "green" | "amber" | "violet" {
  if (decision === "Pursue now") return "green";
  if (decision === "Verify first") return "amber";
  if (decision === "Partner-dependent") return "violet";
  return "blue";
}

function amountValue(value: string) {
  const amounts = value.match(/[\d,]+/g)?.map((item) => Number(item.replaceAll(",", ""))) ?? [];
  return amounts.length ? Math.max(...amounts) : null;
}

function deadlineValue(value: string) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function FootstepsIcon() {
  return (
    <span aria-hidden="true" className="footsteps-icon">
      <span />
      <span />
    </span>
  );
}

function Chevron({ expanded }: { expanded: boolean }) {
  return <span aria-hidden="true" className={`chevron ${expanded ? "chevron-open" : ""}`}>⌄</span>;
}

function SourceButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="quiet-link">
      Open official source
    </button>
  );
}

export default function ResourceDashboard({
  matches,
  profile,
  savedOpportunityIds,
  checklistByOpportunity,
  sourceMessage,
  onSavedChange,
  onChecklistChange,
  onEditProfile,
  onOpenWorkspace,
  onOpenSource,
}: {
  matches: RankedOpportunityCard[];
  profile: CompanyProfile;
  savedOpportunityIds: string[];
  checklistByOpportunity: Record<string, Record<string, boolean>>;
  sourceMessage: string;
  onSavedChange: (ids: string[]) => void;
  onChecklistChange: (opportunityId: string, itemId: string, checked: boolean) => void;
  onEditProfile: () => void;
  onOpenWorkspace: (opportunity: RankedOpportunityCard) => void;
  onOpenSource: (opportunity: RankedOpportunityCard) => void;
}) {
  const [tab, setTab] = useState<DashboardTab>("opportunities");
  const [sortMode, setSortMode] = useState<SortMode>("relevance");
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const [visibleCount, setVisibleCount] = useState(5);

  const sortedMatches = useMemo(() => {
    const ranked = [...matches];
    if (sortMode === "amount") {
      ranked.sort((left, right) => {
        const leftAmount = amountValue(left.amount);
        const rightAmount = amountValue(right.amount);
        if (leftAmount === null) return rightAmount === null ? right.score - left.score : 1;
        if (rightAmount === null) return -1;
        return rightAmount - leftAmount || right.score - left.score;
      });
    } else if (sortMode === "deadline") {
      ranked.sort((left, right) => {
        const leftDeadline = deadlineValue(left.deadline);
        const rightDeadline = deadlineValue(right.deadline);
        if (leftDeadline === null) return rightDeadline === null ? right.score - left.score : 1;
        if (rightDeadline === null) return -1;
        return leftDeadline - rightDeadline || right.score - left.score;
      });
    } else {
      ranked.sort((left, right) => right.score - left.score);
    }
    return ranked;
  }, [matches, sortMode]);

  const visibleMatches = sortedMatches.slice(0, Math.min(visibleCount, 20));
  const savedMatches = savedOpportunityIds
    .map((id) => matches.find((match) => match.id === id))
    .filter((match): match is RankedOpportunityCard => Boolean(match));

  function toggleSaved(id: string) {
    onSavedChange(
      savedOpportunityIds.includes(id)
        ? savedOpportunityIds.filter((savedId) => savedId !== id)
        : [...savedOpportunityIds, id],
    );
  }

  function toggleExpanded(id: string) {
    setExpandedIds((current) =>
      current.includes(id)
        ? current.filter((expandedId) => expandedId !== id)
        : [...current, id],
    );
  }

  return (
    <section className="dashboard-shell pt-8 sm:pt-10">
      <div className="dashboard-heading">
        <div>
          <h1>{matches.length ? "Your strongest government opportunities" : "No strong match yet"}</h1>
          <p>
            {matches.length
              ? `${matches.length} defensible route${matches.length === 1 ? "" : "s"}, ranked for your confirmed profile.`
              : "The current records did not clear the relevance and eligibility gates for this profile."}
          </p>
        </div>
        {tab !== "profile" && (
          <button type="button" onClick={onEditProfile} className="secondary-button">
            Edit profile
          </button>
        )}
      </div>

      <nav className="dashboard-tabs" aria-label="Resource finder">
        <button type="button" aria-current={tab === "opportunities" ? "page" : undefined} onClick={() => setTab("opportunities")}>
          Opportunities
        </button>
        <button type="button" aria-current={tab === "next-steps" ? "page" : undefined} onClick={() => setTab("next-steps")}>
          <FootstepsIcon /> Next Steps{savedOpportunityIds.length ? ` (${savedOpportunityIds.length})` : ""}
        </button>
        <button type="button" aria-current={tab === "profile" ? "page" : undefined} onClick={() => setTab("profile")}>
          Profile
        </button>
      </nav>

      {tab === "opportunities" && (
        <div className="dashboard-panel">
          {matches.length ? (
            <>
              <div className="results-toolbar">
                <p aria-live="polite">Showing {visibleMatches.length} of {Math.min(matches.length, 20)}</p>
                <label>
                  <span>Sort by</span>
                  <select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}>
                    <option value="relevance">Highest relevance</option>
                    <option value="amount">Highest amount</option>
                    <option value="deadline">Nearest deadline</option>
                  </select>
                </label>
              </div>

              <div className="opportunity-list">
                {visibleMatches.map((opportunity, index) => {
                  const expanded = expandedIds.includes(opportunity.id);
                  const saved = savedOpportunityIds.includes(opportunity.id);
                  return (
                    <article key={opportunity.id} className="opportunity-card">
                      <div className="opportunity-card-main">
                        <div className="opportunity-rank" aria-label={`Rank ${index + 1}`}>{index + 1}</div>
                        <div className="opportunity-copy">
                          <div className="opportunity-status-row">
                            <span className={`decision-label decision-${opportunity.decision.toLowerCase().replaceAll(" ", "-")}`}>
                              {decisionLabels[opportunity.decision]}
                            </span>
                            <span>{opportunity.sourceKind}</span>
                          </div>
                          <p className="opportunity-agency">{opportunity.agency}</p>
                          <h2>{opportunity.title}</h2>
                          <dl className="opportunity-facts">
                            <div><dt>Possible amount</dt><dd>{opportunity.amount}</dd></div>
                            <div><dt>Deadline</dt><dd>{opportunity.deadline}</dd></div>
                            <div><dt>Relevance</dt><dd>{opportunity.fitTier}</dd></div>
                          </dl>
                          <p className="card-next-action"><strong>Next step:</strong> {opportunity.nextAction}</p>
                        </div>
                      </div>

                      {expanded && (
                        <div className="opportunity-details">
                          <div className="opportunity-context-grid">
                            <ContextCard title="Why it matches" meta={`${Math.min(opportunity.reasons.length, 3)} signals`}>
                            <ul>{opportunity.reasons.slice(0, 3).map((reason) => <li key={reason}>{reason}</li>)}</ul>
                            </ContextCard>
                            <ContextCard title="Verify before applying" meta={`${Math.min(opportunity.concerns.length, 3)} checks`}>
                            <ul>{opportunity.concerns.slice(0, 3).map((concern) => <li key={concern}>{concern}</li>)}</ul>
                            </ContextCard>
                            <ContextCard
                              title="Recommended next action"
                              meta="Founder action"
                              wide
                              footer={(
                                <>
                                  <span>{opportunity.sourceLabel} · Retrieved {opportunity.retrievedAt}</span>
                                  <SourceButton onClick={() => onOpenSource(opportunity)} />
                                </>
                              )}
                            >
                              <p>{opportunity.nextAction}</p>
                            </ContextCard>
                          </div>
                        </div>
                      )}

                      <div className="recommendation-footer">
                        <span className="recommendation-signal">
                          <SignalMeter level={signalLevel(opportunity.score)} tone={signalTone(opportunity.decision)} />
                          <span><strong>{opportunity.score}/100</strong> evidence · {opportunity.fitTier}</span>
                        </span>
                        <span className="recommendation-actions">
                          <button type="button" onClick={() => toggleSaved(opportunity.id)} className={saved ? "saved-button" : "save-button"}>
                            {saved ? "Saved" : "Save to my list"}
                          </button>
                          <button type="button" aria-expanded={expanded} onClick={() => toggleExpanded(opportunity.id)} className="expand-button">
                            {expanded ? "Show less" : "View evidence"} <Chevron expanded={expanded} />
                          </button>
                        </span>
                      </div>
                    </article>
                  );
                })}
              </div>

              {matches.length > visibleMatches.length && visibleCount < 20 && (
                <button type="button" className="show-more-button" onClick={() => setVisibleCount((count) => Math.min(count + 15, 20))}>
                  Show {Math.min(matches.length, 20) - visibleMatches.length} more
                </button>
              )}
              <p className="source-note">{sourceMessage}</p>
            </>
          ) : (
            <div className="no-match-state">
              <h2>Do not force a grant-shaped answer.</h2>
              <p>Try adding the exact government problem, R&amp;D project, applicant type, or partner you can work with. Weak matches are intentionally left out.</p>
              <button type="button" onClick={onEditProfile} className="primary-button">Improve my profile</button>
            </div>
          )}
        </div>
      )}

      {tab === "next-steps" && (
        <div className="dashboard-panel">
          {savedMatches.length === 0 ? (
            <div className="next-steps-empty">
              <FootstepsIcon />
              <h2>Save an opportunity to track next steps.</h2>
              <button type="button" onClick={() => setTab("opportunities")} className="primary-button">View opportunities</button>
            </div>
          ) : (
            <div className="next-steps-layout">
              <div className="next-steps-heading">
                <h2>Your next steps</h2>
                <p>Work through the most relevant saved route first; deadlines stay visible.</p>
              </div>
              {savedMatches.map((opportunity) => {
                const checks = checklistByOpportunity[opportunity.id] ?? {};
                const completed = applicationTasks.filter((item) => checks[item.id]).length;
                return (
                  <article key={opportunity.id} className="saved-opportunity">
                    <header>
                      <div>
                        <span>{completed} of {applicationTasks.length} complete · {opportunity.deadline}</span>
                        <h3>{opportunity.title}</h3>
                      </div>
                      <button type="button" onClick={() => onOpenWorkspace(opportunity)} className="secondary-button">Open workspace</button>
                    </header>
                    <TaskRows
                      items={applicationTasks}
                      checked={checks}
                      onChange={(itemId, checked) => onChecklistChange(opportunity.id, itemId, checked)}
                    />
                    <p className="document-note"><strong>Documents:</strong> Check official package. Notice-specific requirements have not been extracted yet.</p>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === "profile" && (
        <div className="dashboard-panel profile-panel">
          <div className="profile-panel-heading">
            <div><h2>Confirmed profile</h2><p>Edit any value before running a new search.</p></div>
            <button type="button" onClick={onEditProfile} className="primary-button">Edit profile</button>
          </div>
          <dl>
            {([
              ["Company", profile.companyName],
              ["Website", profile.website],
              ["What you do", profile.description],
              ["Industry", profile.industry],
              ["Technology", profile.technology],
              ["Location", profile.location],
              ["Applicant type", profile.applicantType],
              ["Ownership", profile.ownership],
            ] as const).map(([label, value]) => (
              <div key={label}><dt>{label}</dt><dd>{value || "Still unknown"}</dd></div>
            ))}
          </dl>
        </div>
      )}
    </section>
  );
}
