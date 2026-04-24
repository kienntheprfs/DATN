import { test as base, expect, type Page, type Route } from '@playwright/test';
import { addCoverageReport } from 'monocart-reporter';

// Mở rộng base test để tự động thu thập V8 coverage
export const test = base.extend<{ autoTestFixture: void }>({
  autoTestFixture: [async ({ page }, use) => {
    // Chỉ thu thập coverage khi có biến môi trường COVERAGE=true
    if (process.env.COVERAGE === 'true') {
      await Promise.all([
        page.coverage.startJSCoverage({ resetOnNavigation: false })
      ]);
      await use();
      const [jsCoverage] = await Promise.all([
        page.coverage.stopJSCoverage()
      ]);
      await addCoverageReport([...jsCoverage], test.info());
    } else {
      await use();
    }
  }, { scope: 'test', auto: true }]
});

export { expect, type Page, type Route };

// Test data fixtures for consistent testing
export const testFixtures = {
  // User data
  users: {
    authenticated: {
      id: 'user-123',
      name: 'Nguyễn Văn A',
      email: 'nguyenvana@hcmut.edu.vn',
      role: 'student',
      permissions: ['read', 'write'],
    },
    admin: {
      id: 'admin-456',
      name: 'Admin User',
      email: 'admin@hcmut.edu.vn',
      role: 'admin',
      permissions: ['read', 'write', 'delete', 'admin'],
    },
    guest: {
      id: null,
      name: 'Guest',
      email: null,
      role: 'guest',
      permissions: [],
    },
  },

  // Chat messages
  messages: {
    userQueries: [
      'Tìm thông tin về quy chế đào tạo',
      'Quy định về xét học bổng',
      'Hướng dẫn đăng ký môn học',
      'Lịch học kỳ này',
      'Cách tính điểm trung bình',
      'Quy định về thi cử',
      'Hướng dẫn làm luận văn',
      'Thông tin về thực tập',
    ],
    botResponses: [
      'Đây là thông tin về quy chế đào tạo của trường...',
      'Theo quy định về học bổng, sinh viên cần...',
      'Để đăng ký môn học, bạn vui lòng...',
      'Lịch học kỳ này được cập nhật như sau...',
      'Điểm trung bình được tính theo công thức...',
    ],
    systemMessages: [
      'Hệ thống đang xử lý yêu cầu của bạn...',
      'Không tìm thấy thông tin phù hợp',
      'Đã xảy ra lỗi, vui lòng thử lại',
    ],
  },

  // Document citations
  citations: [
    {
      file_name: 'Quy chế đào tạo 2024.pdf',
      s3_url: 'https://storage.example.com/quy-che-dao-tao-2024.pdf',
      text_preview: 'Quy chế đào tạo của trường Đại học Bách Khoa TP.HCM áp dụng từ năm 2024...',
      source_type: 'pdf',
      page_number: 1,
      relevance_score: 0.95,
    },
    {
      file_name: 'Quy định học bổng.docx',
      s3_url: 'https://storage.example.com/quy-dinh-hoc-bong.docx',
      text_preview: 'Quy định về xét và cấp học bổng cho sinh viên đạt thành tích cao...',
      source_type: 'docx',
      page_number: 3,
      relevance_score: 0.88,
    },
    {
      file_name: 'Hướng dẫn đăng ký môn học.pdf',
      s3_url: 'https://storage.example.com/huong-dan-dang-ky-mon-hoc.pdf',
      text_preview: 'Hướng dẫn chi tiết quy trình đăng ký môn học trực tuyến...',
      source_type: 'pdf',
      page_number: 5,
      relevance_score: 0.92,
    },
  ],

  // Chat threads
  threads: [
    {
      thread_id: 'thread-1',
      title: 'Tìm thông tin học bổng',
      created_at: '2024-01-15T10:30:00Z',
      updated_at: '2024-01-15T10:45:00Z',
      last_message: 'Cảm ơn thông tin về học bổng',
      message_count: 5,
      user_id: 'user-123',
    },
    {
      thread_id: 'thread-2',
      title: 'Quy chế đào tạo',
      created_at: '2024-01-16T14:20:00Z',
      updated_at: '2024-01-16T14:35:00Z',
      last_message: 'Tôi muốn biết thêm về tín chỉ',
      message_count: 8,
      user_id: 'user-123',
    },
    {
      thread_id: 'thread-3',
      title: 'Đăng ký môn học',
      created_at: '2024-01-17T09:15:00Z',
      updated_at: '2024-01-17T09:30:00Z',
      last_message: 'Đã đăng ký xong môn học',
      message_count: 3,
      user_id: 'user-123',
    },
  ],

  // API responses
  apiResponses: {
    health: {
      status: 'healthy',
      timestamp: '2024-01-20T12:00:00Z',
      version: '1.0.0',
    },
    chatSend: {
      message: 'Đây là phản hồi từ chatbot',
      thread_id: 'new-thread-123',
      message_id: 'msg-456',
      citations: [],
      query_mode: 'normal',
      processing_time: 1.2,
    },
    chatHistory: {
      threads: [],
      total: 0,
      page: 1,
      per_page: 20,
    },
    authLogin: {
      token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
      refresh_token: 'refresh-token-123',
      expires_in: 3600,
      user: {
        id: 'user-123',
        name: 'Nguyễn Văn A',
        email: 'nguyenvana@hcmut.edu.vn',
      },
    },
    authMe: {
      id: 'user-123',
      name: 'Nguyễn Văn A',
      email: 'nguyenvana@hcmut.edu.vn',
      role: 'student',
      permissions: ['read', 'write'],
      authenticated: true,
    },
  },

  // Error responses
  errors: {
    unauthorized: {
      error: 'Unauthorized',
      message: 'Bạn cần đăng nhập để thực hiện thao tác này',
      code: 401,
    },
    forbidden: {
      error: 'Forbidden',
      message: 'Bạn không có quyền truy cập tài nguyên này',
      code: 403,
    },
    notFound: {
      error: 'Not Found',
      message: 'Không tìm thấy tài nguyên yêu cầu',
      code: 404,
    },
    rateLimit: {
      error: 'Too Many Requests',
      message: 'Bạn đã gửi quá nhiều yêu cầu, vui lòng thử lại sau',
      code: 429,
    },
    serverError: {
      error: 'Internal Server Error',
      message: 'Đã xảy ra lỗi máy chủ, vui lòng thử lại sau',
      code: 500,
    },
    messageTooLong: {
      error: 'Validation Error',
      message: 'Tin nhắn quá dài. Vui lòng nhập tối đa 5000 ký tự.',
      code: 400,
    },
  },
};

// Mock API setup helper - Auth endpoints are NOT mocked to use real system
export const setupMockApi = async (page: Page, options: {
  mockHealth?: boolean;
  mockChat?: boolean;
  mockAuth?: boolean;
  mockErrors?: boolean;
  delay?: number;
} = {}) => {
  const {
    mockHealth = true,
    mockChat = true,
    mockAuth = false, // Changed to false - use real auth
    mockErrors = false,
    delay = 0,
  } = options;

  // Health check endpoint
  if (mockHealth) {
    await page.route('**/api/health', (route: Route) => {
      setTimeout(() => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(testFixtures.apiResponses.health),
        });
      }, delay);
    });
  }

  // Chat endpoints
  if (mockChat) {
    await page.route('**/api/agent/stream**', (route: Route) => {
      setTimeout(() => {
        // SSE Response format
        const sseData = JSON.stringify({
          type: "message",
          content: {
            type: "ai",
            content: testFixtures.apiResponses.chatSend.message,
            citations: mockErrors ? [] : testFixtures.citations.slice(0, 2),
            run_id: "mock-run-id",
          }
        });

        const doneData = JSON.stringify({ type: "done" });

        route.fulfill({
          status: 200,
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          },
          body: `data: ${sseData}\n\ndata: [DONE]\n\n`,
        });
      }, delay);
    });
  }

  // Auth endpoints
  if (mockAuth) {
    await page.route('**/api/auth/login', (route: Route) => {
      setTimeout(() => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(testFixtures.apiResponses.authLogin),
        });
      }, delay);
    });

    await page.route('**/api/auth/me', (route: Route) => {
      setTimeout(() => {
        const headers = route.request().headers();
        const authHeader = headers.authorization || headers.cookie;

        if (authHeader) {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(testFixtures.apiResponses.authMe),
          });
        } else {
          route.fulfill({
            status: 401,
            contentType: 'application/json',
            body: JSON.stringify(testFixtures.errors.unauthorized),
          });
        }
      }, delay);
    });

    await page.route('**/api/auth/logout', (route: Route) => {
      setTimeout(() => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Logged out successfully' }),
        });
      }, delay);
    });
  }

  // Error scenarios
  if (mockErrors) {
    await page.route('**/api/agent/stream**', (route: Route) => {
      setTimeout(() => {
        // Trả về luồng SSE bị lỗi
        route.fulfill({
          status: 500,
          headers: {
            'Content-Type': 'text/event-stream',
          },
          body: `data: ${JSON.stringify({ type: "error", content: testFixtures.errors.serverError.message })}\n\n`,
        });
      }, delay);
    });
  }
};

// Mock voice API helper
export const setupMockVoice = async (page: Page) => {
  await page.addInitScript(() => {
    // Mock Web Speech API
    class MockSpeechRecognition {
      lang: string = 'vi-VN';
      continuous: boolean = false;
      interimResults: boolean = false;
      maxAlternatives: number = 1;
      onresult: ((event: any) => void) | null = null;
      onerror: ((event: any) => void) | null = null;
      onstart: ((event: any) => void) | null = null;
      onend: ((event: any) => void) | null = null;
      onnomatch: ((event: any) => void) | null = null;
      onsoundstart: ((event: any) => void) | null = null;
      onsoundend: ((event: any) => void) | null = null;
      onspeechstart: ((event: any) => void) | null = null;
      onspeechend: ((event: any) => void) | null = null;

      start() {
        setTimeout(() => {
          if (this.onstart) this.onstart({ type: 'start' });

          // Simulate speech recognition result after 2 seconds
          setTimeout(() => {
            if (this.onresult) {
              this.onresult({
                type: 'result',
                results: [
                  {
                    isFinal: true,
                    0: {
                      transcript: 'Tìm thông tin về quy chế đào tạo',
                      confidence: 0.95,
                    },
                  },
                ],
              });
            }

            setTimeout(() => {
              if (this.onend) this.onend({ type: 'end' });
            }, 500);
          }, 2000);
        }, 100);
      }

      stop() {
        if (this.onend) this.onend({ type: 'end' });
      }

      abort() {
        if (this.onerror) {
          this.onerror({ type: 'error', error: 'aborted' });
        }
      }
    }

    class MockSpeechSynthesisUtterance {
      text: string;
      lang: string = 'vi-VN';
      voice: any = null;
      volume: number = 1;
      rate: number = 1;
      pitch: number = 1;
      onstart: ((event: any) => void) | null = null;
      onend: ((event: any) => void) | null = null;
      onerror: ((event: any) => void) | null = null;
      onpause: ((event: any) => void) | null = null;
      onresume: ((event: any) => void) | null = null;
      onmark: ((event: any) => void) | null = null;
      onboundary: ((event: any) => void) | null = null;

      constructor(text: string) {
        this.text = text;
      }
    }

    (window as any).SpeechRecognition = MockSpeechRecognition;
    (window as any).speechSynthesis = {
      speak: (utterance: any) => {
        setTimeout(() => {
          if (utterance.onstart) utterance.onstart();
          setTimeout(() => {
            if (utterance.onend) utterance.onend();
          }, utterance.text.length * 50); // Simulate speaking time
        }, 100);
      },
      cancel: () => { },
      pause: () => { },
      resume: () => { },
      speaking: false,
      pending: false,
    };
    (window as any).SpeechSynthesisUtterance = MockSpeechSynthesisUtterance;
  });
};

// Test data generators
export const generateTestData = {
  // Generate random user query
  randomQuery: () => {
    const queries = testFixtures.messages.userQueries;
    return queries[Math.floor(Math.random() * queries.length)];
  },

  // Generate random bot response
  randomResponse: () => {
    const responses = testFixtures.messages.botResponses;
    return responses[Math.floor(Math.random() * responses.length)];
  },

  // Generate random thread
  randomThread: () => {
    const threads = testFixtures.threads;
    return threads[Math.floor(Math.random() * threads.length)];
  },

  // Generate random citation
  randomCitation: () => {
    const citations = testFixtures.citations;
    return citations[Math.floor(Math.random() * citations.length)];
  },

  // Generate random user
  randomUser: () => {
    const users = Object.values(testFixtures.users);
    return users[Math.floor(Math.random() * users.length)];
  },

  // Generate random error
  randomError: () => {
    const errors = Object.values(testFixtures.errors);
    return errors[Math.floor(Math.random() * errors.length)];
  },

  // Generate long message
  longMessage: (length = 6000) => {
    return 'Đây là một tin nhắn rất dài để test việc xử lý tin nhắn dài '.repeat(Math.ceil(length / 50)).substring(0, length);
  },

  // Generate special characters message
  specialCharsMessage: () => {
    return 'Tin nhắn với ký tự đặc biệt: !@#$%^&*()_+-=[]{}|;:,.<>? và tiếng Việt có dấu: ăâêôơưđĂÂÊÔƠƯĐ';
  },

  // Generate empty/whitespace message
  emptyMessage: () => {
    return '   \n\t   '; // Only whitespace
  },
};

// Export for use in tests
export { testFixtures as testData };
