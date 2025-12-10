# Contributing to FloodWatch LK

Thank you for your interest in contributing to FloodWatch LK, a public-interest disaster response system for Sri Lanka. This project serves communities at risk of flooding, so accuracy, reliability, and safety are paramount.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How to Contribute](#how-to-contribute)
- [Submitting Issues](#submitting-issues)
- [Proposing Enhancements](#proposing-enhancements)
- [Pull Request Guidelines](#pull-request-guidelines)
- [Data Accuracy and Verification](#data-accuracy-and-verification)
- [Development Guidelines](#development-guidelines)

## Code of Conduct

This project is used in disaster response contexts. Contributors must:

- Prioritize accuracy and safety over speed
- Respect the critical nature of flood monitoring
- Ensure changes do not introduce false alerts or suppress real warnings
- Maintain professional, constructive communication

## How to Contribute

Contributions are welcome in several forms:

1. **Bug Reports**: Report errors, incorrect data, or system failures
2. **Data Verification**: Validate weather data sources and thresholds
3. **Feature Enhancements**: Propose improvements to monitoring and alerting
4. **Documentation**: Improve setup guides, API docs, and operational procedures
5. **Code Improvements**: Optimize performance, fix bugs, add features

## Submitting Issues

When reporting issues, please include:

### For Bug Reports

- **Description**: Clear summary of the issue
- **Steps to Reproduce**: Detailed steps to recreate the problem
- **Expected Behavior**: What should happen
- **Actual Behavior**: What actually happens
- **Environment**: OS, browser, backend version, deployment method
- **Screenshots/Logs**: Any relevant error messages or visual artifacts
- **Impact**: Does this affect real-time alerts or data accuracy?

### For Data Issues

- **Data Source**: Which API or service is affected
- **Timestamp**: When the issue occurred
- **District/Location**: Geographic area affected
- **Evidence**: Screenshots, API responses, or log entries
- **Verification**: Have you cross-referenced with official sources?

**Critical Issues**: If you discover a bug that could cause false alerts, missed warnings, or data corruption, please mark the issue as urgent and provide immediate details.

## Proposing Enhancements

Enhancement proposals should include:

1. **Use Case**: Why is this enhancement needed?
2. **Current Limitation**: What problem does it solve?
3. **Proposed Solution**: How would it work?
4. **Alternatives Considered**: Other approaches you've evaluated
5. **Impact Assessment**:
   - Does it affect alert accuracy?
   - Does it change thresholds or warning logic?
   - Could it introduce false positives/negatives?
6. **Data Sources**: If adding new data, document sources and reliability

Before implementing major features:
- Open an issue first to discuss the approach
- Wait for maintainer feedback to avoid duplicated effort
- Consider backward compatibility and existing deployments

## Pull Request Guidelines

### Before Submitting

- [ ] Create an issue describing the change (unless it's a minor fix)
- [ ] Fork the repository and create a feature branch
- [ ] Follow existing code style and patterns
- [ ] Test your changes locally (backend and frontend)
- [ ] Verify data accuracy if touching alert logic or thresholds
- [ ] Update documentation if adding features or changing APIs
- [ ] Add SPDX headers to any new files

### Pull Request Checklist

- [ ] **Title**: Clear, descriptive title (e.g., "Fix: Rainfall threshold logic for Colombo district")
- [ ] **Description**: Explain what changed and why
- [ ] **Issue Reference**: Link to related issue(s)
- [ ] **Testing**: Describe how you tested the changes
- [ ] **Breaking Changes**: Flag any backward-incompatible changes
- [ ] **Data Verification**: For alert/threshold changes, document verification process
- [ ] **Screenshots**: Include before/after if UI changes

### Code Style

- **Python (Backend)**:
  - Follow PEP 8 style guidelines
  - Use type hints where appropriate
  - Add docstrings for public functions
  - Keep functions focused and modular

- **TypeScript/JavaScript (Frontend)**:
  - Follow existing formatting patterns
  - Use TypeScript types consistently
  - Keep components focused and reusable
  - Maintain responsive design principles

- **Commits**:
  - Write clear, descriptive commit messages
  - Use conventional commit format when possible: `fix:`, `feat:`, `docs:`, etc.
  - Reference issue numbers in commit messages

### Review Process

1. Maintainers will review your PR within 7 days
2. Address any requested changes or clarifications
3. Once approved, maintainers will merge the PR
4. Merged changes will be deployed according to the release schedule

## Data Accuracy and Verification

**CRITICAL**: This system is used for disaster response. Data accuracy is non-negotiable.

### Verification Requirements

When adding or modifying:

- **Weather Data Sources**:
  - Verify API reliability and uptime history
  - Cross-reference with official meteorological agencies
  - Document data update frequency and latency

- **Alert Thresholds**:
  - Cite official sources (Sri Lanka Meteorological Department, Disaster Management Centre)
  - Validate against historical flood events
  - Test edge cases and boundary conditions

- **Geographic Data**:
  - Verify district boundaries and coordinates
  - Ensure location names match official designations
  - Test with Sri Lankan postal codes and place names

### Testing Data Changes

1. **Historical Validation**: Test against past flood events
2. **Boundary Testing**: Verify behavior at threshold limits
3. **Cross-Validation**: Compare with other reliable sources
4. **Documentation**: Record all assumptions and sources

### Prohibited Changes

Do NOT submit PRs that:

- Lower alert thresholds without official justification
- Disable or bypass alert mechanisms
- Use unverified or unreliable data sources
- Introduce delays in critical alerting paths
- Remove safety checks or validation logic

## Development Guidelines

### Local Development Setup

See the main [README.md](README.md) for setup instructions.

### Running Tests

```bash
# Backend tests
cd backend
pytest

# Frontend tests (if applicable)
cd frontend
npm test
```

### Environment Variables

Never commit:
- API keys
- Database credentials
- Twilio tokens
- Production URLs

Use `.env.example` files as templates.

### Deployment Considerations

This system may be deployed in:
- Government disaster response centers
- NGO operations rooms
- Academic research environments
- Public-facing community portals

Test changes across different deployment scenarios when possible.

## Questions or Help?

If you need assistance:

1. Check existing documentation in the repository
2. Search closed issues for similar questions
3. Open a new issue with the `question` label
4. Be patient and respectful of maintainer time

## License

By contributing to FloodWatch LK, you agree that your contributions will be licensed under the Apache License 2.0. See the [LICENSE](LICENSE) file for details.

---

**Thank you for helping make flood monitoring more accessible and reliable for Sri Lankan communities.**
