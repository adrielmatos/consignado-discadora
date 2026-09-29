# Security Policy

## Reporting
Report suspected vulnerabilities privately through GitHub Security Advisories. Do not publish credentials, personal data, exploit code, or customer records in public issues.

## Response targets
- Acknowledge within 24 hours.
- Initial remediation or mitigation target within 72 hours for confirmed high-risk issues.
- Critical secrets are revoked/rotated immediately.

## Mandatory controls
- RLS on every public Supabase table.
- service_role only in server-side runtime code.
- Production credentials isolated from preview/development.
- CI fails on detected credentials or high dependency vulnerabilities.
- Uploads validated by type and size.
- Audit logs must never contain passwords or tokens.

## Data protection
Customer PII is operational data and must not be sent to third-party logs. Least privilege applies to operators, database policies and deployment credentials.
