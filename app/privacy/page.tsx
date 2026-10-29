import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy | PathIITR" };

// Set in .env.local and in Vercel; kept out of the public repo.
const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL;

export default function PrivacyPage() {
  return (
    <div className="page-container space-y-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold text-navy sm:text-3xl">Privacy</h1>
        <p className="mt-2 max-w-2xl text-muted">
          PathIITR is a student project for ECC-399 at IIT Roorkee. This is what it does with your data.
        </p>
      </div>

      <Section title="Who can sign in">
        <p>
          Only Google accounts ending in <strong>@iitr.ac.in</strong> can sign in. Content from seniors&apos; material is
          shown only to signed-in IITR users.
        </p>
      </Section>

      <Section title="What we store">
        <ul className="list-disc space-y-1 pl-5">
          <li>Your profile choices: year, branch, interests and target tracks.</li>
          <li>Your skill ratings.</li>
          <li>Your chat history.</li>
          <li>Your thumbs up/down feedback on answers.</li>
        </ul>
      </Section>

      <Section title="What we never store">
        <ul className="list-disc space-y-1 pl-5">
          <li>Resumes. They are not kept.</li>
          <li>
            Names and contact details from source documents. These are removed before any document content is loaded
            into our database.
          </li>
        </ul>
      </Section>

      <Section title="Third-party AI providers">
        <p>
          To write answers, your questions (with the few relevant passages from our data) are sent to third-party AI
          providers: <strong>Groq</strong> and <strong>Google Gemini</strong>. Don&apos;t put personal or sensitive details
          in a question.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Questions or want your data removed?{" "}
          {SUPPORT_EMAIL ? (
            <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-brand hover:underline">
              {SUPPORT_EMAIL}
            </a>
          ) : (
            "Open an issue on the GitHub repository linked in the footer."
          )}
        </p>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="max-w-2xl space-y-2 text-ink">
      <h2 className="text-lg font-semibold text-navy">{title}</h2>
      {children}
    </section>
  );
}
