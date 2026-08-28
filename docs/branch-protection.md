# Main branch protection

Configure this rule in GitHub after the CI workflow has run at least once:

- Branch name pattern: `main`
- Require a pull request before merging
- Require at least one approval
- Dismiss stale approvals after new commits
- Require review from Code Owners
- Require status check: `verify`
- Require branches to be up to date before merging
- Require conversation resolution
- Block force pushes and branch deletion
- Do not allow bypass for repository administrators during normal delivery

Repository settings are client/developer account state and cannot be enforced by
a committed file alone. Record completion in `CONTEXT.md` after the rule is live.
