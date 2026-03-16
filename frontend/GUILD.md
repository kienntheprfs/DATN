# Hướng Dẫn Tùy Chỉnh NextChat Toàn Diện

## Cài Đặt và Chuẩn Bị

### Yêu cầu
- Node.js >= 18

### Bắt đầu

1. **Clone repository**
   ```bash
   git clone https://github.com/ChatGPTNextWeb/ChatGPT-Next-Web.git
   cd ChatGPT-Next-Web
   ```

2. **Cài đặt dependencies**
   ```bash
   npm install
   ```

3. **Tạo file môi trường**
   ```bash
   cp .env.example .env.local
   ```

4. **Chạy development server**
   ```bash
   npm run dev
   ```

### Cấu hình biến môi trường cơ bản

File `.env.local`:
```env
OPENAI_API_KEY=your_api_key_here
CODE=your_access_password
```

## Tùy Chỉnh Theme

### 1. Sửa Colors và CSS Variables

Theme được định nghĩa trong `app/styles/globals.scss` với 2 mixins chính:

```scss
@mixin light {
  --theme: light;
  --white: white;
  --black: rgb(48, 48, 48);
  --primary: rgb(29, 147, 171);
  --second: rgb(231, 248, 255);
  --hover-color: #f3f3f3;
  --bar-color: rgba(0, 0, 0, 0.1);
  --theme-color: var(--gray);
  --shadow: 50px 50px 100px 10px rgb(0, 0, 0, 0.1);
  --card-shadow: 0px 2px 4px 0px rgb(0, 0, 0, 0.05);
  --border-in-light: 1px solid rgb(222, 222, 222);
}

@mixin dark {
  --theme: dark;
  --white: rgb(30, 30, 30);
  --black: rgb(187, 187, 187);
  --gray: rgb(21, 21, 21);
  --primary: rgb(29, 147, 171);
  --second: rgb(27 38 42);
  --hover-color: #323232;
  --bar-color: rgba(255, 255, 255, 0.1);
  --border-in-light: 1px solid rgba(255, 255, 255, 0.192);
  --theme-color: var(--gray);
}
```

### 2. Logic chuyển theme

Function `useSwitchTheme()` trong `app/components/home.tsx` xử lý việc chuyển theme.

### 3. State management

Theme enum và default config trong `app/store/config.ts`

### 4. Thêm theme mới

- Thêm enum value trong `app/store/config.ts`
- Thêm mixin mới trong `app/styles/globals.scss`
- Cập nhật `useSwitchTheme()` function
- Thêm option trong UI settings

## Tích Hợp Agent Backend Riêng

### 1. Tạo Provider Class

```typescript
// app/client/platforms/myagent.ts
export class MyAgentApi implements LLMApi {
  path(path: string): string {
    return "https://your-backend.com" + path;
  }

  async chat(options: ChatOptions): Promise<void> {
    const requestPayload = {
      messages: options.messages,
      model: options.config.model,
    };

    const response = await fetch(this.path("/chat"), {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(requestPayload),
    });

    options.onFinish?.(response.data, response);
  }

  extractMessage(res: any) {
    return res.response || "";
  }

  speech(options: SpeechOptions): Promise<ArrayBuffer> {
    throw new Error("Method not implemented.");
  }

  usage(): Promise<LLMUsage> {
    return { used: 0, total: 0 };
  }

  models(): Promise<LLMModel[]> {
    return [];
  }
}
```

### 2. Đăng ký Provider

Thêm provider vào ClientApi class trong `app/client/api.ts`:

```typescript
// Thêm import
import { MyAgentApi } from "./platforms/myagent";

// Thêm enum value
export enum ModelProvider {
  // ... existing providers
  MyAgent = "myagent",
}

// Thêm vào switch statement
case ModelProvider.MyAgent:
  this.llm = new MyAgentApi();
  break;
```

### 3. Thêm API Route

```typescript
// app/api/myagent/[...path]/route.ts
export async function POST(req: NextRequest) {
  const response = await fetch("https://your-backend.com" + path, {
    method: req.method,
    headers: {
      ...Object.fromEntries(req.headers),
    },
    body: req.body,
  });

  return response;
}
```

## Thêm Trang Mới

### 1. Tạo Route trong App Directory

```
app/
├── my-new-page/
│   └── page.tsx
├── another-page/
│   └── page.tsx
└── layout.tsx
```

### 2. Ví dụ tạo trang Dashboard

```typescript
// app/dashboard/page.tsx
export default function Dashboard() {
  return (
    <div>
      <h1>Dashboard</h1>
      {/* Nội dung dashboard */}
    </div>
  );
}
```

### 3. Cập nhật Path Enum

Thêm path mới vào `app/constant.ts`:

```typescript
export enum Path {
  // ... existing paths
  Dashboard = "/dashboard",
  MyNewPage = "/my-new-page",
}
```

### 4. Thêm Navigation

Cập nhật navigation trong `app/components/home.tsx` hoặc component sidebar:

```typescript
<Link href="/dashboard">Dashboard</Link>
```

## Hệ Thống Authentication

### 1. Authentication hiện tại

NextChat có hệ thống authentication đơn giản:

- Sử dụng environment variable `CODE` để đặt password [3](#0-2) 
- User nhập access code tại trang `/auth`
- Auth middleware trong `app/api/auth.ts` kiểm tra mọi request

### 2. Tích hợp Authentication System riêng

#### a. Tạo Auth API Routes

```typescript
// app/api/auth/login/route.ts
export async function POST(req: NextRequest) {
  const { email, password } = await req.json();
  
  const response = await fetch('https://your-auth-backend.com/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  
  const data = await response.json();
  
  if (data.success) {
    cookies().set('token', data.token, {   
      httpOnly: true,   
      secure: true,
      sameSite: 'strict'
    });
  }
  
  return Response.json(data);
}
```

#### b. Update Auth Component

Cập nhật `app/components/auth.tsx` để thêm form đăng nhập/đăng ký. 

#### c. Update Auth Middleware

Sửa `app/api/auth.ts` để check JWT token

#### d. Route Protection Middleware

```typescript
// middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  const token = req.cookies.get('token')?.value;
  const isAuthPage = req.nextUrl.pathname.startsWith('/auth');
  
  if (!token && !isAuthPage) {
    return NextResponse.redirect(new URL('/auth', req.url));
  }
  
  if (token && isAuthPage) {
    return NextResponse.redirect(new URL('/chat', req.url));
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)']
};
```

## Thêm Dịch Vụ Bản Đồ và Quản Lý Tri Thức

### 1. Thêm Trang Bản Đồ

```typescript
// app/map/page.tsx
export default function MapPage() {
  return (
    <div>
      <h1>Bản Đồ</h1>
      {/* Integrations: Google Maps, OpenStreetMap, etc */}
    </div>
  );
}
```

### 2. Thêm Trang Quản Lý Tri Thức

```typescript
// app/knowledge/page.tsx
export default function KnowledgePage() {
  return (
    <div>
      <h1>Quản Lý Tri Thức</h1>
      {/* Knowledge base features */}
    </div>
  );
}
```

### 3. Cập nhật Navigation

Cập nhật sidebar trong `app/components/sidebar.tsx` [5](#0-4) :

```typescript
<IconButton
  icon={<MapIcon />}
  text={shouldNarrow ? undefined : "Bản Đồ"}
  className={styles["sidebar-bar-button"]}
  onClick={() => navigate(Path.Map)}
  shadow
/>
<IconButton
  icon={<KnowledgeIcon />}
  text={shouldNarrow ? undefined : "Tri Thức"}
  className={styles["sidebar-bar-button"]}
  onClick={() => navigate(Path.Knowledge)}
  shadow
/>
```

### 4. Sử dụng Plugin System

NextChat đã có sẵn plugin system. Tạo plugins cho:

#### Map Plugin

```typescript
// app/plugins/map.ts
export const mapPlugin = {
  name: "Map Service",
  methods: [
    {
      name: "search_location",
      description: "Search for a location",
      parameters: { query: "string" }
    },
    {
      name: "get_directions",
      description: "Get directions between two points",
      parameters: { from: "string", to: "string" }
    }
  ]
};
```

#### Knowledge Plugin

```typescript
// app/plugins/knowledge.ts
export const knowledgePlugin = {
  name: "Knowledge Base",
  methods: [
    {
      name: "search_knowledge",
      description: "Search in knowledge base",
      parameters: { query: "string" }
    },
    {
      name: "add_knowledge",
      description: "Add new knowledge",
      parameters: { title: "string", content: "string" }
    }
  ]
};
```

### 5. State Management

```typescript
// app/store/map.ts
import { create } from "zustand";

interface MapStore {
  locations: any[];
  currentLocation: any;
  setLocations: (locations: any[]) => void;
}

export const useMapStore = create<MapStore>((set) => ({
  locations: [],
  currentLocation: null,
  setLocations: (locations) => set({ locations }),
}));
```

### 6. Integration với MCP

Sử dụng MCP system để AI tương tác với các dịch vụ

## Notes

- NextChat sử dụng kiến trúc module hóa, dễ dàng mở rộng
- State management dùng Zustand với persistence
- Theme system sử dụng CSS variables
- Plugin system cho phép tích hợp external APIs
- MCP (Model Context Protocol) enables AI tool interaction
- Authentication có thể mở rộng với JWT
- Tất cả components có thể tái sử dụng

Để phát triển local:
```bash
npm install
npm run dev
```

Wiki pages you might want to explore:
- [Environment Configuration (ChatGPTNextWeb/NextChat)](/wiki/ChatGPTNextWeb/NextChat#2.2)

### Citations

**File:** app/components/home.tsx (L85-114)
```typescript
export function useSwitchTheme() {
  const config = useAppConfig();

  useEffect(() => {
    document.body.classList.remove("light");
    document.body.classList.remove("dark");

    if (config.theme === "dark") {
      document.body.classList.add("dark");
    } else if (config.theme === "light") {
      document.body.classList.add("light");
    }

    const metaDescriptionDark = document.querySelector(
      'meta[name="theme-color"][media*="dark"]',
    );
    const metaDescriptionLight = document.querySelector(
      'meta[name="theme-color"][media*="light"]',
    );

    if (config.theme === "auto") {
      metaDescriptionDark?.setAttribute("content", "#151515");
      metaDescriptionLight?.setAttribute("content", "#fafafa");
    } else {
      const themeColor = getCSSVar("--theme-color");
      metaDescriptionDark?.setAttribute("content", themeColor);
      metaDescriptionLight?.setAttribute("content", themeColor);
    }
  }, [config.theme]);
}
```

**File:** app/client/api.ts (L136-183)
```typescript
export class ClientApi {
  public llm: LLMApi;

  constructor(provider: ModelProvider = ModelProvider.GPT) {
    switch (provider) {
      case ModelProvider.GeminiPro:
        this.llm = new GeminiProApi();
        break;
      case ModelProvider.Claude:
        this.llm = new ClaudeApi();
        break;
      case ModelProvider.Ernie:
        this.llm = new ErnieApi();
        break;
      case ModelProvider.Doubao:
        this.llm = new DoubaoApi();
        break;
      case ModelProvider.Qwen:
        this.llm = new QwenApi();
        break;
      case ModelProvider.Hunyuan:
        this.llm = new HunyuanApi();
        break;
      case ModelProvider.Moonshot:
        this.llm = new MoonshotApi();
        break;
      case ModelProvider.Iflytek:
        this.llm = new SparkApi();
        break;
      case ModelProvider.DeepSeek:
        this.llm = new DeepSeekApi();
        break;
      case ModelProvider.XAI:
        this.llm = new XAIApi();
        break;
      case ModelProvider.ChatGLM:
        this.llm = new ChatGLMApi();
        break;
      case ModelProvider.SiliconFlow:
        this.llm = new SiliconflowApi();
        break;
      case ModelProvider["302.AI"]:
        this.llm = new Ai302Api();
        break;
      default:
        this.llm = new ChatGPTApi();
    }
  }
```

**File:** README.md (L165-171)
```markdown
This project provides limited access control. Please add an environment variable named `CODE` on the vercel environment variables page. The value should be passwords separated by comma like this:

```
code1,code2,code3
```

After adding or modifying this environment variable, please redeploy the project for the changes to take effect.
```

**File:** app/components/auth.tsx (L1-128)
```typescript
import styles from "./auth.module.scss";
import { IconButton } from "./button";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Path, SAAS_CHAT_URL } from "../constant";
import { useAccessStore } from "../store";
import Locale from "../locales";
import Delete from "../icons/close.svg";
import Arrow from "../icons/arrow.svg";
import Logo from "../icons/logo.svg";
import { useMobileScreen } from "@/app/utils";
import BotIcon from "../icons/bot.svg";
import { getClientConfig } from "../config/client";
import { PasswordInput } from "./ui-lib";
import LeftIcon from "@/app/icons/left.svg";
import { safeLocalStorage } from "@/app/utils";
import {
  trackSettingsPageGuideToCPaymentClick,
  trackAuthorizationPageButtonToCPaymentClick,
} from "../utils/auth-settings-events";
import clsx from "clsx";

const storage = safeLocalStorage();

export function AuthPage() {
  const navigate = useNavigate();
  const accessStore = useAccessStore();
  const goHome = () => navigate(Path.Home);
  const goChat = () => navigate(Path.Chat);
  const goSaas = () => {
    trackAuthorizationPageButtonToCPaymentClick();
    window.location.href = SAAS_CHAT_URL;
  };

  const resetAccessCode = () => {
    accessStore.update((access) => {
      access.openaiApiKey = "";
      access.accessCode = "";
    });
  }; // Reset access code to empty string

  useEffect(() => {
    if (getClientConfig()?.isApp) {
      navigate(Path.Settings);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={styles["auth-page"]}>
      <TopBanner></TopBanner>
      <div className={styles["auth-header"]}>
        <IconButton
          icon={<LeftIcon />}
          text={Locale.Auth.Return}
          onClick={() => navigate(Path.Home)}
        ></IconButton>
      </div>
      <div className={clsx("no-dark", styles["auth-logo"])}>
        <BotIcon />
      </div>

      <div className={styles["auth-title"]}>{Locale.Auth.Title}</div>
      <div className={styles["auth-tips"]}>{Locale.Auth.Tips}</div>

      <PasswordInput
        style={{ marginTop: "3vh", marginBottom: "3vh" }}
        aria={Locale.Settings.ShowPassword}
        aria-label={Locale.Auth.Input}
        value={accessStore.accessCode}
        type="text"
        placeholder={Locale.Auth.Input}
        onChange={(e) => {
          accessStore.update(
            (access) => (access.accessCode = e.currentTarget.value),
          );
        }}
      />

      {!accessStore.hideUserApiKey ? (
        <>
          <div className={styles["auth-tips"]}>{Locale.Auth.SubTips}</div>
          <PasswordInput
            style={{ marginTop: "3vh", marginBottom: "3vh" }}
            aria={Locale.Settings.ShowPassword}
            aria-label={Locale.Settings.Access.OpenAI.ApiKey.Placeholder}
            value={accessStore.openaiApiKey}
            type="text"
            placeholder={Locale.Settings.Access.OpenAI.ApiKey.Placeholder}
            onChange={(e) => {
              accessStore.update(
                (access) => (access.openaiApiKey = e.currentTarget.value),
              );
            }}
          />
          <PasswordInput
            style={{ marginTop: "3vh", marginBottom: "3vh" }}
            aria={Locale.Settings.ShowPassword}
            aria-label={Locale.Settings.Access.Google.ApiKey.Placeholder}
            value={accessStore.googleApiKey}
            type="text"
            placeholder={Locale.Settings.Access.Google.ApiKey.Placeholder}
            onChange={(e) => {
              accessStore.update(
                (access) => (access.googleApiKey = e.currentTarget.value),
              );
            }}
          />
        </>
      ) : null}

      <div className={styles["auth-actions"]}>
        <IconButton
          text={Locale.Auth.Confirm}
          type="primary"
          onClick={goChat}
        />
        <IconButton
          text={Locale.Auth.SaasTips}
          onClick={() => {
            goSaas();
          }}
        />
      </div>
    </div>
  );
}

```

**File:** app/components/sidebar.tsx (L308-366)
```typescript
      <SideBarBody
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            navigate(Path.Home);
          }
        }}
      >
        <ChatList narrow={shouldNarrow} />
      </SideBarBody>
      <SideBarTail
        primaryAction={
          <>
            <div className={clsx(styles["sidebar-action"], styles.mobile)}>
              <IconButton
                icon={<DeleteIcon />}
                onClick={async () => {
                  if (await showConfirm(Locale.Home.DeleteChat)) {
                    chatStore.deleteSession(chatStore.currentSessionIndex);
                  }
                }}
              />
            </div>
            <div className={styles["sidebar-action"]}>
              <Link to={Path.Settings}>
                <IconButton
                  aria={Locale.Settings.Title}
                  icon={<SettingsIcon />}
                  shadow
                />
              </Link>
            </div>
            <div className={styles["sidebar-action"]}>
              <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
                <IconButton
                  aria={Locale.Export.MessageFromChatGPT}
                  icon={<GithubIcon />}
                  shadow
                />
              </a>
            </div>
          </>
        }
        secondaryAction={
          <IconButton
            icon={<AddIcon />}
            text={shouldNarrow ? undefined : Locale.Home.NewChat}
            onClick={() => {
              if (config.dontShowMaskSplashScreen) {
                chatStore.newSession();
                navigate(Path.Chat);
              } else {
                navigate(Path.NewChat);
              }
            }}
            shadow
          />
        }
      />
    </SideBarContainer>
```
WikiPage: https://deepwiki.com/ChatGPTNextWeb/NextChat/2.2-environment-configuration