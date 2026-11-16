# Improvements and verification

## Implemented

- Authenticated, tenant-scoped extension and AI telemetry routes; removed global profile/account fallbacks and fabricated historical usage data.
- Server API keys are no longer returned to clients. The extension no longer fetches or uses cached server credentials. Only independently configured user keys can power its direct-provider fallback.
- OAuth state verification and request-local Google OAuth clients; authenticated requests validate that the account still exists.
- Persistent per-user dispatch records with a unique idempotency index, leased preparation claims, stable RFC Message-IDs, explicit failed/uncertain/sent states, and Gmail sent-mail reconciliation.
- Uncertain Gmail failures do not fall back to another transport. Expired submission claims remain blocked; expired preparation claims can recover. Repeated successful actions return the existing result without sending again.
- Original outreach stores separate Gmail and RFC identifiers. Follow-ups require recovered thread metadata and use the original subject. Inbox replies now use RFC IDs instead of Gmail internal IDs.
- Resume links are purpose-specific signed links that expire after seven days. Unsigned userId-only downloads are blocked. Authenticated downloads always use the authenticated owner.
- Signed tracking links bind the owner, job, purpose and click destination, and expire after 90 days. Tracking cannot downgrade replied or other completed applications.
- Shared dispatch enforces individual recipients, personal blocklists, authentication, placeholder checks, and resume attachment claims.
- Per-user atomic daily email and AI-request limits, a global sending pause, timezone-based quiet hours, configurable follow-up days, and an opt-in automatic follow-up control.
- Follow-ups stop after replies, bounced/replied application status, or a failed Gmail reply check. Bounce checks run across connected users every 15 minutes. The scheduled follow-up check runs at 11:00 AM Asia/Kolkata.
- Deterministic fallback drafts use saved skills, project descriptions and achievements. Invented salary ranges, immediate availability and generic project accomplishments were removed from extension fallbacks. Missing salary/availability answers request user input.
- Desktop and mobile send actions dispatch directly, without a pre-send review modal, as requested. Single-email generation saves its draft and then sends when a recipient is provided. Server-side protections still apply.
- Safety & activity page with pipeline metrics, queue stages, verification reasons, retries, send outcomes, Gmail reconciliation, limits, follow-up settings, confirmed salary/availability, CSV/JSON exports, duplicate review with undo, and account deletion.
- GET applications no longer hides or deletes inferred duplicates. Duplicate suggestions are restricted to unsent records with matching company, role and URL. Archive/undo mutations are scoped to the owner.
- Account deletion first pauses and tombstones the account, waits for active submissions, then removes owned profiles, resumes, jobs, blocklists, usage and dispatch records. Deletion can be retried after an in-flight send finishes; other account actions are blocked during deletion.
- Production JavaScript is split into desktop/mobile/shared chunks; the largest generated chunk is about 249 kB rather than the previous 584 kB. Removed an unused login import and corrected the GitHub profile effect dependency.
- Resume upload size limits, stricter CORS behavior, backend startup without configured AI providers, frontend HTTP error handling and dual job-ID support in changed queue paths.

## Defaults and behavior changes

- Daily limits default to 25 email attempts and 50 AI requests per user. Failed attempts can consume a reservation. These limits bound request counts; they are not an exact currency budget across provider retries.
- Automatic follow-ups default to off. Enable them in Safety & activity or with the existing follow-up toggle after reviewing the schedule.
- Pausing prevents the next submission; it cannot recall a message already accepted by Gmail.
- Old unsigned resume/tracking URLs no longer grant access or change analytics. Generate new messages/links when needed.
- A Gmail sent-mail lookup that finds no message does not prove non-delivery. Uncertain sends remain blocked rather than becoming eligible for blind retry.
- JSON exports exclude account credentials, GitHub tokens and the PDF binary. Sent messages remain in Gmail after deleting the app account.

## Validation

- 19 backend regression tests pass, including concurrent dispatches, ambiguous outcomes, tenant isolation, daily quota races, signed links, thread recovery, reply/bounce stops, blocklists, resume access, CSV escaping, controls validation and staged account deletion.
- All backend JavaScript and the extension background script pass Node syntax checks.
- Frontend production build passes with code splitting and no oversized-chunk warning.
- Frontend lint completes without errors. Existing unused-variable and hook warnings remain in older components.
- No real emails were sent by the tests. Models and transport boundaries are isolated with generated tenant identities; tests do not modify live user records.

## External and verification limits

Browser OAuth round trips, real Gmail delivery, database failure recovery under production load, and extension interaction on external job boards still need a controlled end-to-end check. No automated browser inspection was available in this session. The source checks and mocked integration suite do not substitute for those checks.

Provider keys cannot be rotated from this repository. If the old key-returning endpoint was publicly reachable, rotate Groq/Gemini keys in their provider consoles and update the local/deployed environment. No key was printed or committed.

Some generated frontend/dist files were already tracked before this work despite ignore rules. Build output is restored after verification and excluded from source commits.


## Batch outreach regression fixes

- Removed the requested pre-send review modal; send actions dispatch directly through existing server protections.
- Fixed placeholder matching that treated the LinkedIn signature label as Link. Valid project and signature hyperlinks pass; actual unresolved fields are named in the error.
- Batch sends now use MongoDB IDs where available. Active-record filtering prevents an archived duplicate custom ID from hiding an active application. Tracking continues to use the custom job ID.
- Replaced premature deliverability-success logs with pending-server-check messages and show discovery source/failure reasons.
- Tightened company-domain prefix matching, recheck cached recipients at dispatch, and invalidate cached recipients on a confirmed domain mismatch.
- The full previous 22-test suite passed; a further focused integration test passed for both send identifiers and archived-duplicate filtering. Frontend build and changed backend syntax checks passed. Transport was mocked; no test emails were sent.


## Discovery, exclusions and partial results

- Preserved sequential outreach to multiple company inboxes. No one-contact restriction or review modal was added.
- Added per-user company-domain corrections and brand aliases in Safety & activity, with MX validation, evidence/source display, and removal controls. Domain mappings are included in personal export/deletion.
- Discovery reads official employer websites from JobPosting metadata and website links on the job page before using search fallback. Private network destinations are rejected and DNS results are pinned for page fetches. Blocked/JS-only portals still require a saved correction or another discovery source.
- Added pre-draft preparation scoped to the authenticated user. It filters blocklists, employer-domain mismatches, and already-sent/uncertain recipients before AI generation. Blocked-only applications do not use an AI request.
- Dispatch records independent recipient outcomes and continues to remaining allowed addresses after a failure. Summaries show sent, blocked and failed/uncertain counts. Accepted results are saved after each recipient, with stable dispatch claims protecting retries.
- Safety & activity exposes partial sends and recipient reasons; retries exclude already-sent and uncertain addresses. Gmail reconciliation updates recipient outcomes when delivery is confirmed.
- Blocklist entries expose source, date and reason. New rules explicitly distinguish manual exclusions and automatic bounce protection; legacy rules infer source only where the recorded reason supports it.
- Added profile-based relevance scores and explanations. Clearly conflicting disciplines are excluded before drafting and from the new-job list; ambiguous roles remain available. Filtering is configurable in Safety & activity and never deletes application history. Scores are heuristic relevance indicators, not hiring probabilities.
- Validation: 31 regression tests, frontend production build and backend syntax checks pass. Existing lint warnings remain in older frontend components. No real emails were sent during tests; browser/Gmail/provider integration remains a separate end-to-end verification boundary.


## LinkedIn recruiter finder and personal-email improvements

- Replaced directory padding, forced fresh rotations, company-from-role fallbacks and AI-created recruiter profiles with evidence-based public search parsing. A shortage of relevant results stays a shortage instead of adding unrelated people.
- Added explicit company and recruiting-specialty search modes, grouped queries per location, evidence-based relevance ranking and provider diagnostics. Search-engine profile snippets support the result; they do not independently verify current employment.
- Canonical LinkedIn member URLs are the identity key. Same-name people remain distinct. A per-user partial unique index protects new profiles from duplicate insertion. Repeat searches refresh evidence while preserving existing sent/replied history; deleted profiles stay excluded.
- Saved recruiter evidence includes provider, source link/snippet, observed date, source date when supplied, employer evidence and score reasons. Both interfaces expose evidence, lookup status, email method/confidence and a contact-history filter.
- Recruiter profiles save first; email lookup is a durable leased queue with two concurrent lookups, bounded automatic failure retries and periodic all-account resume. Slow lookups no longer lose their results to a 2.5-second Promise.race. Deleted/contacted records or changed employers cannot receive stale lookup results.
- Personal-email discovery prioritizes profile snippets, public employer contact/team/career pages, exact-name public contact searches and name/domain provider lookups before pattern inference. Addresses must match the employer domain and recruiter name evidence. Initial-based published addresses require nearby full-name evidence.
- Pattern history is drawn from the requesting user's previously confirmed, non-inferred contacts. Inferred patterns and unconfirmed mailboxes are labelled explicitly; they are not represented as published personal contacts. Department-only results are distinguished from personal recruiter addresses.
- Existing sequential multi-inbox outreach remains: a named contact can be accompanied by the five department inboxes, each independently verified and blocklist-filtered. Finder/lookup operations never send email.
- Bulk and per-profile HR email lookup controls now queue background work. Batch outreach waits for queued/running recruiter lookup rather than starting a second competing discovery.
- Search-provider quota/errors and contact-provider timeouts are visible. New provider usage is recorded against the authenticated user.
- Validation adds 15 mocked recruiter discovery/email/queue/history tests. Browser interactions with external LinkedIn/search/provider services were not exercised with real accounts, and no emails were sent by tests.


## Unknown-employer recovery

- Added parsing for labelled current-company/experience fields in indexed profile snippets, preserving source evidence and rejecting past-employment labels.
- Unknown-employer email lookup now tries stored evidence and an exact-profile/name employer search before entering a needs-employer state. A matched name at a different LinkedIn URL is not sufficient.
- New profiles queue employer resolution even when the initial search snippet has no company. Repeated searches also queue previously unprocessed legacy leads.
- Resolved employers persist independently of email-domain success so a later domain correction does not repeat employer discovery.
- Added inline employer/domain correction on each uncontacted recruiter card. Domain corrections are MX-checked, scoped to the user and saved before requeueing; contacted history remains protected. User-confirmed employers survive later search refreshes.
- Added a pending-lead bulk lookup action, explicit employer-resolution statuses and human-readable failure states. Unknown employers no longer appear simply as Not checked.
- Fixed the mobile search row so the query input does not collapse beside the mode/city controls, and corrected All India searches to retain an India constraint.
- Regression coverage includes labelled source extraction, exact-profile matching, resolved-company email flow, unresolved quota errors, tenant-scoped manual corrections and worker persistence without an email result. No real email was sent during tests.


## Final validation before branch synchronization

- All 59 backend tests pass, including durable recruiter exclusions, synchronous batch lookup persistence, canonical profile matching, tenant isolation, and preservation of contacted records.
- Node syntax checks pass for all 73 tracked/new JavaScript source files outside generated output.
- The frontend production build passes; lint exits successfully with existing unused-variable warnings.
- Restored the original HR screen design, removed the duplicate desktop selection button, and separated recruiter evidence from the email row to prevent clipping.
- Unsuccessful recruiter lookups retain hidden profile records to prevent rediscovery; temporary worker failures retry before exclusion. Recruiters with addresses remain available when sending limits are reached.
- Changed/new files were scanned for credential signatures and prohibited artifacts; generated builds and local logs are excluded from staging.
