# PlantUML Activity Diagrams for DATN Chatbot System

## Tổng quan

Documentation này chứa các PlantUML activity diagrams chi tiết để mô tả các luồng xử lý trong hệ thống DATN Chatbot. PlantUML hỗ trợ visualization tốt hơn cho complex system flows so với Mermaid.

## Table of Contents

1. [Complete System Architecture](#1-complete-system-architecture)
2. [User Registration & Login Activity](#2-user-registration--login-activity)
3. [Chat Interaction Activity](#3-chat-interaction-activity)
4. [Voice Chat Activity](#4-voice-chat-activity)
5. [Document Upload Activity](#5-document-upload-activity)
6. [Knowledge Search Activity](#6-knowledge-search-activity)
7. [Rating & Feedback Activity](#7-rating--feedback-activity)
8. [Indoor Navigation Activity](#8-indoor-navigation-activity)
9. [Admin Dashboard Activity](#9-admin-dashboard-activity)
10. [Error Handling Activity](#10-error-handling-activity)
11. [Service Health Check Activity](#11-service-health-check-activity)
12. [Microservices Communication Flow](#12-microservices-communication-flow)

---

## 1. Complete System Architecture

### PlantUML Architecture Diagram

```plantuml
@startuml CompleteSystemArchitecture
!theme plain
skinparam ParticipantPadding 20
skinparam BoxPadding 20
skinparam shadowing false

title DATN Chatbot Complete System Architecture

actor User as "👤 User"
participant "🌐 Frontend\n(Next.js)\nPort: 3000" as FE
participant "🚪 API Gateway\n(FastAPI)\nPort: 8008" as GW
participant "🤖 Agent Service\n(LangGraph)\nPort: 8080" as AS
participant "📚 Knowledge Base\n(FastAPI)\nPort: 8000" as KB
participant "🗺️ Wayfinder\n(FastAPI)\nPort: 8004" as WF
participant "📊 Dashboard\n(FastAPI)\nPort: 8007" as DB
participant "🎤 Voice Service\n(FastAPI)\nPort: 7860" as VS
participant "🔊 Piper TTS\n(Uvicorn)\nPort: 5000" as TTS

database "🗄️ PostgreSQL\n(5432-5435)" as PG
database "🔍 Vector DB\n(Qdrant)\nPort: 6333" as VDB
database "⚡ Redis\nCache/Queue\nPort: 6379" as REDIS
participant "🧠 LLM APIs\n(OpenAI/Anthropic)" as LLM

== User Authentication Flow ==
User -> FE: Access application
FE -> GW: POST /auth/login
GW -> PG: Validate credentials
PG --> GW: User data + JWT
GW --> FE: JWT token
FE -> FE: Store in localStorage

== Main Chat Flow ==
User -> FE: Send message
FE -> GW: POST /agent/{agent_id}/invoke
GW -> GW: Validate JWT
GW -> AS: Forward request

AS -> KB: Search knowledge
KB -> VDB: Vector search
VDB --> KB: Relevant docs
KB --> AS: Context

AS -> LLM: Generate response
LLM --> AS: AI response
AS -> DB: Log interaction
AS --> GW: Response

GW --> FE: AI response
FE -> FE: Update UI
FE --> User: Display answer

== Voice Interaction Flow ==
User -> FE: Click microphone
FE -> VS: WebRTC audio stream
VS -> VS: STT processing
VS --> FE: Text transcript

FE -> GW: Send as chat message
GW -> AS: Process normally
AS -> GW: Text response
GW -> VS: TTS request

VS -> TTS: Synthesize speech
TTS --> VS: Audio response
VS --> FE: Audio stream
FE --> User: Play voice

== Document Processing Flow ==
User -> FE: Upload document
FE -> GW: POST /documents/upload
GW -> KB: Store file

KB -> KB: Extract text
KB -> KB: Chunk content
KB -> KB: Generate embeddings
KB -> VDB: Store vectors
KB -> PG: Document metadata

KB --> GW: Processing complete
GW --> FE: Success message
FE --> User: Update status

== Navigation Flow ==
User -> FE: Location query
FE -> GW: POST /maps/search
GW -> WF: Navigation request

WF -> PG: Search locations
PG --> WF: Location data
WF -> WF: Calculate route
WF --> GW: Directions
GW --> FE: Navigation data
FE --> User: Map + directions

== Rating & Analytics Flow ==
User -> FE: Rate response
FE -> GW: POST /ratings
GW -> DB: Store feedback
DB -> DB: Update metrics
DB --> GW: Analytics data
GW --> FE: Performance stats

@enduml
```

### Architecture Overview

Hệ thống DATN Chatbot được xây dựng với kiến trúc microservices:

#### **Frontend Layer**
- **Next.js 16** với TypeScript và TailwindCSS
- Port **3000**
- Real-time chat interface với voice input support

#### **API Gateway**
- **FastAPI** với JWT authentication
- Port **8008** 
- Request routing, rate limiting, load balancing
- Centralized error handling và logging

#### **Core Services**

**Agent Service Toolkit** 🤖
- **LangGraph** framework với FastAPI
- Port **8080**
- AI agents, reasoning, tool usage
- Support cho multiple agents với different capabilities

**Knowledge Base Service** 📚
- **FastAPI** với PostgreSQL + Qdrant
- Port **8000**
- Document management, RAG, vector search
- Background processing với Redis queue

**Wayfinder Service** 🗺️
- **FastAPI** với PostgreSQL + NetworkX
- Port **8004**
- Indoor navigation, location services
- Route calculation với accessibility support

**Dashboard Service** 📊
- **FastAPI** với PostgreSQL
- Port **8007**
- Analytics, user feedback management
- Performance metrics và reporting

**Voice Service** 🎤
- **FastAPI** với WebRTC
- Port **7860**
- Speech-to-Text với Sherpa-ONNX
- Text-to-Speech với Piper TTS (Port **5000**)

#### **Data Layer**
- **PostgreSQL** (Ports 5432-5435): Service databases
- **Qdrant** (Port 6333): Vector database cho semantic search
- **Redis** (Port 6379): Cache và message queue

#### **External Services**
- **LLM APIs**: OpenAI, Anthropic, Ollama
- **AI Models**: Various LLMs cho different agents

---

### PlantUML Activity Diagram

```plantuml
@startuml UserRegistrationLoginActivity
!theme plain
skinparam ParticipantPadding 20
skinparam BoxPadding 20

start
:User opens frontend;
:Click "Register" button;

if (Registration form valid?) then (yes)
  :Submit registration data;
  :Validate email format;
  :Check password strength;
  
  if (Email already exists?) then (yes)
    :Show "Email already registered" error;
    :User enters different email;
  else (no)
    :Create user account;
    :Send verification email;
    :Show "Registration successful" message;
    :Redirect to login page;
  endif
else (no)
  :Show validation errors;
  :User corrects form;
endif

:User enters login credentials;
:Click "Login" button;

if (Credentials valid?) then (yes)
  :Generate JWT token;
  :Store token in localStorage;
  :Update user state;
  :Redirect to dashboard;
else (no)
  :Show "Invalid credentials" error;
  :User retries login;
endif

stop

note right
  Test Scenarios:
  - Successful registration
  - Duplicate email handling
  - Weak password rejection
  - Successful login
  - Invalid credentials
end note
@enduml
```

### Test Scenarios

#### Test Case 1: Successful Registration
```gherkin
Feature: User Registration
  Scenario: Successful user registration
    Given user is on registration page
    When user enters valid email "test@example.com"
    And user enters strong password "SecurePass123!"
    And user clicks "Register" button
    Then registration should succeed
    And user should receive verification email
    And user should be redirected to login page
```

#### Test Case 2: Duplicate Email
```gherkin
Scenario: Registration with existing email
    Given user "existing@example.com" already registered
    When user tries to register with "existing@example.com"
    Then system should show "Email already registered" error
    And user should remain on registration page
```

---

## 2. Chat Interaction Activity

### PlantUML Activity Diagram

```plantuml
@startuml ChatInteractionActivity
!theme plain
skinparam ParticipantPadding 20
skinparam BoxPadding 20

start
:User is logged in;
:User selects chat agent;
:User types message;

if (Message not empty?) then (yes)
  :Click "Send" button;
  :Add message to chat UI;
  :Send message to API Gateway;
  
  if (API Gateway validates JWT?) then (yes)
    :Forward to Agent Service;
    
    if (Agent Service available?) then (yes)
      :Search knowledge base for context;
      
      if (Relevant documents found?) then (yes)
        :Format context with documents;
      else (no)
        :Use empty context;
      endif
      
      :Generate AI response;
      :Log interaction;
      :Return response to API Gateway;
      :API Gateway returns to frontend;
      :Display AI response in chat;
      
      if (User wants to rate?) then (yes)
        :Show rating buttons;
        :User selects rating;
        :Send rating to Dashboard Service;
        :Update agent analytics;
      else (no)
        :Continue conversation;
      endif
      
    else (no)
      :Show "Service unavailable" error;
      :Offer to retry later;
    endif
    
  else (no)
    :Redirect to login page;
  endif
  
else (no)
  :Show "Message cannot be empty" error;
endif

stop

note right
  Test Scenarios:
  - Successful chat with context
  - Empty message validation
  - Service unavailable handling
  - JWT token validation
  - Rating submission
end note
@enduml
```

### Test Scenarios

#### Test Case 1: Successful Chat
```gherkin
Feature: Chat Interaction
  Scenario: Successful chat conversation
    Given user is logged in
    And user has selected "sales-agent"
    When user types "What are your products?"
    And user clicks "Send"
    Then message should appear in chat
    And AI should respond within 5 seconds
    And response should be relevant to products
```

---

## 4. Voice Chat Activity

### PlantUML Activity Diagram

```plantuml
@startuml VoiceChatActivity
!theme plain
skinparam ParticipantPadding 20
skinparam BoxPadding 20

start
:User is in chat interface;
:User clicks microphone button;

if (Microphone access granted?) then (yes)
  :Start WebRTC audio recording;
  :Show recording indicator;
  
  while (User is speaking?) is (speaking)
    :Capture audio chunks via WebRTC;
  endwhile (stopped)
  
  :Stop recording;
  :Convert audio to WAV format;
  :Send to Voice Service for STT;
  
  if (STT processing successful?) then (yes)
    :Receive text transcript;
    :Display transcript for confirmation;
    
    if (User confirms transcript?) then (yes)
      :Send transcript to API Gateway;
      :Process as regular chat flow;
      :Receive AI text response from Agent Service;
      :Send response to Voice Service for TTS;
      
      if (TTS synthesis successful?) then (yes)
        :Receive audio response from Piper TTS;
        :Play audio for user via WebRTC;
        :Show "Playing audio" indicator;
      else (no)
        :Show text response instead;
      endif
      
    else (no)
      :User can edit transcript;
      :Resend corrected transcript;
    endif
    
  else (no)
    :Show "Speech recognition failed" error;
    :Offer to type message instead;
  endif
  
else (no)
  :Show "Microphone access denied" error;
  :Guide user to enable microphone;
endif

stop

note right
  Updated Flow:
  - WebRTC for real-time audio streaming
  - Separate Piper TTS service on port 5000
  - Voice Service orchestrates STT/TTS
  - Fallback to text chat on errors
end note
@enduml
```

### Updated Voice Architecture

Voice interaction trong DATN Chatbot được thiết kế với kiến trúc phân tách:

#### **Components:**
1. **Frontend WebRTC Client**: Xử lý audio streaming real-time
2. **Voice Service (Port 7860)**: Orchestrator chính cho STT/TTS
3. **Piper TTS Service (Port 5000)**: Dedicated TTS server
4. **Sherpa-ONNX STT**: Local speech recognition engine

#### **Flow Steps:**
1. **Audio Capture**: WebRTC captures audio chunks từ browser
2. **Speech-to-Text**: Voice Service chuyển audio → text
3. **Chat Processing**: Gửi text qua API Gateway → Agent Service
4. **Text-to-Speech**: Response text → Piper TTS service
5. **Audio Playback**: WebRTC plays synthesized speech

#### **Technical Details:**
- **WebRTC**: Real-time audio communication
- **TURN Server**: Required cho Docker/NAT traversal
- **Audio Formats**: WAV processing cho compatibility
- **Fallback**: Text chat khi voice fails

---

## 4. Document Upload Activity

### PlantUML Activity Diagram

```plantuml
@startuml DocumentUploadActivity
!theme plain
skinparam ParticipantPadding 20
skinparam BoxPadding 20

start
:User navigates to knowledge base;
:Click "Upload Document" button;
:Select file from device;

if (File format supported?) then (yes)
  if (File size within limit?) then (yes)
    :Show upload progress;
    :Send file to Knowledge Base Service;
    
    if (Upload successful?) then (yes)
      :Create document record;
      :Queue for processing;
      :Show "Upload successful" message;
      :Start background processing;
      
      fork
        :Extract text from file;
      fork again
        :Split into chunks;
      fork again
        :Generate embeddings;
      fork again
        :Store in vector database;
      end fork
      
      :Update processing status;
      :Notify user processing complete;
      :Document available for search;
      
    else (no)
      :Show "Upload failed" error;
      :Offer to retry;
    endif
    
  else (no)
    :Show "File too large" error;
    :Suggest compressing file;
  endif
  
else (no)
  :Show "Unsupported file format" error;
  :Show supported formats list;
endif

stop

note right
  Test Scenarios:
  - Successful document upload
  - File size validation
  - Format validation
  - Processing pipeline
  - Background task handling
end note
@enduml
```

---

## 5. Knowledge Search Activity

### PlantUML Activity Diagram

```plantuml
@startuml KnowledgeSearchActivity
!theme plain
skinparam ParticipantPadding 20
skinparam BoxPadding 20

start
:User is in chat or search interface;
:User enters search query;
:Click "Search" or send as chat message;

if (Query not empty?) then (yes)
  :Preprocess query text;
  :Generate query embedding;
  
  if (Cache has results?) then (yes)
    :Return cached results;
  else (no)
    :Search vector database;
    :Find similar documents;
    :Apply relevance scoring;
    :Rank results by relevance;
    :Cache results for future;
  endif
  
  if (Results found?) then (yes)
    :Format search results;
    :Display results with snippets;
    :Show source information;
    
    if (User clicks result?) then (yes)
      :Open full document;
      :Highlight relevant sections;
    else (no)
      :User continues browsing results;
    endif
    
  else (no)
    :Show "No results found" message;
    :Suggest alternative queries;
    :Offer to upload relevant documents;
  endif
  
else (no)
  :Show "Please enter search query" error;
endif

stop

note right
  Test Scenarios:
  - Successful search with results
  - No results found
  - Cache performance
  - Result ranking
  - Document preview
end note
@enduml
```

---

## 6. Rating & Feedback Activity

### PlantUML Activity Diagram

```plantuml
@startuml RatingFeedbackActivity
!theme plain
skinparam ParticipantPadding 20
skinparam BoxPadding 20

start
:User receives AI response;
:System shows rating buttons;

if (User wants to rate?) then (yes)
  :User clicks "Like" or "Dislike";
  
  if (User clicked "Dislike"?) then (yes)
    :Show comment input field;
    
    if (User adds comment?) then (yes)
      :User types feedback comment;
      :Submit rating with comment;
    else (no)
      :Submit rating without comment;
    endif
    
  else (no)
    :Submit "Like" rating;
  endif
  
  :Send rating to Dashboard Service;
  
  if (Rating saved successfully?) then (yes)
    :Show "Thank you for feedback" message;
    :Update rating display;
    :Calculate agent performance metrics;
  else (no)
    :Show "Failed to save rating" error;
    :Offer to retry;
  endif
  
else (no)
  :User continues conversation;
endif

stop

note right
  Test Scenarios:
  - Like rating submission
  - Dislike with comment
  - Rating failure handling
  - Performance metrics update
  - User feedback validation
end note
@enduml
```

---

## 7. Indoor Navigation Activity

### PlantUML Activity Diagram

```plantuml
@startuml IndoorNavigationActivity
!theme plain
skinparam ParticipantPadding 20
skinparam BoxPadding 20

start
:User asks for location or directions;
:System parses natural language query;

if (Location entities found?) then (yes)
  :Search for matching locations;
  
  if (Exact match found?) then (yes)
    :Get location coordinates;
    :Calculate route from current position;
    
    if (Route calculated successfully?) then (yes)
      :Generate step-by-step directions;
      :Include distance and time estimates;
      :Check accessibility requirements;
      
      if (User needs accessible route?) then (yes)
        :Recalculate route avoiding stairs;
      endif
      
      :Display directions with map;
      :Offer voice guidance option;
      
    else (no)
      :Show "Cannot calculate route" error;
      :Offer general directions;
    endif
    
  else (no)
    :Show "Location not found" error;
    :Suggest similar locations;
    :Offer to search again;
  endif
  
else (no)
  :Show "Please specify location" error;
  :Provide search suggestions;
endif

stop

note right
  Test Scenarios:
  - Successful navigation
  - Location not found
  - Route calculation failure
  - Accessibility requirements
  - Voice guidance option
end note
@enduml
```

---

## 8. Admin Dashboard Activity

### PlantUML Activity Diagram

```plantuml
@startuml AdminDashboardActivity
!theme plain
skinparam ParticipantPadding 20
skinparam BoxPadding 20

start
:Admin logs into system;
:Navigate to admin dashboard;

if (Admin has required permissions?) then (yes)
  :Load dashboard widgets;
  :Fetch system analytics;
  :Display performance metrics;
  
  while (Admin interacts with dashboard?) is (browsing)
    if (Admin views agent performance?) then (yes)
      :Load agent statistics;
      :Display rating trends;
      :Show usage patterns;
      
    else if (Admin manages users?) then (yes)
      :Load user list;
      :Filter by role/status;
      :Perform user actions (activate/deactivate);
      
    else if (Admin views system health?) then (yes)
      :Check all service statuses;
      :Display health metrics;
      :Show alerts if any services down;
      
    else if (Admin manages documents?) then (yes)
      :Load document inventory;
      :Show processing status;
      :Perform document management actions;
      
    else if (Admin exports reports?) then (yes)
      :Generate report data;
      :Export to CSV/PDF;
      :Download report file;
      
    else (no)
      :Admin continues browsing;
    endif
  endwhile
  
else (no)
  :Show "Access denied" error;
  :Redirect to regular dashboard;
endif

stop

note right
  Test Scenarios:
  - Admin dashboard access
  - Permission validation
  - Agent performance viewing
  - User management
  - System health monitoring
  - Report generation
end note
@enduml
```

---

## 9. Error Handling Activity

### PlantUML Activity Diagram

```plantuml
@startuml ErrorHandlingActivity
!theme plain
skinparam ParticipantPadding 20
skinparam BoxPadding 20

start
:System receives request;

if (Request format valid?) then (yes)
  if (Authentication valid?) then (yes)
    if (Service available?) then (yes)
      :Process request;
      
      if (Processing successful?) then (yes)
        :Return success response;
      else (no)
        :Log error details;
        :Return appropriate error response;
        
        if (Error is recoverable?) then (yes)
          :Offer retry option;
        else (no)
          :Show error message;
        endif
      endif
      
    else (no)
      :Check circuit breaker status;
      
      if (Circuit breaker open?) then (yes)
        :Return "Service temporarily unavailable";
        :Log service outage;
      else (no)
        :Try alternative service;
        :Return degraded functionality;
      endif
    endif
    
  else (no)
    :Return 401 Unauthorized;
    :Redirect to login;
  endif
  
else (no)
  :Return 400 Bad Request;
  :Show validation errors;
endif

stop

note right
  Test Scenarios:
  - Validation errors
  - Authentication failures
  - Service unavailability
  - Circuit breaker activation
  - Error recovery mechanisms
end note
@enduml
```

---

## 10. Service Health Check Activity

### PlantUML Activity Diagram

```plantuml
@startuml ServiceHealthCheckActivity
!theme plain
skinparam ParticipantPadding 20
skinparam BoxPadding 20

start
:Health monitoring system starts;
:Schedule periodic health checks;

while (System running?) is (monitoring)
  fork
    :Check API Gateway health;
  fork again
    :Check Agent Service health;
  fork again
    :Check Knowledge Base health;
  fork again
    :Check Dashboard Service health;
  fork again
    :Check Wayfinder Service health;
  fork again
    :Check Voice Service health;
  fork again
    :Check Database connectivity;
  fork again
    :Check external service dependencies;
  end fork
  
  if (All services healthy?) then (yes)
    :Update overall status to "Healthy";
    :Clear any active alerts;
    :Log normal operation;
    
  else (no)
    :Identify unhealthy services;
    :Update overall status to "Degraded" or "Unhealthy";
    :Generate alerts for affected services;
    :Notify administrators;
    :Initiate automatic recovery if possible;
  endif
  
  :Wait for next check interval;
endwhile (stopped)

stop

note right
  Test Scenarios:
  - All services healthy
  - Service degradation
  - Complete service failure
  - Alert generation
  - Automatic recovery
  - Health check scheduling
end note
@enduml
```

---

## Testing Strategy Implementation

### Automated Testing Framework

#### Test Environment Setup
```python
# conftest.py - Pytest configuration
import pytest
from testcontainers.postgres import PostgresContainer
from testcontainers.redis import RedisContainer

@pytest.fixture(scope="session")
def postgres_container():
    with PostgresContainer("postgres:16") as postgres:
        yield postgres

@pytest.fixture(scope="session")
def redis_container():
    with RedisContainer("redis:7") as redis:
        yield redis

@pytest.fixture
def test_db(postgres_container):
    # Setup test database
    engine = create_engine(postgres_container.get_connection_url())
    Base.metadata.create_all(engine)
    yield engine
    Base.metadata.drop_all(engine)
```

#### Test Utilities
```python
# test_utils.py
import requests
from typing import Dict, Any

class APIClient:
    def __init__(self, base_url: str):
        self.base_url = base_url
        self.session = requests.Session()
        self.token = None
    
    def login(self, email: str, password: str) -> Dict[str, Any]:
        response = self.session.post(
            f"{self.base_url}/auth/login",
            json={"email": email, "password": password}
        )
        self.token = response.json()["access_token"]
        self.session.headers.update({
            "Authorization": f"Bearer {self.token}"
        })
        return response.json()
    
    def send_chat_message(self, message: str, agent_id: str) -> Dict[str, Any]:
        response = self.session.post(
            f"{self.base_url}/agent/{agent_id}/invoke",
            json={"message": message}
        )
        return response.json()
    
    def upload_document(self, file_path: str, title: str) -> Dict[str, Any]:
        with open(file_path, 'rb') as f:
            response = self.session.post(
                f"{self.base_url}/documents/upload",
                files={"file": f},
                data={"title": title}
            )
        return response.json()
```

### Integration Test Examples

#### End-to-End Chat Test
```python
# test_chat_e2e.py
def test_complete_chat_flow(api_client: APIClient):
    # 1. Login
    login_response = api_client.login("test@example.com", "password123")
    assert login_response["access_token"] is not None
    
    # 2. Send chat message
    chat_response = api_client.send_chat_message(
        "What are your products?", 
        "sales-agent"
    )
    assert "content" in chat_response
    assert len(chat_response["content"]) > 0
    
    # 3. Rate the response
    rating_response = api_client.session.post(
        f"{api_client.base_url}/ratings",
        json={
            "run_id": chat_response["run_id"],
            "rating": "LIKE",
            "agent_id": "sales-agent"
        }
    )
    assert rating_response.status_code == 201
```

#### Document Processing Test
```python
# test_document_processing.py
def test_document_upload_and_search(api_client: APIClient, temp_pdf_file):
    # 1. Upload document
    upload_response = api_client.upload_document(
        temp_pdf_file, 
        "Test Document"
    )
    document_id = upload_response["document_id"]
    assert document_id is not None
    
    # 2. Wait for processing
    import time
    time.sleep(30)  # Wait for background processing
    
    # 3. Search for content
    search_response = api_client.session.post(
        f"{api_client.base_url}/search",
        json={"query": "test content", "limit": 5}
    )
    
    results = search_response.json()["documents"]
    assert len(results) > 0
    assert any(doc["document_id"] == document_id for doc in results)
```

### Performance Testing

#### Load Testing Configuration
```python
# load_test.py
from locust import HttpUser, task, between

class ChatUser(HttpUser):
    wait_time = between(1, 3)
    
    def on_start(self):
        """Login on start"""
        response = self.client.post("/auth/login", json={
            "email": "test@example.com",
            "password": "password123"
        })
        self.token = response.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    @task
    def send_chat_message(self):
        self.client.post("/agent/sales-agent/invoke", 
                        json={"message": "Hello, how are you?"},
                        headers=self.headers)
    
    @task(3)
    def search_knowledge(self):
        self.client.post("/search", 
                        json={"query": "product information", "limit": 5},
                        headers=self.headers)
```

### Test Data Management

#### Test Data Factory
```python
# factory.py
from factory import Factory
from faker import Faker

fake = Faker()

class UserFactory(Factory):
    class Meta:
        model = dict
    
    email = factory.LazyAttribute(lambda _: fake.email())
    password = factory.LazyAttribute(lambda _: fake.password())
    roles = factory.LazyAttribute(lambda _: ["user"])

class DocumentFactory(Factory):
    class Meta:
        model = dict
    
    title = factory.LazyAttribute(lambda _: fake.sentence())
    content = factory.LazyAttribute(lambda _: fake.text(max_nb_chars=1000))
    tags = factory.LazyAttribute(lambda _: [fake.word() for _ in range(3)])
```

---

## 12. Microservices Communication Flow

### PlantUML Communication Diagram

```plantuml
@startuml MicroservicesCommunication
!theme plain
skinparam ParticipantPadding 20
skinparam BoxPadding 20

title Microservices Communication Patterns

participant "Frontend" as FE
participant "API Gateway" as GW
participant "Agent Service" as AS
participant "Knowledge Base" as KB
participant "Wayfinder" as WF
participant "Dashboard" as DB
participant "Voice Service" as VS
participant "Piper TTS" as TTS

database "PostgreSQL" as PG
database "Qdrant" as QD
database "Redis" as RD

== Startup Sequence ==
note over FE,PG: System initialization
GW -> GW: Initialize JWT middleware
AS -> PG: Connect agent database
KB -> PG: Connect knowledge database
KB -> QD: Connect vector database
WF -> PG: Connect navigation database
DB -> PG: Connect analytics database
VS -> VS: Initialize WebRTC
TTS -> TTS: Load voice models

== Request Routing Patterns ==
note over FE,TTS: HTTP request flow

FE -> GW: POST /agent/{id}/invoke
GW -> GW: Validate JWT
GW -> GW: Rate limiting check

alt Chat request
    GW -> AS: Forward with user context
    AS -> KB: Search knowledge base
    KB -> QD: Vector similarity search
    QD --> KB: Document chunks
    KB --> AS: Context documents
    
    AS -> AS: Generate response
    AS -> DB: Log interaction
    AS --> GW: AI response
    
else Navigation request
    GW -> WF: Forward location query
    WF -> PG: Query location data
    PG --> WF: Location results
    WF --> GW: Navigation data
    
else Document request
    GW -> KB: Forward document operation
    KB -> PG: Document CRUD operations
    KB --> GW: Document response
    
else Voice request
    GW -> VS: Forward audio data
    VS -> TTS: Request synthesis
    TTS --> VS: Audio response
    VS --> GW: Audio data
end

GW --> FE: Formatted response

== Async Processing ==
note over KB,RD: Background tasks

KB -> RD: Queue document processing
KB -> KB: Process in background

fork
    KB -> KB: Extract text
fork again
    KB -> KB: Generate embeddings
fork again
    KB -> QD: Store vectors
end fork

KB -> PG: Update status
KB -> RD: Publish completion

== Caching Strategy ==
note over GW,RD: Redis caching patterns

GW -> RD: Check response cache
RD --> GW: Cached response (if hit)

AS -> RD: Cache LLM responses
KB -> RD: Cache search results
WF -> RD: Cache route calculations

== Error Handling & Recovery ==
note over GW,DB: Circuit breaker pattern

alt Service timeout
    GW -> GW: Trigger circuit breaker
    GW -> GW: Return cached response
else Service error
    GW -> DB: Log error details
    GW -> GW: Return graceful error
end

== Health Monitoring ==
note over GW,VS: Health check propagation

loop Every 30 seconds
    GW -> AS: GET /health
    GW -> KB: GET /health
    GW -> WF: GET /health
    GW -> DB: GET /health
    GW -> VS: GET /health
    GW -> TTS: GET /health
    
    alt Service unhealthy
        GW -> DB: Log service status
        GW -> GW: Update routing table
    end
end

@enduml
```

### Communication Patterns

#### **1. Synchronous Request-Response**
- **Frontend API Gateway**: HTTP/REST calls
- **API Gateway Services**: FastAPI routing with validation
- **Service-to-Service**: Direct HTTP calls with timeouts

#### **2. Asynchronous Processing**
- **Document Processing**: Redis queue for background tasks
- **Analytics**: Event-driven logging
- **Notifications**: Pub/sub patterns via Redis

#### **3. Caching Strategy**
- **Response Caching**: Redis cho frequent queries
- **Session Caching**: User context and JWT validation
- **Data Caching**: Search results và computed routes

#### **4. Error Handling**
- **Circuit Breaker**: Prevent cascade failures
- **Retry Logic**: Exponential backoff for external APIs
- **Graceful Degradation**: Fallback responses

#### **5. Service Discovery**
- **Static Configuration**: Known service endpoints
- **Health Checks**: Active monitoring
- **Load Balancing**: Round-robin distribution

### Technology Stack

#### **Communication Protocols**
- **HTTP/REST**: Primary API communication
- **WebRTC**: Real-time audio streaming
- **WebSocket**: Future real-time features

#### **Message Formats**
- **JSON**: Standard API responses
- **Binary**: Audio/video data
- **Protocol Buffers**: Future optimization

#### **Monitoring & Observability**
- **Health Endpoints**: `/health`, `/info`, `/metrics`
- **Structured Logging**: JSON format with correlation IDs
- **Performance Metrics**: Response times, error rates

---

## PlantUML Installation & Usage

### Installation
```bash
# Using VS Code extension
code --install-extension jebbs.plantuml

# Using CLI
npm install -g plantuml
```

### Rendering Diagrams
```bash
# Generate PNG from PlantUML file
plantuml -tpng diagram.puml

# Generate SVG
plantuml -tsvg diagram.puml

# Generate PDF
plantuml -tpdf diagram.puml
```

### VS Code Integration
1. Install PlantUML extension
2. Open `.puml` file
3. Use `Ctrl+Shift+P` → "PlantUML: Preview"
4. Or use `Alt+D` to preview current diagram

### Integration with Documentation
```markdown
<!-- In Markdown files -->
![User Registration Flow](./diagrams/user-registration.puml)

<!-- Or embed directly -->
```plantuml
@startuml
start
:User action;
stop
@enduml
```

---

## Conclusion

PlantUML diagrams provide superior visualization cho DATN Chatbot system so với Mermaid. Key advantages:

### 🎯 Enhanced System Architecture Visualization
- **Complete System Overview**: Total architecture với all services
- **Microservices Communication**: Detailed interaction patterns
- **Complex decision trees** với multiple branches
- **Parallel processing** visualization cho background tasks

### 🔄 Better Development Understanding
- **Service Dependencies**: Clear relationships between components
- **Data Flow Visualization**: End-to-end request/response paths
- **Error Handling Patterns**: Comprehensive failure scenarios
- **Performance Monitoring**: Health check và alerting flows

### 📊 Improved Documentation Quality
- **Professional diagram rendering** với PlantUML
- **Multiple output formats** (PNG, SVG, PDF)
- **Version control friendly** text-based diagrams
- **IDE integration** cho real-time preview

### 🚀 System-Specific Benefits
- **Voice Architecture**: WebRTC + Piper TTS integration
- **Knowledge Processing**: RAG pipeline visualization
- **Navigation System**: Indoor routing với accessibility
- **Multi-Agent Support**: LangGraph agent interactions
- **Real-time Features**: WebRTC audio streaming patterns

### 🛠️ Implementation Guidance
- **Port Mapping**: Clear service endpoints (3000, 5000, 7860, 8000, 8004, 8007, 8008, 8080)
- **Database Layout**: PostgreSQL + Qdrant + Redis architecture
- **API Gateway**: Centralized routing và authentication
- **Microservices Patterns**: Communication best practices

Documentation này serves as comprehensive system blueprint với PlantUML diagrams, ensuring:
- **Clear architecture understanding** cho developers
- **Efficient troubleshooting** với detailed flow analysis
- **Scalable design patterns** cho future enhancements
- **Production deployment guidance** với complete system view
