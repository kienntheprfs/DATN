# DATN Chatbot - Frontend Testing Guide

## Overview

This document provides comprehensive testing documentation for the DATN Chatbot frontend application. The test suite covers E2E tests, integration tests, component tests, accessibility tests, and authentication/authorization tests using Playwright.

## Test Structure

```
frontend/tests/
├── test-utils.ts              # Test utilities and helpers
├── test-fixtures.ts           # Test fixtures and mock data
├── chatbot-e2e.spec.ts        # End-to-end tests
├── components.spec.ts         # Component unit tests
├── chat-integration.spec.ts   # Chat integration tests
├── accessibility.spec.ts      # Accessibility tests
├── auth.spec.ts              # Authentication & authorization tests
└── example.spec.ts           # Example Playwright tests
```

## Test Categories

### 1. End-to-End Tests (`chatbot-e2e.spec.ts`)

**Purpose**: Test complete user workflows from the user's perspective.

**Coverage**:
- Main page loading and content display
- Chat page functionality
- Message submission and response handling
- Voice feature integration
- Responsive design across devices
- Error handling scenarios

**Key Test Scenarios**:
- Load main page with correct content
- Navigate from main page to chat
- Send messages and receive responses
- Handle voice interactions
- Test on mobile, tablet, and desktop viewports

### 2. Component Tests (`components.spec.ts`)

**Purpose**: Test individual components in isolation.

**Coverage**:
- ChatInput component functionality
- ChatWindow message display
- Document panel interactions
- Sidebar navigation
- Voice button behavior

**Key Test Scenarios**:
- Render components correctly
- Handle user interactions
- Toggle between states
- Display appropriate content

### 3. Integration Tests (`chat-integration.spec.ts`)

**Purpose**: Test how components work together.

**Coverage**:
- Full chat flow from main page
- Multiple message exchanges
- Deep query mode functionality
- Citation handling and document panel
- Voice integration
- Error states and network issues

**Key Test Scenarios**:
- Complete chat workflow
- Context maintenance
- Performance under load
- Error recovery

### 4. Accessibility Tests (`accessibility.spec.ts`)

**Purpose**: Ensure the application is accessible to all users.

**Coverage**:
- Semantic HTML structure
- Keyboard navigation
- Screen reader support
- Color contrast
- ARIA attributes
- Focus indicators
- Responsive accessibility

**Key Test Scenarios**:
- Page structure and landmarks
- Form accessibility
- Keyboard interaction
- Screen reader compatibility
- Reduced motion support

### 5. Authentication Tests (`auth.spec.ts`)

**Purpose**: Test authentication and authorization features.

**Coverage**:
- Login/logout flows
- OAuth integration (Google)
- Token management
- Role-based access control
- Session management
- Security features

**Key Test Scenarios**:
- Redirect to auth for protected features
- Login form validation
- OAuth flow handling
- Permission-based feature access
- Session expiration
- Security measures (CSRF, rate limiting)

## Running Tests

### Prerequisites

Ensure you have the development server running:
```bash
cd frontend
npm run dev
```

### Test Commands

```bash
# Run all tests
npm test

# Run tests with UI mode
npm run test:ui

# Run tests in debug mode
npm run test:debug

# Generate new tests with codegen
npm run test:codegen

# View test reports
npm run test:report
```

### Test Configuration

The Playwright configuration is set up in `playwright.config.ts`:

- **Base URL**: `http://localhost:3000`
- **Browser Support**: Chromium, Firefox, WebKit
- **Test Timeout**: Default Playwright timeouts
- **Retry Logic**: 2 retries on CI
- **Reporting**: HTML reports

## Test Utilities

### Custom Fixtures

The test suite includes custom fixtures in `test-utils.ts`:

- **authenticatedPage**: Page with mocked authentication
- **mockApi**: Mocked API responses for consistent testing

The test fixtures and mock data are defined in `test-fixtures.ts`:

- **testFixtures**: Predefined test data for users, messages, citations, threads, API responses, and error scenarios
- **setupMockApi**: Helper to mock common API endpoints
- **setupMockVoice**: Helper to mock Web Speech API
- **generateTestData**: Functions to generate random test data

### Helper Functions

Common helper functions for test operations:

- `waitForPageLoad()`: Wait for page to fully load
- `sendChatMessage()`: Fill and send chat message
- `waitForBotResponse()`: Wait for bot response
- `takeScreenshot()`: Capture screenshots with timestamps
- `mockVoiceSupport()`: Mock Web Speech API

### Test Data

Predefined test data for consistent testing:

- User profiles and authentication tokens
- Sample chat messages and queries
- API response mocks
- Vietnamese text samples

## Test Data and Mocks

### API Mocking

Tests use comprehensive API mocking to ensure:

1. **Consistent behavior**: Same responses across test runs
2. **Offline testing**: Tests run without backend dependency
3. **Error scenarios**: Easy simulation of error conditions
4. **Performance**: Fast test execution

### Mock Endpoints

- `/api/health`: Service health check
- `/api/chat/**`: Chat functionality
- `/api/auth/**`: Authentication endpoints
- `/api/auth/me`: Current user info

### Voice API Mocking

The Web Speech API is mocked for voice feature testing:

```typescript
window.SpeechRecognition = class SpeechRecognition {
  start = () => {};
  stop = () => {};
  // ... other methods
};
```

## Best Practices

### Test Organization

1. **Descriptive test names**: Use clear, action-oriented names
2. **Logical grouping**: Group related tests in describe blocks
3. **Setup/teardown**: Use beforeEach/afterEach for clean test isolation
4. **Reusable helpers**: Extract common operations to helper functions

### Test Writing

1. **User-centric**: Write tests from user perspective
2. **Page objects**: Use page locators consistently
3. **Assertions**: Be specific with expectations
4. **Error handling**: Test both success and failure scenarios

### Accessibility

1. **WCAG compliance**: Follow WCAG 2.1 AA guidelines
2. **Keyboard navigation**: Test all interactions with keyboard
3. **Screen readers**: Ensure semantic HTML and ARIA attributes
4. **Color contrast**: Verify readable color combinations

### Performance

1. **Fast execution**: Use mocks instead of real APIs
2. **Parallel tests**: Configure for parallel execution
3. **Timeout management**: Set appropriate timeouts
4. **Resource cleanup**: Clean up after each test

## CI/CD Integration

### GitHub Actions

Add to your `.github/workflows/playwright.yml`:

```yaml
name: Playwright Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      - run: npm ci
      - run: npm run build
      - run: npx playwright install
      - run: npm test
      - uses: actions/upload-artifact@v3
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
```

### Test Reports

Test reports are generated in HTML format and can be viewed with:

```bash
npm run test:report
```

## Troubleshooting

### Common Issues

1. **Tests failing on CI**: Check if dev server is running and accessible
2. **Flaky tests**: Increase timeouts or add explicit waits
3. **Mock failures**: Verify mock routes match actual API calls
4. **Voice tests**: Ensure proper mocking of Web Speech API

### Debug Tips

1. **Use debug mode**: `npm run test:debug`
2. **Take screenshots**: Use `takeScreenshot()` helper
3. **Console logs**: Check browser console for errors
4. **Network tab**: Verify API calls in test reports

### Performance Issues

1. **Slow tests**: Optimize mock responses
2. **Memory leaks**: Ensure proper cleanup
3. **Timeout errors**: Increase specific test timeouts
4. **Resource contention**: Use test isolation

## Coverage Reports

To generate coverage reports:

```bash
npm install --save-dev @c8/v8-coverage
npm run test -- --coverage
```

Coverage targets:
- **Statements**: 80%
- **Branches**: 80%
- **Functions**: 80%
- **Lines**: 80%

## Future Enhancements

### Planned Additions

1. **Visual regression testing**: Add Percy or similar tool
2. **API contract testing**: Add backend contract tests
3. **Load testing**: Add performance tests with k6
4. **Component testing**: Add React Testing Library tests
5. **Security testing**: Add OWASP ZAP integration

### Test Metrics

Track these metrics:
- **Test execution time**: Aim for < 5 minutes total
- **Test reliability**: > 95% pass rate
- **Coverage**: Maintain > 80% coverage
- **Flaky test rate**: < 5% flaky tests

## Contributing

When adding new tests:

1. **Follow patterns**: Use existing test structure
2. **Add utilities**: Reuse existing helper functions
3. **Update docs**: Document new test categories
4. **Test locally**: Verify tests pass before committing
5. **Review coverage**: Ensure adequate test coverage

## Resources

- [Playwright Documentation](https://playwright.dev/)
- [Accessibility Testing Guide](https://playwright.dev/docs/accessibility-testing)
- [Test Best Practices](https://playwright.dev/docs/best-practices)
- [CI/CD Integration](https://playwright.dev/docs/ci)

---

**Last Updated**: 2026-04-05  
**Version**: 1.0.0  
**Maintainers**: DATN Chatbot Development Team
