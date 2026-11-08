# Authentication email recovery

Email/password accounts require email verification. Authentication mail checks the sender result and tries at most three times, with 250 ms between attempts and the same link. Logs include only template and attempt metadata (`accepted`, `attempt_failed`, `delivery_failed`), never recipients, links or provider errors.

Better Auth 1.6 catches automatic signup/signin send errors. An account can therefore be created while delivery fails; signup and unverified login show a pending-verification row with an explicit resend link. Explicit resend returns `503 AUTH_EMAIL_SEND_FAILED` after exhausted attempts; users can retry immediately on failure. A successful request starts a 60-second UI cooldown and means provider acceptance, not confirmed delivery.

Password reset keeps the same response for missing accounts and send failures. Incorrect passwords never trigger verification mail, and unverified accounts cannot obtain a session.

Unit tests exercise installed Better Auth endpoints with an in-memory adapter and fake sender. Local E2E mode bypasses real mail and newsletter providers; UI failure tests intercept only the resend response. Production provider delivery, verified-domain configuration and inbox receipt still require separate sandbox acceptance.
