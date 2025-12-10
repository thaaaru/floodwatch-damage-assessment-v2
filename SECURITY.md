# Security Policy

## Overview

FloodWatch LK is a disaster response system used for real-time flood monitoring and emergency alerting in Sri Lanka. The security and reliability of this system directly impacts public safety.

We take security vulnerabilities seriously and appreciate responsible disclosure from the security research community.

## Supported Versions

Security updates are provided for the following versions:

| Version | Supported          |
| ------- | ------------------ |
| Latest (main branch) | :white_check_mark: |
| Older releases | :x: |

We recommend always using the latest version from the main branch for production deployments.

## Reporting a Vulnerability

**DO NOT** publicly disclose security vulnerabilities through:
- Public GitHub issues
- Social media posts
- Public forums or mailing lists
- Pull requests with security fixes

Public disclosure of vulnerabilities could:
- Enable malicious exploitation before fixes are deployed
- Compromise critical disaster response infrastructure
- Endanger public safety during flood events

### Responsible Disclosure Process

If you discover a security vulnerability, please report it privately:

1. **Email**: Send details to **security@floodwatch-lk.org** (placeholder - update with actual contact)

2. **Include in your report**:
   - Description of the vulnerability
   - Steps to reproduce the issue
   - Potential impact assessment
   - Suggested remediation (if any)
   - Your contact information for follow-up

3. **Encryption**: For sensitive reports, use PGP encryption (key available on request)

### What to Expect

After you submit a report:

- **Acknowledgment**: We will acknowledge receipt within 48 hours
- **Assessment**: We will assess the vulnerability and determine severity within 7 days
- **Updates**: We will provide regular updates on our progress
- **Resolution Timeline**:
  - Critical vulnerabilities: Patch within 7 days
  - High severity: Patch within 30 days
  - Medium/Low severity: Patch within 90 days
- **Coordinated Disclosure**: We will work with you to agree on a disclosure timeline
- **Credit**: With your permission, we will acknowledge your contribution in release notes

### Coordinated Disclosure

We follow coordinated disclosure practices:

1. **Private Notification**: You report the issue privately
2. **Investigation**: We investigate and develop a fix
3. **Patch Development**: We create and test a security patch
4. **Deployment**: We deploy the patch to production systems
5. **Public Disclosure**: After mitigation is deployed, we publicly disclose the issue
6. **Credit**: We credit the reporter (if desired)

**Typical Disclosure Timeline**: 90 days from initial report, or when patch is deployed (whichever comes first)

**Emergency Exceptions**: For critical vulnerabilities actively exploited in the wild, we may expedite disclosure to warn the community.

## Scope

### In Scope

Security issues affecting:

- **Authentication and Authorization**:
  - SMS alert subscription bypass
  - API authentication weaknesses
  - Admin panel access controls

- **Data Integrity**:
  - Weather data manipulation
  - Alert threshold tampering
  - False alert injection

- **Availability**:
  - Denial of service vulnerabilities
  - Resource exhaustion attacks
  - Database performance attacks

- **Information Disclosure**:
  - Exposure of subscriber phone numbers
  - Leakage of API credentials
  - Sensitive configuration exposure

- **Injection Vulnerabilities**:
  - SQL injection
  - Command injection
  - Cross-site scripting (XSS)
  - LDAP injection

### Out of Scope

The following are generally considered out of scope:

- Issues requiring physical access to infrastructure
- Social engineering attacks on users
- Denial of service attacks requiring massive resources
- Issues in third-party dependencies (report to upstream projects first)
- Theoretical attacks without practical exploit
- Missing security headers with no demonstrated impact
- Reports from automated scanners without manual validation

However, if you believe an out-of-scope issue has significant impact, please report it anyway.

## Security Best Practices for Deployments

If you are deploying FloodWatch LK, please follow these security guidelines:

### Infrastructure

- Use HTTPS/TLS for all production deployments
- Keep all dependencies up to date
- Use strong database passwords (20+ characters, random)
- Restrict database access to localhost or private networks
- Enable database encryption at rest
- Use firewall rules to limit exposed services

### API Keys and Secrets

- Never commit API keys or credentials to version control
- Use environment variables for all secrets
- Rotate API keys regularly (every 90 days minimum)
- Use separate API keys for development, staging, and production
- Monitor API usage for anomalies

### Application Configuration

- Disable debug mode in production
- Set appropriate CORS policies
- Implement rate limiting on all API endpoints
- Enable logging and monitoring
- Use production-grade web servers (not development servers)

### SMS Alerting

- Validate phone numbers before subscription
- Implement rate limiting on SMS sending
- Monitor for unusual alert patterns
- Maintain opt-out/unsubscribe mechanisms
- Protect subscriber phone number databases

### Data Handling

- Validate all external API responses
- Sanitize user inputs
- Implement proper error handling (don't leak stack traces)
- Use prepared statements for database queries
- Implement backup and disaster recovery procedures

## Known Security Considerations

### Weather Data Sources

- This system relies on external weather APIs (Open-Meteo, GDACS, etc.)
- Weather data is not cryptographically signed
- Data integrity depends on API provider security
- Implementers should validate critical alerts through multiple sources

### SMS Delivery

- SMS alerts are not end-to-end encrypted
- SMS delivery is not guaranteed
- Users should not rely solely on SMS for emergency notifications

### Third-Party Dependencies

- This project uses numerous open-source dependencies
- Dependencies are regularly updated to address security issues
- Run `npm audit` and `pip-audit` regularly to check for known vulnerabilities

## Security Incident Response

If a security incident occurs:

1. **Containment**: Immediately isolate affected systems
2. **Assessment**: Determine scope and impact
3. **Notification**: Notify affected users if data was compromised
4. **Remediation**: Deploy fixes and restore services
5. **Post-Mortem**: Document lessons learned and improve processes

## Vulnerability Disclosure Timeline

After a vulnerability is fixed:

1. Security advisory published in repository
2. CVE requested (for high/critical issues)
3. Affected versions documented
4. Upgrade path provided
5. Credit given to reporter (if authorized)

## Contact

For security concerns:
- **Email**: security@floodwatch-lk.org (placeholder - update with actual contact)
- **Response Time**: Within 48 hours
- **Encryption**: PGP key available on request

For non-security issues:
- Use GitHub issues: https://github.com/[your-org]/floodwatch-lk/issues

## Acknowledgments

We thank the following security researchers for responsible disclosure:

*(List will be updated as vulnerabilities are reported and fixed)*

## Legal

This security policy does not authorize:
- Accessing systems without permission
- Denial of service attacks against production systems
- Data exfiltration beyond proof-of-concept
- Social engineering of system administrators or users

Security research must comply with applicable laws and regulations. We will work with ethical security researchers who follow responsible disclosure practices.

---

**Thank you for helping keep FloodWatch LK secure and reliable for Sri Lankan communities.**
