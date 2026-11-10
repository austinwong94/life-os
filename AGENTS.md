# Life OS Working Guidance

## SSD Development On Austin's Mac

- Use `/Volumes/Coding/Projects/Life-OS` for source and dependencies. Resolve compatibility links before deciding where a path lives.
- Before each shell command that can write development files, source `/Volumes/Coding/Codex/ssd-development-env.sh` and continue only on success.
- Keep build output, browser profiles, screenshots, test results and temporary fixtures on the Coding SSD. Prefer this project's ignored `test-results/` directory and pass `TEST_OUTPUT` explicitly to browser suites.
- If the SSD/helper is unavailable, stop that writing operation. Never use an internal-drive fallback or resume editing the older Mac checkout.
- Leave existing running processes alone unless a coordinated storage correction is necessary. These Mac-specific paths do not apply to hosted Linux CI.

## Records And Verification

- Never use production diary, notes, tasks, Money or Properties records as test fixtures. Use isolated synthetic workspaces and block private services in tests.
- Preserve unknown fields, pending writing, recovery copies and both sides of a conflict. Do not infer permission to choose an active copy or overwrite cloud data.
- Application deployment is code-only. Keep private backups, credentials and browser profiles out of Git and public artifacts.
- Preserve the existing regression and deployment gates. Report local verification separately from confirmed live deployment and physical-device testing.
- Include screenshots for meaningful UI progress, labelled as samples when they use synthetic data.

## Approval Continuity

When an action needs approval, pause only that dependent action. Continue useful implementation, diagnosis, testing or verification that is already authorized and independent. Do not bypass approval or safety checks, duplicate active workers, overlap changes or run needless repeats. In the next ordinary progress update, distinguish completed independent work from the exact gated action. If every useful action is blocked, state the specific decision needed.
