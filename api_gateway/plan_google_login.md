# Kế hoạch: Đăng nhập bằng Google OAuth2 cho API Gateway

## 1. Tổng quan

Tích hợp **Google OAuth2 Login** vào hệ thống `api_gateway` hiện tại, cho phép người dùng đăng nhập bằng tài khoản Google bên cạnh phương thức email/password truyền thống.

### Luồng hoạt động (Flow)

```
┌──────────────┐       ┌───────────┐     ┌──────────────┐     ┌────────────┐     ┌──────────────┐
|Google Sign-in│──────>│  Frontend │────>│  API Gateway │────>│ Google API │────>│ Google OAuth │
|    Pop-up    │<──────│ (Next.js) │<────│  (FastAPI)   │<────│  (Verify)  │<────│   Server     │
└──────────────┘       └───────────┘     └──────────────┘     └────────────┘     └──────────────┘
```

**Phương pháp chọn: ID Token Verification (Backend-only)**

1. Frontend sử dụng Google Sign-In SDK để lấy `id_token` (credential) từ Google.
2. Frontend gửi `id_token` đến `POST /auth/google`.
3. Backend FastAPI xác minh `id_token` với Google (dùng thư viện `google-auth`).
4. Backend tạo/tìm user trong DB → issue JWT tokens (access + refresh) như hệ thống hiện tại.

> **Lý do chọn phương pháp này:** Đơn giản, an toàn, không cần redirect flow phức tạp. Frontend handle Google popup, backend chỉ verify token.

---



## 2. Các thay đổi cần thực hiện

### 2.1. Cài đặt thư viện mới

**File: `pyproject.toml`**

```toml
dependencies = [
    # ... existing deps ...
    "google-auth>=2.28.0",      # Verify Google ID tokens
    "google-auth-httplib2>=0.2.0",
]
```

---

### 2.2. Thêm cấu hình Google OAuth

**File: `src/config.py`** — Thêm các biến môi trường mới:

```python
class Settings(BaseSettings):
    # ... existing settings ...
    
    # Google OAuth2
    google_client_id: str = ""           # Google OAuth Client ID
    google_client_secret: str = ""       # Google OAuth Client Secret (optional, for server flow)
```

**File: `.env`** — Thêm biến:

```env
# Google OAuth2
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
```

---

### 2.3. Cập nhật User model

**File: `src/models/__init__.py`** — Thêm fields cho OAuth:

```python
class User(SQLModel, table=True):
    __tablename__ = "users"
    
    # ... existing fields ...
    
    # OAuth fields
    auth_provider: str = Field(default="local", max_length=20)  # "local" | "google"
    google_id: Optional[str] = Field(default=None, max_length=255, index=True)
    avatar_url: Optional[str] = Field(default=None, max_length=500)
    display_name: Optional[str] = Field(default=None, max_length=255)
    
    # Cho phép password nullable (Google users không cần password)
    hashed_password: Optional[str] = Field(default=None, max_length=255)
```

> **Lưu ý:** `hashed_password` cần đổi từ required → optional vì Google users không có password.

---

### 2.4. Tạo Alembic migration

**File: `alembic/versions/003_add_google_oauth_fields.py`**

Migration thêm các cột mới vào bảng `users`:
- `auth_provider` (VARCHAR(20), default "local")
- `google_id` (VARCHAR(255), nullable, indexed, unique)
- `avatar_url` (VARCHAR(500), nullable)
- `display_name` (VARCHAR(255), nullable)
- Cập nhật `hashed_password` thành nullable

---

### 2.5. Thêm schema cho Google Login

**File: `src/schemas/auth.py`** — Thêm schema mới:

```python
class GoogleLoginRequest(BaseModel):
    """Google OAuth login request."""
    credential: str  # Google ID token from frontend

class GoogleUserInfo(BaseModel):
    """Parsed Google user info from ID token."""
    google_id: str
    email: str
    name: Optional[str] = None
    picture: Optional[str] = None
    email_verified: bool = False
```

**File: `src/schemas/__init__.py`** — Export thêm:

```python
from src.schemas.auth import GoogleLoginRequest, GoogleUserInfo
```

---

### 2.6. Tạo Google Auth Service

**File: `src/services/google_auth_service.py`** — Service mới:

```python
"""Google OAuth2 authentication service."""
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi import HTTPException, status

from src.config import settings
from src.models import User, Role
from src.shared.auth.jwt_handler import jwt_handler
from src.schemas.auth import GoogleUserInfo, TokenResponse


class GoogleAuthService:
    """Google OAuth2 business logic."""
    
    @staticmethod
    async def verify_google_token(credential: str) -> GoogleUserInfo:
        """
        Verify Google ID token and extract user info.
        
        Raises HTTPException if token is invalid.
        """
        try:
            idinfo = id_token.verify_oauth2_token(
                credential,
                google_requests.Request(),
                settings.google_client_id
            )
            
            if idinfo["iss"] not in ["accounts.google.com", "https://accounts.google.com"]:
                raise ValueError("Wrong issuer.")
            
            return GoogleUserInfo(
                google_id=idinfo["sub"],
                email=idinfo["email"],
                name=idinfo.get("name"),
                picture=idinfo.get("picture"),
                email_verified=idinfo.get("email_verified", False),
            )
        except ValueError as e:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Invalid Google token: {str(e)}"
            )
    
    @staticmethod
    async def google_login(credential: str, db: AsyncSession) -> TokenResponse:
        """
        Full Google login flow:
        1. Verify Google ID token
        2. Find or create user
        3. Issue JWT tokens
        """
        # Step 1: Verify token
        google_user = await GoogleAuthService.verify_google_token(credential)
        
        if not google_user.email_verified:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Google email not verified"
            )
        
        # Step 2: Find existing user by google_id OR email
        result = await db.execute(
            select(User).where(
                (User.google_id == google_user.google_id) | 
                (User.email == google_user.email)
            )
        )
        user = result.scalar_one_or_none()
        
        if user:
            # User exists - update Google info if needed
            if not user.google_id:
                # Link existing account (registered via email) with Google
                user.google_id = google_user.google_id
                user.auth_provider = "google"
            if google_user.picture:
                user.avatar_url = google_user.picture
            if google_user.name:
                user.display_name = google_user.name
            await db.commit()
            await db.refresh(user)
        else:
            # Create new user from Google info
            user = User(
                email=google_user.email,
                google_id=google_user.google_id,
                auth_provider="google",
                display_name=google_user.name,
                avatar_url=google_user.picture,
                hashed_password=None,  # No password for Google users
            )
            
            # Assign default "user" role
            result = await db.execute(
                select(Role).where(Role.name == "user")
            )
            role = result.scalar_one_or_none()
            if role:
                user.roles.append(role)
            
            db.add(user)
            await db.commit()
            await db.refresh(user)
        
        # Step 3: Check if user is active
        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User account is inactive"
            )
        
        # Step 4: Issue JWT tokens
        role_names = [role.name for role in user.roles]
        
        access_token = jwt_handler.create_access_token(
            user_id=user.id,
            email=user.email,
            roles=role_names,
        )
        refresh_token = jwt_handler.create_refresh_token(
            user_id=user.id,
            email=user.email,
        )
        
        return TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            token_type="bearer",
        )


# Global instance
google_auth_service = GoogleAuthService()
```

---

### 2.7. Thêm route Google Login

**File: `src/routes/auth.py`** — Thêm endpoint:

```python
from src.schemas import GoogleLoginRequest
from src.services.google_auth_service import google_auth_service

@router.post("/google", response_model=TokenResponse)
async def google_login(
    google_data: GoogleLoginRequest,
    db: AsyncSession = Depends(get_db)
):
    """Login with Google OAuth2.
    
    Frontend sends the Google ID token (credential) received
    from Google Sign-In SDK. Backend verifies it and returns
    JWT access/refresh tokens.
    """
    tokens = await google_auth_service.google_login(google_data.credential, db)
    return tokens
```

---

### 2.8. Cập nhật Middleware

**File: `src/middleware/auth_middleware.py`** — Thêm path mới vào PUBLIC_PATHS:

```python
PUBLIC_PATHS = [
    # ... existing paths ...
    "/auth/google",       # Google OAuth login
]
```

---

### 2.9. Cập nhật validation trong `auth_service.py`

Cần cập nhật method `login()` để handle trường hợp user đăng ký bằng Google (không có password):

```python
# In login method, after finding user:
if user.auth_provider == "google" and not user.hashed_password:
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="This account uses Google Sign-In. Please login with Google."
    )
```

---

### 2.10. Cập nhật Frontend (agent-web-kit)

**Cài đặt package:**
```bash
npm install @react-oauth/google
```

**Cấu hình Google Provider:**
```tsx
// src/app/layout.tsx hoặc providers.tsx
import { GoogleOAuthProvider } from '@react-oauth/google';

<GoogleOAuthProvider clientId={process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID}>
  {children}
</GoogleOAuthProvider>
```

**Component đăng nhập:**
```tsx
import { GoogleLogin } from '@react-oauth/google';

<GoogleLogin
  onSuccess={async (credentialResponse) => {
    const res = await fetch(`${API_URL}/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential: credentialResponse.credential }),
    });
    const tokens = await res.json();
    // Store tokens (access_token, refresh_token)
  }}
  onError={() => console.log('Google Login Failed')}
/>
```

---

## 3. Thiết lập Google Cloud Console

### Bước 1: Tạo OAuth 2.0 Client ID
1. Truy cập [Google Cloud Console](https://console.cloud.google.com/)
2. Tạo project mới hoặc chọn project có sẵn
3. Vào **APIs & Services** → **Credentials**
4. Click **Create Credentials** → **OAuth 2.0 Client IDs**
5. Application type: **Web application**

### Bước 2: Cấu hình Authorized origins & redirects
```
Authorized JavaScript origins:
  - http://localhost:3000     (development frontend)
  - http://localhost:8002     (development API gateway)

Authorized redirect URIs:
  - http://localhost:3000     (frontend callback - for popup mode)
```

### Bước 3: Copy Client ID & Client Secret
- `GOOGLE_CLIENT_ID` → paste vào `.env`
- `GOOGLE_CLIENT_SECRET` → paste vào `.env`

---

## 4. Database Migration

### Tạo file migration:

```bash
cd api_gateway
uv run alembic revision --autogenerate -m "add_google_oauth_fields"
```

### Nội dung migration:

```python
"""add_google_oauth_fields"""

def upgrade() -> None:
    op.add_column('users', sa.Column('auth_provider', sa.String(20), nullable=False, server_default='local'))
    op.add_column('users', sa.Column('google_id', sa.String(255), nullable=True))
    op.add_column('users', sa.Column('avatar_url', sa.String(500), nullable=True))
    op.add_column('users', sa.Column('display_name', sa.String(255), nullable=True))
    
    # Make hashed_password nullable (for Google users)
    op.alter_column('users', 'hashed_password', nullable=True)
    
    # Add unique index on google_id
    op.create_index('ix_users_google_id', 'users', ['google_id'], unique=True)

def downgrade() -> None:
    op.drop_index('ix_users_google_id', 'users')
    op.alter_column('users', 'hashed_password', nullable=False)
    op.drop_column('users', 'display_name')
    op.drop_column('users', 'avatar_url')
    op.drop_column('users', 'google_id')
    op.drop_column('users', 'auth_provider')
```

---

## 5. Tóm tắt files cần thay đổi/tạo mới

| File | Hành động | Mô tả |
|------|-----------|-------|
| `pyproject.toml` | **Sửa** | Thêm `google-auth`, `google-auth-httplib2` |
| `.env` | **Sửa** | Thêm `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| `src/config.py` | **Sửa** | Thêm `google_client_id`, `google_client_secret` |
| `src/models/__init__.py` | **Sửa** | Thêm fields: `auth_provider`, `google_id`, `avatar_url`, `display_name`; `hashed_password` → nullable |
| `src/schemas/auth.py` | **Sửa** | Thêm `GoogleLoginRequest`, `GoogleUserInfo` |
| `src/schemas/__init__.py` | **Sửa** | Export schemas mới |
| `src/services/google_auth_service.py` | **Tạo mới** | Service verify Google token + login |
| `src/routes/auth.py` | **Sửa** | Thêm `POST /auth/google` endpoint |
| `src/middleware/auth_middleware.py` | **Sửa** | Thêm `/auth/google` vào `PUBLIC_PATHS` |
| `src/services/auth_service.py` | **Sửa** | Handle user Google khi login email/password |
| `alembic/versions/003_*.py` | **Tạo mới** | Migration thêm OAuth fields |

---

## 6. Thứ tự thực hiện

```
1. Setup Google Cloud Console → lấy Client ID & Secret
2. Cài thư viện: google-auth
3. Cập nhật config (.env, config.py)
4. Cập nhật User model (thêm OAuth fields)
5. Tạo Alembic migration + chạy migrate
6. Tạo schemas mới (GoogleLoginRequest, GoogleUserInfo)
7. Tạo GoogleAuthService
8. Thêm route POST /auth/google
9. Cập nhật middleware (PUBLIC_PATHS)
10. Cập nhật auth_service.py (handle Google users)
11. Frontend: Cài @react-oauth/google + tạo Google Login component
12. Test end-to-end
```

---

## 7. Lưu ý bảo mật

- **Luôn verify `id_token` ở backend** — không trust frontend data.
- **Check `email_verified`** — chỉ chấp nhận email đã xác minh từ Google.
- **Validate `iss` (issuer)** — đảm bảo token đến từ Google.
- **Validate `aud` (audience)** — đảm bảo token được issue cho đúng Client ID của mình.
- **Account linking** — Khi user có email trùng, link Google account vào account hiện tại thay vì tạo mới.
- **Google users không thể login bằng email/password** — trả lỗi rõ ràng khi user Google cố login bằng form.

---
# Kiến trúc


## 8. Tích hợp với hệ thống hiện có

### 8.1. Ảnh hưởng đến Email/Password Login

| Điểm | Email/Password hiện tại | Google OAuth mới | Ảnh hưởng |
|------|------------------------|------------------|----------|
| **Password** | Bắt buộc (required) | Tùy chọn (nullable) | ⚠️ **Cần cập nhật DB schema** - `hashed_password` phải allow NULL |
| **Registration** | Email + Password form | Google Sign-In popup | ✅ Tách biệt, không xung đột |
| **Login route** | `POST /auth/login` | `POST /auth/google` | ✅ Thêm endpoint mới |
| **JWT tokens** | Chứa roles | Chứa roles (same format) | ✅ 100% tương thích |
| **Middleware** | JWT extract từ header | JWT extract từ header | ✅ Không thay đổi |

**Validation cần thêm trong `auth_service.py`:**

```python
@staticmethod
async def login(email: str, password: str, db: AsyncSession) -> TokenResponse:
    # ... find user ...
    
    # ⚠️ NEW: Kiểm tra nếu user đã link Google
    if user.auth_provider == "google" and not user.hashed_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This account uses Google Sign-In. Please login with Google."
        )
    
    # ... continue verify password ...
```

### 8.2. Tích hợp với phân quyền (RBAC) hiện có

**✅ Hoàn toàn tương thích** - Google users dùng cùng hệ thống role-based access control:

| Feature | Email/Password | Google OAuth | Tương thích? |
|---------|----------------|--------------|-------------|
| **Role assignment** | "user" default | "user" default | ✅ 100% |
| **JWT token format** | Contains roles | Contains roles | ✅ 100% |
| **Middleware extract** | Via JWT | Via JWT | ✅ 100% |
| **`require_roles()`** | Hoạt động | Hoạt động | ✅ 100% |
| **`require_ownership()`** | Hoạt động | Hoạt động | ✅ 100% |
| **Admin bypass** | Có | Có | ✅ 100% |

**Quy trình gán role:**

```python
# In google_auth_service.py
# Assign default "user" role (same as email/password registration)
result = await db.execute(select(Role).where(Role.name == "user"))
role = result.scalar_one_or_none()
if role:
    user.roles.append(role)  # ← SAME logic
```

---

## 9. Refresh Token & Revocation Integration

### 9.1. Tích hợp với Refresh Token hiện có

**✅ 100% tương thích** - Google login sử dụng cùng `RefreshToken` table và logic:

```python
# In google_auth_service.py - Cần thêm vào

from src.services.token_service import token_service

@staticmethod
async def google_login(credential: str, db: AsyncSession,
                      user_agent: Optional[str] = None,
                      ip_address: Optional[str] = None) -> TokenResponse:
    # ... verify token, find/create user ...
    
    # ✅ CREATE JWT tokens (same as email login)
    role_names = [role.name for role in user.roles]
    
    access_token = jwt_handler.create_access_token(
        user_id=user.id,
        email=user.email,
        roles=role_names,
    )
    
    # ✅ CREATE refresh token with expiry
    refresh_token, expires_at = jwt_handler.create_refresh_token_with_expiry(
        user_id=user.id,
        email=user.email,
    )
    
    # ✅ STORE refresh token (same as email login)
    await token_service.store_refresh_token(
        token=refresh_token,
        user_id=user.id,
        expires_at=expires_at,
        db=db,
        user_agent=user_agent,
        ip_address=ip_address,
        auto_commit=True,
    )
    
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
    )
```

### 9.2. Endpoint chung cho cả Email và Google users

```bash
# Login (different endpoints)
POST /auth/login          # Email/password only
POST /auth/google         # Google only

# Refresh (SAME endpoint - works for both)
POST /auth/refresh        # ✅ Works for both email + google users

# Revoke (SAME endpoint - works for both)
POST /auth/revoke         # ✅ Revoke specific token (both methods)
POST /auth/revoke-all     # ✅ Revoke all devices (both methods)
```

### 9.3. Cập nhật route `/auth/google`

**Cần thêm extraction của `user_agent` và `ip_address`:**

```python
# In src/routes/auth.py

@router.post("/google", response_model=TokenResponse)
async def google_login(
    google_data: GoogleLoginRequest,
    request: Request,  # ← Thêm parameter này
    db: AsyncSession = Depends(get_db)
):
    """Login with Google OAuth2."""
    user_agent, ip_address = get_client_info(request)  # ← Extract metadata
    
    tokens = await google_auth_service.google_login(
        google_data.credential,
        db,
        user_agent=user_agent,      # ← Pass metadata
        ip_address=ip_address        # ← Pass metadata
    )
    return tokens
```

---

## 10. Account Linking & Repeat Login

### 10.1. Kiến trúc Database

**✅ Khuyến nghị: Unified User Model** (1 bảng cho cả email + Google users)

```python
class User(SQLModel, table=True):
    """Unified user model for all auth methods"""
    
    # Core fields
    id: str = Primary Key
    email: str = unique, indexed
    
    # Password for local auth (nullable for OAuth users)
    hashed_password: Optional[str] = None  # ← NULL for Google users
    
    # OAuth fields
    auth_provider: str = "local" | "google" | "both"
    google_id: Optional[str] = unique, indexed
    google_email_verified: bool = False
    
    # User profile (from OAuth or manual)
    avatar_url: Optional[str] = None
    display_name: Optional[str] = None
    
    # Metadata
    is_active: bool = True
    roles: List[Role] = Relationship(...)
```

**Lý do chọn cách này:**
- ✅ Đơn giản - 1 query thay vì JOIN
- ✅ Dễ maintain - Thêm provider mới chỉ cần thêm columns
- ✅ Account linking dễ dàng - Chỉ UPDATE 1 record
- ✅ Industry standard - Firebase, Auth0, Supabase đều dùng cách này

### 10.2. So sánh: Lần đầu vs Lần sau Login

| Giai đoạn | Lần 1 (First Login) | Lần 2+ (Repeat Login) |
|-----------|---------------------|----------------------|
| **1. Verify token** | ✓ Verify Google token | ✓ Verify Google token |
| **2. SELECT query** | `WHERE google_id OR email` → **NULL** | `WHERE google_id OR email` → **FOUND** |
| **3. DB operation** | **INSERT** user (CREATE) | **UPDATE** user (MODIFY) |
| **4. Fields updated** | All fields | avatar_url, display_name (if changed) |
| **5. auth_provider** | Set = "google" | Already = "google", skip |
| **6. google_id** | Set = "sub_123" | Already set, skip |
| **7. Role assignment** | **INSERT** role link | **SKIP** (already has role) |
| **8. is_active check** | ✓ Check | ✓ Check |
| **9. JWT creation** | ✓ Create NEW tokens | ✓ Create NEW tokens |
| **10. Refresh token** | **INSERT** new token | **INSERT** new token |
| **Total DB operations** | 3-4 INSERTs | 1-2 UPDATEs + 1 INSERT |
| **Performance** | Baseline | ⚡ ~40-50% faster |

### 10.3. Account Linking (Email → Google)

**Trường hợp:** User đã đăng ký bằng email/password, giờ login lần đầu bằng Google (cùng email)

```python
# Lần 1: User registered via email/password
user = User(
    email='john@gmail.com',
    hashed_password='bcrypt$...',
    auth_provider='local',
    google_id=None
)

# Lần 2: Same user login with Google (first time)
google_user = { email: 'john@gmail.com', google_id: 'sub_123', ... }

# SELECT User WHERE google_id='sub_123' OR email='john@gmail.com'
# → FOUND! (matched by email)

if not user.google_id:  # ← True (chưa có google_id)
    # 🔗 LINK Google account to existing user
    user.google_id = 'sub_123'
    user.auth_provider = 'google'  # or 'both' if keep password
    user.avatar_url = google_user.picture
    user.display_name = google_user.name
    # → User can now login via BOTH email/password AND Google
```

### 10.4. Token Generation mỗi lần Login

**✅ MỖI LẦN LOGIN = MỚI SET TOKENS MỚI**

```
Lần 1: POST /auth/google
  → CREATE access_token_1 + refresh_token_1
  → Store refresh_token_1 in DB

Lần 2: POST /auth/google  (1 tuần sau)
  → CREATE access_token_2 + refresh_token_2  (NEW!)
  → Store refresh_token_2 in DB
  → refresh_token_1 vẫn tồn tại (có thể revoke riêng)

Lần 3: POST /auth/google  (1 tháng sau)
  → CREATE access_token_3 + refresh_token_3  (NEW!)
  → Store refresh_token_3 in DB
  → All previous tokens still valid (unless revoked/expired)
```

**Database state sau 3 lần login:**

```sql
| id | token | user_id  | expires_at | is_revoked | created_at |
|----|-------|----------|------------|-----------|------------|
| 1  | jwt1  | user-123 | 2026-02-20 | false     | 2026-02-13 | ← Lần 1
| 2  | jwt2  | user-123 | 2026-02-27 | false     | 2026-02-20 | ← Lần 2
| 3  | jwt3  | user-123 | 2026-03-20 | false     | 2026-03-13 | ← Lần 3
```

---

## 11. FAQ - Câu hỏi thường gặp

### Q1: Có nên lưu user Google và user email/password chung 1 bảng?

**A:** ✅ **CÓ - Khuyến nghị dùng Unified Model**

**Lý do:**
- Đơn giản hơn (1 query, không JOIN)
- Dễ maintain và mở rộng (thêm Facebook, GitHub, ...)
- Account linking dễ dàng (UPDATE 1 record)
- Industry standard (Firebase, Auth0, Okta đều dùng)

### Q2: Kế hoạch mới có tương thích với refresh token & revocation?

**A:** ✅ **CÓ - 100% tương thích**

Google users sử dụng:
- ✅ Cùng `RefreshToken` table
- ✅ Cùng `TokenService` logic
- ✅ Cùng endpoints `/auth/refresh`, `/auth/revoke`
- ✅ Không cần modify code hiện có

### Q3: Lần sau đăng nhập có gì khác với lần đầu?

**A:** **Khác biệt quan trọng:**

| Aspect | Lần 1 | Lần 2+ |
|--------|------|--------|
| User record | **CREATE** new | **FIND** existing + UPDATE |
| Role assignment | **INSERT** role | **SKIP** (already has) |
| Performance | Baseline | 40-50% nhanh hơn |
| Token generation | ✓ NEW tokens | ✓ NEW tokens (same) |

### Q4: Lần sau có tạo access token và refresh token mới không?

**A:** ✅ **CÓ - MỖI lần login = MỚI set tokens mới**

- Access token: NEW (15 min expiry)
- Refresh token: NEW (7 days expiry) → INSERT vào DB
- Tokens cũ KHÔNG bị xoá, có thể revoke riêng

### Q5: Google login có ảnh hưởng đến email/password login?

**A:** ⚠️ **Có ảnh hưởng NHỎ:**

**Thay đổi cần thiết:**
1. `hashed_password` → nullable (cho Google users)
2. Validation trong `auth_service.py` (prevent Google users login via password)
3. Migration để thêm OAuth fields

**Không ảnh hưởng:**
- Existing email/password users vẫn hoạt động bình thường
- JWT format giống nhau
- Middleware không thay đổi

### Q6: Có thể login cả email/password VÀ Google không?

**A:** ✅ **CÓ - Thông qua Account Linking**

Khi user đã đăng ký email, sau đó login Google (cùng email):
- System tự động link `google_id` vào user hiện tại
- User có thể login bằng CẢ 2 cách
- `auth_provider` có thể set = `"both"`

### Q7: Làm sao để logout khỏi tất cả devices?

**A:** Gọi endpoint `POST /auth/revoke-all`

```bash
POST /auth/revoke-all
Authorization: Bearer <access_token>

# Response
{
  "message": "All tokens revoked successfully",
  "tokens_revoked": 3
}
```

→ Tất cả refresh tokens của user bị revoke, phải login lại.

### Q8: Token cũ có bị xoá tự động không?

**A:** ❌ **KHÔNG tự động**

- Tokens cũ vẫn tồn tại, valid cho đến khi expired hoặc revoked
- Cleanup expired tokens: chạy script `cleanup_expired_tokens.py` periodically
- Có thể revoke manual bằng `POST /auth/revoke`

### Q9: Performance: Lần 1 vs Lần 2?

**A:** Lần 2+ **nhanh hơn ~40-50%**

```
Lần 1: 2-3 SELECTs + 3-4 INSERTs
Lần 2+: 1 SELECT + 1-2 UPDATEs
```

### Q10: Có cần thêm migration mới không?

**A:** ✅ **CÓ - Migration `004_add_google_oauth_fields.py`**

Thêm columns:
- `auth_provider` (VARCHAR(20), default "local")
- `google_id` (VARCHAR(255), nullable, unique index)
- `avatar_url` (VARCHAR(500), nullable)
- `display_name` (VARCHAR(255), nullable)
- `hashed_password` → ALTER nullable=True
