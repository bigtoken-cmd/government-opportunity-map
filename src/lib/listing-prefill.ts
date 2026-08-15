import type {
  ListingPrefillField,
} from "./opportunity-discovery";
import type { CompanyProfile } from "./opportunity-types";
import type { CurrentOpportunityRecord } from "./sources/source-contracts";

function money(value: number | undefined) {
  if (value === undefined) return "";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function listingPrefillFields(
  record: CurrentOpportunityRecord,
  company: CompanyProfile,
  howToApply = "",
): ListingPrefillField[] {
  const sourceUrl = record.source.sourceUrl;
  const rows: ListingPrefillField[] = [
    {
      label: "Official opportunity number",
      value: record.opportunityNumber,
      note: "From the official Grants.gov notice.",
      sourceUrl,
    },
    {
      label: "Applicant types named in the notice",
      value: (record.eligibleApplicantTypes ?? []).join("; "),
      note: record.eligibleApplicantTypes?.length
        ? "Copied from official applicant-type metadata."
        : "Leave blank until the official notice states applicant types.",
      sourceUrl,
    },
    {
      label: "Award ceiling",
      value: money(record.awardCeiling),
      note: record.awardCeiling
        ? "Official award ceiling. Confirm the current package before using it as a requested amount."
        : "No official award ceiling was stated.",
      sourceUrl,
    },
    {
      label: "Cost sharing",
      value: record.costSharing === true
        ? "Yes"
        : record.costSharing === false ? "No" : "",
      note: record.costSharing === undefined
        ? "Cost sharing is not stated on the official detail record."
        : "From the official notice.",
      sourceUrl,
    },
    {
      label: "Assistance listing",
      value: record.assistanceListings[0] ?? "",
      note: record.assistanceListings[0]
        ? "Official assistance listing number."
        : "No assistance listing was attached to this notice.",
      sourceUrl,
    },
    {
      label: "Project summary",
      value: company.description,
      note: company.description
        ? "From the confirmed company profile. Replace with the notice-specific abstract if required."
        : "Leave blank until the founder provides a project summary.",
      profileKey: "description",
    },
    {
      label: "Organization type",
      value: company.founderFacts?.applicantType
        ?? company.applicantTypes[0]
        ?? "",
      note: "From the confirmed company profile. Verify it against the notice applicant types.",
      profileKey: "applicantType",
    },
    {
      label: "How to apply",
      value: howToApply,
      note: howToApply
        ? "Extracted from the official listing page."
        : "Review official instructions on Grants.gov. Nothing here submits a government form.",
      sourceUrl,
    },
  ];
  return rows;
}
