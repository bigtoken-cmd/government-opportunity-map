const stages = [
  {
    number: "01",
    title: "Build your company profile",
    description:
      "Start with a company website, one-pager, or plain-language description. Review the facts and answer only what is missing.",
  },
  {
    number: "02",
    title: "See the right opportunities",
    description:
      "Search official government sources, apply strict disqualifiers, and rank only defensible routes with clear evidence.",
  },
  {
    number: "03",
    title: "Move the application forward",
    description:
      "Open an application workspace with verified fields filled, missing answers exposed, and the next checklist already prioritized.",
  },
];

const proof = [
  "Official sources and retrieval times",
  "Strict disqualifiers before scoring",
  "Current opportunities separated from history",
  "Source-backed application fields only",
];

export default function Home() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#f4f2eb] text-[#17211b]">
      <div className="mx-auto w-full max-w-7xl px-5 pb-16 pt-5 sm:px-8 lg:px-12">
        <header className="flex items-center justify-between rounded-full border border-[#17211b]/10 bg-white/70 px-4 py-3 shadow-[0_12px_40px_rgba(23,33,27,0.06)] backdrop-blur sm:px-5">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-[#173d2c] text-sm font-bold text-white">
              OM
            </span>
            <div>
              <p className="text-sm font-semibold tracking-tight">Opportunity Map</p>
              <p className="text-[11px] text-[#56635b]">Founder funding intelligence</p>
            </div>
          </div>
          <span className="rounded-full bg-[#dff2e4] px-3 py-1.5 text-xs font-semibold text-[#205d3a]">
            Core build active
          </span>
        </header>

        <section className="relative grid gap-10 pb-16 pt-20 lg:grid-cols-[1.15fr_0.85fr] lg:items-end lg:pb-24 lg:pt-28">
          <div className="relative z-10">
            <p className="mb-5 text-xs font-bold uppercase tracking-[0.22em] text-[#3f7557]">
              Government resources, without the maze
            </p>
            <h1 className="max-w-4xl text-balance text-5xl font-semibold leading-[0.96] tracking-[-0.055em] sm:text-6xl lg:text-7xl">
              Your company in.
              <br />
              The right path out.
            </h1>
            <p className="mt-7 max-w-2xl text-pretty text-lg leading-8 text-[#526058] sm:text-xl">
              Turn the company information you already have into a short,
              defensible map of government opportunities and an application-ready
              next step.
            </p>
          </div>

          <div className="relative rounded-[2rem] border border-[#173d2c]/10 bg-[#173d2c] p-6 text-white shadow-[0_30px_80px_rgba(23,61,44,0.2)] sm:p-8">
            <div className="absolute -right-20 -top-24 h-56 w-56 rounded-full bg-[#78c18f]/20 blur-3xl" />
            <p className="relative text-xs font-semibold uppercase tracking-[0.2em] text-[#a9d7b8]">
              The decision layer
            </p>
            <p className="relative mt-5 text-3xl font-semibold tracking-[-0.035em]">
              What fits, why it fits, and exactly what to do next.
            </p>
            <div className="relative mt-8 grid gap-3">
              {proof.map((item) => (
                <div
                  key={item}
                  className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/90"
                >
                  <span className="h-2 w-2 rounded-full bg-[#86d49f]" />
                  {item}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="foundation" className="grid gap-4 md:grid-cols-3">
          {stages.map((stage) => (
            <article
              key={stage.number}
              className="rounded-[1.75rem] border border-[#17211b]/10 bg-white/75 p-6 shadow-[0_16px_50px_rgba(23,33,27,0.05)] sm:p-7"
            >
              <p className="text-xs font-bold tracking-[0.18em] text-[#4c8060]">
                {stage.number}
              </p>
              <h2 className="mt-8 text-2xl font-semibold tracking-[-0.035em]">
                {stage.title}
              </h2>
              <p className="mt-4 text-sm leading-6 text-[#5c6861]">
                {stage.description}
              </p>
            </article>
          ))}
        </section>

        <footer className="mt-12 flex flex-col gap-2 border-t border-[#17211b]/10 pt-5 text-xs text-[#68736c] sm:flex-row sm:items-center sm:justify-between">
          <p>Research aid only. Verify eligibility on the official source.</p>
          <p>Built on official government opportunity and award data.</p>
        </footer>
      </div>
    </main>
  );
}
