export interface MatchingRegressionCase {
  key: string;
  opportunityNumber: string;
  title: string;
  scopeSummary: string;
  sourceUrl: string;
}

/**
 * Official Grants.gov title and normalized 1,200-character scope inputs from
 * the August 15 manufacturing audit. These are evidence fixtures, not
 * production exceptions or verifier-specific output mappings.
 */
export const AUDITED_MANUFACTURING_FALSE_POSITIVES = [
  {
    key: "nsf-biomechanics-mechanobiology",
    opportunityNumber: "PD-19-7479",
    title: "Biomechanics and Mechanobiology",
    scopeSummary: "The Biomechanics and Mechanobiology (BMMB) program is part of the Mechanics of Materials cluster within the Division of Civil, Mechanical, and Manufacturing Innovation. The BMMB program supports fundamental and transformative research that advances our understanding of engineering biomechanics and/or mechanobiology. The program emphasizes the study of biological mechanics across multiple domains, from sub-cellular to whole organism. Distinct from conventional engineering materials, the program encourages the consideration of diverse living tissues as smart materials that are self-designing. BMMB projects must have a clear biological component, a clear mechanics component, and must improve our understanding of the mechanical behavior of a living system. Investigations of the mechanical behavior of biological molecules, cells, tissues, and living systems are welcome. An important concern is the influence of in vivo mechanical forces on cell and matrix biology in the histomorphogenesis, maintenance, regeneration, repair, and aging of tissues and organs. The program is also interested in efforts to translate recent biomechanical and mechanobiological discoveries into engineering scienc",
    sourceUrl: "https://www.grants.gov/search-results-detail/306171",
  },
  {
    key: "cheers-open-period-1",
    opportunityNumber: "FA238424S2334",
    title: "CHEERS Open Period 1 - All Technical Areas",
    scopeSummary: "The Air Force Research Laboratory, Human Effectiveness Directorate (RH) and the United States Air Force School of Aerospace Medicine (USAFSAM), is soliciting white papers (and potentially later technical and cost proposals) on the research located in the Statements of Objectives attached to the Continuing Human Enabling, Enhancing, Restoring and Sustaining (CHEERS) Multiple Authority Announcement (MAA) Opportunity FA2384-24-S-2233. List of Attachments: 1. \"Open Period Solicitation 1_BAA Amend 01\" 2. \"Attachment 1 - List of Provisions and Clauses (BAA)\" Related Notice: Multiple Authority Announcement (MAA) FA238424S2233, \"Continuing Human Enabling, Enhancing, Restoring and Sustaining (CHEERS)\" Note: You MUST refer to the related notice identified above in order to obtain all additional attachments referenced herein (e.g. CHEERS Industry Guide, Statements of Objectives (SOO), and S&T Protection Appendices)",
    sourceUrl: "https://www.grants.gov/search-results-detail/360261",
  },
  {
    key: "cheers-open-period-2",
    opportunityNumber: "FA238424S2335",
    title: "CHEERS Open Period 2 - All Technical Areas",
    scopeSummary: "The Air Force Research Laboratory, Human Effectiveness Directorate (RH) and the United States Air Force School of Aerospace Medicine (USAFSAM), is soliciting white papers (and potentially later technical and cost proposals) on the research located in the Continuing Enabling, Enhancing, Restoring and Sustaining (CHEERS) Multiple Authority Announcement (MAA) Statements of Objectives, FA238424S2233. This Solicitation is limited to those efforts that meet the requirements of 10 USC 4023, which includes the Secretary of Defense and the Secretaries of the military departments may each buy ordnance, signal, chemical activity, transportation, energy, medical, space- flight, telecommunications, and aeronautical supplies, including parts and accessories, and designs thereof, that the Secretary of Defense or the Secretary concerned considers necessary for experimental or test purposes in the development of the best supplies that are needed for the national defense. List of Attachments: 1. \"Open Period Solicitation 1_ARA Amend 01\" 2. \"Attachment 1 - List of Provisions and Clauses (ARA)\" Related Notice: Multiple Authority Announcement (MAA) FA238424S2233, \"Continuing Human Enabling, Enhancing, ",
    sourceUrl: "https://www.grants.gov/search-results-detail/360262",
  },
] as const satisfies readonly MatchingRegressionCase[];

export interface ProtectedDomainPositive extends MatchingRegressionCase {
  profileKey: "manufacturing" | "water" | "cyber";
}

/** Official positive title/scope inputs that must survive the precision gate. */
export const PROTECTED_DOMAIN_POSITIVES = [
  {
    key: "nsf-advanced-manufacturing",
    profileKey: "manufacturing",
    opportunityNumber: "PD-19-088Y",
    title: "Advanced Manufacturing",
    scopeSummary: "The Advanced Manufacturing (AM) program supports the fundamental research needed to revitalize American manufacturing to grow the national prosperity and workforce, and to reshape our strategic industries. The AM program accelerates advances in manufacturing technologies with emphasis on multidisciplinary research that fundamentally alters and transforms manufacturing capabilities, methods and practices. Advanced manufacturing research proposals should address issues related to national prosperity and security, and advancing knowledge to sustain global leadership. Areas of research, for example, include manufacturing systems; materials processing; manufacturing machines; methodologies; and manufacturing across the length scales. Researchers working in the areas of cybermanufacturing systems, manufacturing machines and equipment, materials engineering and processing, and nanomanufacturing are encouraged to transcend and cross domain boundaries. Interdisciplinary, convergent proposals are welcome that bring manufacturing to new application areas, and that incorporate challenges and approaches outside the customary manufacturing portfolio to broaden the impact of America&rsquo;s advan",
    sourceUrl: "https://www.grants.gov/search-results-detail/306824",
  },
  {
    key: "title-xvi-water-reuse",
    profileKey: "water",
    opportunityNumber: "R26AS00079",
    title: "Title XVI Water Reclamation and Reuse Projects",
    scopeSummary: "Through WaterSMART, the Bureau of Reclamation (Reclamation) leverages Federal and non- Federal funding to work cooperatively with States, Tribes, and other entities as they plan for and implement actions to increase water supply and hydropower reliability. The WaterSMART Program demonstrably advances Trump administration priorities, such as those identified in Presidential Executive Order 14154 (January 20, 2025): Unleashing American Energy (E.O. 14154) and Secretarial Order 3418, and aligns with other priorities and requirements, such as those identified in Presidential Executive Order 14332 (August 7, 2025): Improving Oversight in Federal Grantmaking (E.O. 14332). The WaterSMART Title XVI Water Reclamation and Reuse Projects NOFO invites eligible applicants to submit proposals for the planning, design, and/or construction of water reclamation and reuse projects. Title XVI projects develop and supplement urban and irrigation water supplies through water reuse, which provides growing communities with new sources of clean water, increases water management flexibility during times of shortage, and makes the water supply more reliable.",
    sourceUrl: "https://www.grants.gov/search-results-detail/362396",
  },
  {
    key: "nsf-cybersecurity",
    profileKey: "cyber",
    opportunityNumber: "25-515",
    title: "Security, Privacy, and Trust in Cyberspace",
    scopeSummary: "Our world is at a pivotal moment where the boundaries dividing the physical and social worlds from the cyber world have become blurred. Cyberspace has evolved from an interconnected digital environment into a complex and interdependent cyber ecosystem that involves hardware, software, networks, data, people, organizations, countries, and the physical world. Critical functions of everyday life are deeply intertwined with computing, including health, government, commerce, the public sphere, education, critical infrastructure, interpersonal communication, and transportation. The complexity and inter-dependencies in cyberspace can be misused and exploited by malicious actors. These in turn can trigger adverse outcomes such as disruption of critical infrastructure and systems; theft of intellectual property and sensitive data; amplification of inequalities; disclosure of private information of individuals, organizations, and governments; and threats to lives, livelihoods, and reputations. Furthermore, constant attacks on the data and assets of corporations, governments, and individuals undermine people&rsquo;s trust in decision-making and processes that depend critically on these cyber ",
    sourceUrl: "https://www.grants.gov/search-results-detail/357554",
  },
] as const satisfies readonly ProtectedDomainPositive[];
