# Budget Planer usability improvement plan

Date: 2026-11-06

## Goal and boundaries

Make everyday budgeting easier to discover, operate with keyboard or touch, and recover when a request fails. Preserve existing budgets and the multi-year data model. All stored monetary input remains CHF; converted currencies are for display and must be explained. No speculative redesign, schema migration, or change to real-world tax rules is required.

## Audit findings

Three Sol agents independently inspected onboarding/navigation, editor/data entry, and reliability/localization. They identified historical-year edits writing to the current year, custom distributions touching other years, lost drafts on failed saves, inaccessible cells and hidden category actions, misleading yearly cards, broken startup retry, untranslated starter names, German-only salary recognition, and imports silently dropping unknown category references.

## Implementation workstreams

1. **Dashboard and budget cards (Sol).** Open every successfully created budget, prevent repeat submission, retain explicit template setup errors, describe starter content accurately and avoid activating example taxes without user choice. Validate import shape and show pending feedback; remove name-based import success guesses. Add searchable/sortable complete budget retrieval with a distinct no-results state. Use semantic card links/actions, show a named year and signed planned balance for that year, and keep cached budgets during refresh failures.
2. **Grid and category editing (Sol).** Pass the selected year through every monthly save, suggestion and custom distribution; never touch other years. Refresh drafts on edit-open, preserve them on errors, validate numbers and prevent duplicate saves. Provide keyboard activation, local Enter/Escape behavior, initial/return focus and associated labels. Keep actions discoverable on touch/focus; validate category modes and autofill; copying plans must preserve actual history. Keep calculated annual/custom plan semantics consistent and label CHF inputs.
3. **Editor, summaries and forms (Sol).** Include balance-only years and adjacent planning years, reset state on budget route changes, distinguish missing budgets from retriable failures. Centralize salary recognition for existing German/English names across all calculation surfaces without inferring that every income is salary. Make category, deduction, tax and template flows clearer with pending protection, labels, validation and CHF guidance. Make template dialogs accessible if feasible within this ownership boundary.
4. **Shared shell, startup and import integrity (parent).** Repair retry deadlines and cancel obsolete startup loops. Add skip navigation, translated controls, readable mobile language choices, reduced motion and document language synchronization. Validate import collection shapes/IDs/references and ensure atomic rollback. Preserve explicit actual zero values in model/export calculations. Remove financial payload debug logging and validate exchange-rate cache. Repair stale backend tests and dependency declaration.

## Coordination

- Shared checkout, disjoint ownership: stream 1 owns BudgetDashboard/BudgetCard; stream 2 owns MonthlyCell/ActualBalanceCell/CategoryRow; stream 3 owns BudgetEditor/BudgetTable/BudgetSummary/BudgetGraphs/BalanceDifferenceCard/TaxesSection/SalaryReductionsSection and a shared salary helper; parent owns remaining files.
- Parent is the sole locale-file writer. Agents supply translation dictionaries in separate JSON files for integration. Contracts: `MonthlyCell.budgetYear: number` is required; stream 3 exports `isSalaryCategory(category)` from `utils/salary.ts`, recognizing normalized exact German/English salary names only. Parent owns API/types/backend changes and cross-stream regression setup.
- Review the plan with Astra before implementation. Resolve concrete objections in this file. Review the final diff with a new Astra delegation and address material findings.

## Acceptance and verification

- Historical-year saves and custom distributions are isolated; existing actual values survive plan operations.
- Failed saves retain drafts; keyboard users can open/save/cancel cells; touch users can discover category actions.
- Dashboard balances retain signs and use one explicit year; German/English starter salary names calculate consistently.
- Startup timeout followed by Retry can succeed; stale/unmounted checks cannot call readiness.
- Invalid imports return 400 with no partial budget; valid exported budgets round-trip with entries intact.
- Explicit zero actuals remain distinct from missing actuals.
- Run TypeScript/production build, focused frontend interaction/regression checks where supported, Django system check and repaired backend tests. Record commands/results and any limits below. Browser preview was not requested; do not use preview tools solely for verification.

## Review and progress

- Baseline frontend production build passed; existing bundle size and mixed-import warnings recorded.
- Backend baseline setup needed system certificate support for uv; baseline had 14 stale-test errors. Updated tests use the multi-year model and the dependency manifest now includes Django REST framework.
- Astra plan review: completed; required amendments incorporated below.
- Implementation: completed across three parallel Sol streams plus parent integration. Translation additions were integrated by the parent into both language files.
- Final Astra implementation review: completed with no material findings. Astra's sole bounded follow-up was simultaneous balance-creation coverage; the parent added and passed a separate-connection SQLite concurrency check after review.

## Follow-up boundaries

An explicit salary category role would remove name-based inference but needs a separate migration. A full converted-currency input model, wholesale financial calculation redesign, and editing actuals in calculated YEARLY/CUSTOM cells need coordinated product and data-model work beyond this pass; preserve and explain current semantics rather than change them partially.

## Astra review amendments (required)

- Category mode/schedule/annual amount are global configuration. Disable custom-start-cell bulk editing and direct users to category settings; year-specific monthly entry edits must never update category configuration. Global settings clearly explain all-year impact and require explicit confirmation before applying changes.
- Bulk autofill/copy must modify only planned amounts for the chosen year and preserve actuals (including zero) and notes. Parent adds an atomic backend category `plan_entries` action taking `{year, entries: [{month, planned_amount}]}`. It validates the entire request before writes; frontend must await success and refetch on any error. No off-schedule entries are deleted. Global mode setting changes do not rewrite/delete entry history.
- Actual-balance editing patches only the edited field. Parent adds an atomic `set_field` action with `{budget, year, month, field, value}` that creates/updates a monthly record without overwriting its sibling field; serialize competing creates via a budget-row lock and database uniqueness.
- Import rejects malformed members, duplicate source category IDs, duplicate category/month/year entries, dangling references and duplicate balances. Verify late rollback and a full settings/notes/null/zero round-trip. On uncertain network outcomes show that the user should refresh the list before retry; never infer success from a matching name.
- Named frontend checks: add a Node/Vitest-compatible interaction suite using jsdom and React Testing Library for historical-year payloads, stale draft reopening, failed-save retention, keyboard edits, startup retry/unmount, and sibling balance payloads. Add focused pure helper checks for salary recognition/yearly cards. Named backend checks: Django tests for atomic bulk rollback/year isolation/history preservation, set-field sibling preservation, invalid imports/late rollback/full round-trip, and actual zero semantics. Parent owns test dependencies/config; agents add tests only for their owned components/helpers.

## Implemented outcomes

- Searchable/sortable dashboard; starter, empty and template choices; clear setup/import recovery; semantic cards with signed planned balance for one year. Starter budgets no longer create example taxes automatically.
- Keyboard/touch cell editing, fresh drafts, retained failure feedback, CHF labels and actual entry for all monthly categories. Copy/autofill change only one year's planned values through one atomic request. Calculated categories open explicit global settings with confirmation and never delete entry history.
- Atomic field-specific monthly actual-balance saves prevent stale sibling overwrites. Complete JSON export includes inactive configuration/history, and import rejects malformed references/duplicates while rolling back failures.
- Consistent exact-name salary recognition, deductions applied once to the first matching source, planned chart/table totals, signed deficits, balance-only years, new planning years, retryable editor errors and native template dialogs.
- Startup retry resets its deadline and cancels obsolete checks. Skip link, translated theme controls, mobile language names, reduced motion and document-language synchronization are included. Cached/live rates are validated, and manual refresh reports failure honestly.
- Charts load on demand: initial JavaScript is approximately 568 KB instead of the baseline 998 KB; the chart chunk is approximately 433 KB.

## Verification record

- `cd frontend; bun run test`: **65 tests passed** across 12 files (Vitest + jsdom + React Testing Library).
- `cd frontend; bun run build`: TypeScript and production build passed. Existing Browserslist age warning and a >500 KB main-chunk warning remain; the former mixed static/dynamic API-import warning was removed.
- `cd frontend; bun run lint`: passed with the added flat ESLint configuration focused on hook usage and runtime correctness.
- `cd backend; uv run python manage.py test`: **25 tests passed**, including import round-trip/late rollback, invalid shapes/references/duplicates, bulk rollback/year isolation/history preservation, stale-sibling field saves, explicit zero actuals and Excel export.
- `cd backend; uv run python manage.py check`: passed.
- `cd backend; uv run python verify_balance_concurrency.py`: passed. Two requests synchronize after validation on separate connections against a private file-backed SQLite database, then save income and expenses to the same initially absent monthly record. Both return 200; exactly one row contains both values. The script never opens an existing application database.
- Static translation-reference check found no missing literal translation keys in either language. `git diff --check` passed.
- No browser/desktop visual run was performed; browser preview was not requested. Interaction tests exercise DOM workflows; concurrency is verified on the app's SQLite engine. Native desktop rendering and other database engines remain practical verification limits.

## Follow-up: startup entry and language control

- Replaced both header language dropdowns with one-click DE/EN switch buttons. The active language is highlighted; accessible action labels, keyboard activation and existing language persistence are retained.
- Added a dashboard redirect for `/index.html`, which previously fell through to the unknown-page route. Budget deep links and genuine unknown-page recovery remain intact. The reported startup screen did not recur, so its original URL/cause could not be confirmed.
- Six focused route/language tests passed; production build and lint passed. These checks supplement the earlier 65-test frontend run.

## Follow-up: table fits the available width

- Removed fixed minimum column widths and the horizontal scrolling container. A fixed-layout table distributes the available width proportionally across category, type, all 12 months, annual total and actions.
- Column spacing and font size adjust to the table container. Long labels and amounts wrap; action buttons wrap within their column. No columns or financial values are hidden.
- Amount, category configuration, rename and autofill editors use a shared modal dialog so editing does not widen the grid. Keyboard save/cancel, pending guards, retained drafts and focus restoration remain covered.
- Headless Edge checked the actual rendered table with long German labels and large amounts at container widths 320, 768, 1024, 1280, 1585 and 1920 px: table width and scroll width matched the container in every case, no content crossed its right edge, and opening an editor did not change table width. The optional `BUDGET_LAYOUT_FIXTURE` environment variable on `BudgetTable.test.tsx` exports a self-contained HTML fixture using the production CSS for repeating this geometry check.
- Full frontend suite: **72 tests passed** across 15 files. Production build, lint and `git diff --check` passed. Existing bundle-size and Browserslist warnings remain.
