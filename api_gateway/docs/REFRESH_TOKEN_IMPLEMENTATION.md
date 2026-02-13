# Summary: Refresh Token Storage and Revocation Implementation



## 📊 Token Lifecycle Flow

```
┌──────────────┐
│    Login     │ → Create & Store Token (with metadata)
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ Token Stored │ → Active, not revoked, has expiration
└──────┬───────┘
       │
       ├────► Refresh Token
       │      ├─ Validate in DB (not revoked, not expired)
       │      ├─ Revoke old token
       │      └─ Create & store new token
       │
       ├────► Manual Revoke
       │      └─ Set is_revoked = true
       │
       └────► Expire
              └─ Periodic cleanup removes from DB
```

## Architecture

### Design Patterns

- **Repository Pattern**: `TokenService` encapsulates all token data access
- **Single Responsibility Principle**: Each service has one clear purpose
- **Dependency Injection**: Services are injected via FastAPI's dependency system
- **Strategy Pattern**: Token validation can be extended with custom strategies

### Components

```
┌─────────────────────────────────────────────────────────────┐
│                        API Layer                             │
│  /auth/login, /auth/refresh, /auth/revoke, /auth/revoke-all │
└─────────────────────┬───────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────┐
│                   Service Layer                              │
│  AuthService (login, refresh)                                │
│  TokenService (store, validate, revoke, cleanup)             │
└─────────────────────┬───────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────┐
│                   Database Layer                             │
│  RefreshToken Model (SQLModel/SQLAlchemy)                    │
│  - token, user_id, is_revoked, expires_at                    │
│  - user_agent, ip_address (metadata)                         │
└─────────────────────────────────────────────────────────────┘
```

