import { Link } from 'react-router-dom';

export function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <img src="/pokeball.svg" alt="Pokéball" className="w-9 h-9" />
          <h1 className="text-2xl font-black text-gray-800">PokeTracker Privacy Policy</h1>
        </div>

        <div className="bg-white rounded-2xl shadow p-6 space-y-6 text-gray-700 text-sm leading-relaxed">
          <section>
            <h2 className="font-bold text-base text-gray-800 mb-2">Who we are</h2>
            <p>
              PokeTracker is a personal Pokémon TCG card collection tracking app. This privacy policy explains
              what information we collect, why we collect it, and how you can control it.
            </p>
          </section>

          <section>
            <h2 className="font-bold text-base text-gray-800 mb-2">Children's privacy (COPPA)</h2>
            <p>
              PokeTracker features Pokémon characters and may be used by children under 13. We take children's
              privacy seriously and comply with the Children's Online Privacy Protection Act (COPPA).
            </p>
            <ul className="list-disc ml-5 mt-2 space-y-1">
              <li>Children's accounts are created by a parent or guardian, who provides their own email address.</li>
              <li>We collect only a username, PIN (stored securely), and parent email — nothing else.</li>
              <li>We do not collect real names, photos, location, or any other personal information from children.</li>
              <li>We do not show ads or use any third-party advertising or tracking on this app.</li>
              <li>Parents may review, update, or delete their child's data at any time — see below.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-bold text-base text-gray-800 mb-2">What we collect — and nothing more</h2>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left p-2 border border-gray-200 font-semibold">Data</th>
                  <th className="text-left p-2 border border-gray-200 font-semibold">Why</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="p-2 border border-gray-200">Username</td>
                  <td className="p-2 border border-gray-200">To identify your account</td>
                </tr>
                <tr className="bg-gray-50">
                  <td className="p-2 border border-gray-200">PIN (hashed)</td>
                  <td className="p-2 border border-gray-200">Login authentication — stored as a secure hash, never plaintext</td>
                </tr>
                <tr>
                  <td className="p-2 border border-gray-200">Email address</td>
                  <td className="p-2 border border-gray-200">PIN reset and account notifications — stored server-side only, never visible to the browser</td>
                </tr>
                <tr className="bg-gray-50">
                  <td className="p-2 border border-gray-200">Card collection data</td>
                  <td className="p-2 border border-gray-200">Card names, set names, quantities — no personal information</td>
                </tr>
              </tbody>
            </table>
            <p className="mt-2 text-gray-500">We do not collect: real names, photos, location, device identifiers for tracking, or any other data.</p>
          </section>

          <section>
            <h2 className="font-bold text-base text-gray-800 mb-2">No tracking, no ads</h2>
            <p>
              We do not use any third-party analytics, advertising networks, or tracking pixels.
              We do not sell or share your data with any third parties.
            </p>
          </section>

          <section>
            <h2 className="font-bold text-base text-gray-800 mb-2">Email communications</h2>
            <p>
              We send emails only for account confirmation and PIN resets. We do not send marketing emails.
              For child accounts, all emails go to the parent's address.
            </p>
          </section>

          <section>
            <h2 className="font-bold text-base text-gray-800 mb-2">Your rights — and how to use them</h2>
            <p>
              You (or a parent/guardian for child accounts) may at any time:
            </p>
            <ul className="list-disc ml-5 mt-2 space-y-1">
              <li><strong>Review</strong> the data we hold about an account</li>
              <li><strong>Correct</strong> the email address on file</li>
              <li><strong>Delete</strong> the account and all associated data permanently</li>
            </ul>
            <p className="mt-2">
              To exercise any of these rights, email us at{' '}
              <a href="mailto:privacy@pokemontracker.app" className="text-[#378ADD] underline">
                privacy@pokemontracker.app
              </a>
              . We will respond within 30 days.
            </p>
          </section>

          <section>
            <h2 className="font-bold text-base text-gray-800 mb-2">Data security</h2>
            <p>
              Accounts are stored in Supabase (hosted in the United States). PINs are stored as bcrypt hashes —
              we cannot see your PIN. Email addresses are stored server-side only and are never transmitted to
              your browser.
            </p>
          </section>

          <section>
            <h2 className="font-bold text-base text-gray-800 mb-2">Changes to this policy</h2>
            <p>
              If we make significant changes to this policy, we will notify parents/guardians by email before
              the changes take effect.
            </p>
          </section>

          <p className="text-gray-400 text-xs">Last updated: May 16, 2026</p>
        </div>

        <div className="text-center mt-6">
          <Link to="/login" className="text-[#378ADD] text-sm font-semibold hover:underline">
            ← Back to Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}
