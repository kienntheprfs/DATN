# Activity Diagrams for Testing

## Tổng quan

Documentation này chứa các activity diagrams chi tiết để phục vụ việc testing các luồng xử lý trong hệ thống DATN Chatbot. Các diagrams mô tả step-by-step activities, decision points, và test scenarios.

## Table of Contents

1. [User Registration & Login Activity](#1-user-registration--login-activity)
2. [Chat Interaction Activity](#2-chat-interaction-activity)
3. [Voice Chat Activity](#3-voice-chat-activity)
4. [Document Upload Activity](#4-document-upload-activity)
5. [Knowledge Search Activity](#5-knowledge-search-activity)
6. [Rating & Feedback Activity](#6-rating--feedback-activity)
7. [Indoor Navigation Activity](#7-indoor-navigation-activity)
8. [Admin Dashboard Activity](#8-admin-dashboard-activity)
9. [Error Handling Activity](#9-error-handling-activity)
10. [Service Health Check Activity](#10-service-health-check-activity)

---

## 1. User Registration & Login Activity

### Activity Diagram
```mermaid
activityDiagram
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
        end
    else (no)
        :Show validation errors;
        :User corrects form;
    end
    
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
    end
    
    stop
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

#### Test Case 3: Weak Password
```gherkin
Scenario: Registration with weak password
    When user enters valid email
    And user enters weak password "123"
    And user clicks "Register" button
    Then system should show "Password too weak" error
    And registration should fail
```

---

## 2. Chat Interaction Activity

### Activity Diagram
```mermaid
activityDiagram
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
                end
                
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
                end
                
            else (no)
                :Show "Service unavailable" error;
                :Offer to retry later;
            end
            
        else (no)
            :Redirect to login page;
        end
        
    else (no)
        :Show "Message cannot be empty" error;
    end
    
    stop
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

#### Test Case 2: Empty Message
```gherkin
Scenario: Send empty message
    Given user is in chat interface
    When user clicks "Send" without typing message
    Then system should show "Message cannot be empty" error
    And no message should be sent
```

#### Test Case 3: Service Unavailable
```gherkin
Scenario: Chat when agent service is down
    Given Agent Service is unavailable
    When user sends a message
    Then system should show "Service unavailable" error
    And user should be offered to retry
```

---

## 3. Voice Chat Activity

### Activity Diagram
```mermaid
activityDiagram
    start
    
    :User is in chat interface;
    :User clicks microphone button;
    
    if (Microphone access granted?) then (yes)
        :Start audio recording;
        :Show recording indicator;
        
        while (User is speaking) then (speaking)
            :Capture audio chunks;
        end (stopped)
        
        :Stop recording;
        :Convert audio to WAV format;
        :Send to Voice Service for STT;
        
        if (STT processing successful?) then (yes)
            :Receive text transcript;
            :Display transcript for confirmation;
            
            if (User confirms transcript?) then (yes)
                :Send transcript as chat message;
                :Process as regular chat flow;
                :Receive AI text response;
                :Send response to TTS service;
                
                if (TTS synthesis successful?) then (yes)
                    :Receive audio response;
                    :Play audio for user;
                    :Show "Playing audio" indicator;
                else (no)
                    :Show text response instead;
                end
                
            else (no)
                :User can edit transcript;
                :Resend corrected transcript;
            end
            
        else (no)
            :Show "Speech recognition failed" error;
            :Offer to type message instead;
        end
        
    else (no)
        :Show "Microphone access denied" error;
        :Guide user to enable microphone;
    end
    
    stop
```

### Test Scenarios

#### Test Case 1: Successful Voice Chat
```gherkin
Feature: Voice Chat
  Scenario: Complete voice interaction
    Given user has granted microphone access
    When user clicks microphone button
    And user speaks "Hello, how are you?"
    And user stops speaking
    Then transcript should appear: "Hello, how are you?"
    And AI should respond with voice
    And audio should play clearly
```

#### Test Case 2: Microphone Denied
```gherkin
Scenario: Microphone access denied
    When user clicks microphone button
    And user denies microphone access
    Then system should show "Microphone access denied" error
    And user should be guided to enable microphone
```

#### Test Case 3: STT Failure
```gherkin
Scenario: Speech recognition failure
    Given microphone is working
    When user speaks in noisy environment
    And STT fails to transcribe
    Then system should show "Speech recognition failed" error
    And user should be offered to type message
```

---

## 4. Document Upload Activity

### Activity Diagram
```mermaid
activityDiagram
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
                
                while (Processing not complete) then (processing)
                    :Extract text from file;
                    :Split into chunks;
                    :Generate embeddings;
                    :Store in vector database;
                    :Update processing status;
                end (complete)
                
                :Notify user processing complete;
                :Document available for search;
                
            else (no)
                :Show "Upload failed" error;
                :Offer to retry;
            end
            
        else (no)
            :Show "File too large" error;
            :Suggest compressing file;
        end
        
    else (no)
        :Show "Unsupported file format" error;
        :Show supported formats list;
    end
    
    stop
```

### Test Scenarios

#### Test Case 1: Successful Document Upload
```gherkin
Feature: Document Upload
  Scenario: Upload and process PDF document
    Given user is on knowledge base page
    When user selects a 5MB PDF file
    And user clicks "Upload"
    Then upload should start immediately
    And progress should be shown
    And document should be queued for processing
    And processing should complete within 2 minutes
    And document should be searchable
```

#### Test Case 2: File Too Large
```gherkin
Scenario: Upload oversized file
    When user selects a 100MB file
    And user clicks "Upload"
    Then system should show "File too large" error
    And system should suggest maximum file size
```

#### Test Case 3: Unsupported Format
```gherkin
Scenario: Upload unsupported file format
    When user selects a .exe file
    And user clicks "Upload"
    Then system should show "Unsupported file format" error
    And system should show supported formats
```

---

## 5. Knowledge Search Activity

### Activity Diagram
```mermaid
activityDiagram
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
        end
        
        if (Results found?) then (yes)
            :Format search results;
            :Display results with snippets;
            :Show source information;
            
            if (User clicks result?) then (yes)
                :Open full document;
                :Highlight relevant sections;
            else (no)
                :User continues browsing results;
            end
            
        else (no)
            :Show "No results found" message;
            :Suggest alternative queries;
            :Offer to upload relevant documents;
        end
        
    else (no)
        :Show "Please enter search query" error;
    end
    
    stop
```

### Test Scenarios

#### Test Case 1: Successful Search
```gherkin
Feature: Knowledge Search
  Scenario: Find relevant documents
    Given knowledge base contains product documentation
    When user searches for "product pricing"
    Then system should return relevant documents
    And results should be ordered by relevance
    And each result should show source information
    And snippets should highlight search terms
```

#### Test Case 2: No Results
```gherkin
Scenario: Search with no results
    When user searches for "nonexistent topic"
    Then system should show "No results found"
    And system should suggest alternative queries
    And system should offer to upload documents
```

#### Test Case 3: Cached Results
```gherkin
Scenario: Search with cached results
    Given user has searched for "product pricing" before
    When user searches for "product pricing" again
    Then results should load quickly from cache
    And content should be identical to previous search
```

---

## 6. Rating & Feedback Activity

### Activity Diagram
```mermaid
activityDiagram
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
            end
            
        else (no)
            :Submit "Like" rating;
        end
        
        :Send rating to Dashboard Service;
        
        if (Rating saved successfully?) then (yes)
            :Show "Thank you for feedback" message;
            :Update rating display;
            :Calculate agent performance metrics;
        else (no)
            :Show "Failed to save rating" error;
            :Offer to retry;
        end
        
    else (no)
        :User continues conversation;
    end
    
    stop
```

### Test Scenarios

#### Test Case 1: Like Rating
```gherkin
Feature: User Feedback
  Scenario: User likes AI response
    Given AI has responded to user query
    When user clicks "Like" button
    Then rating should be saved successfully
    And "Thank you for feedback" should appear
    And agent performance metrics should update
```

#### Test Case 2: Dislike with Comment
```gherkin
Scenario: User dislikes with detailed feedback
    Given AI has responded with poor answer
    When user clicks "Dislike" button
    And user types "This answer is not helpful"
    And user submits feedback
    Then rating and comment should be saved
    And feedback should be available for review
```

#### Test Case 3: Rating Failure
```gherkin
Scenario: Rating submission fails
    Given Dashboard Service is unavailable
    When user tries to submit rating
    Then "Failed to save rating" error should appear
    And user should be offered to retry
```

---

## 7. Indoor Navigation Activity

### Activity Diagram
```mermaid
activityDiagram
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
                end
                
                :Display directions with map;
                :Offer voice guidance option;
                
            else (no)
                :Show "Cannot calculate route" error;
                :Offer general directions;
            end
            
        else (no)
            :Show "Location not found" error;
            :Suggest similar locations;
            :Offer to search again;
        end
        
    else (no)
        :Show "Please specify location" error;
        :Provide search suggestions;
    end
    
    stop
```

### Test Scenarios

#### Test Case 1: Successful Navigation
```gherkin
Feature: Indoor Navigation
  Scenario: Find conference room
    Given user is in building lobby
    When user asks "Where is conference room A?"
    Then system should find conference room A
    And calculate route from lobby to room
    And provide step-by-step directions
    And include estimated walking time
```

#### Test Case 2: Location Not Found
```gherkin
Scenario: Search for nonexistent location
    When user asks "Where is the rooftop garden?"
    And building has no rooftop garden
    Then system should show "Location not found"
    And system should suggest similar locations
```

#### Test Case 3: Accessible Route
```gherkin
Scenario: Request accessible navigation
    Given user requires wheelchair access
    When user asks for directions to elevator
    Then system should provide accessible route
    And route should avoid stairs
    And directions should include elevator information
```

---

## 8. Admin Dashboard Activity

### Activity Diagram
```mermaid
activityDiagram
    start
    
    :Admin logs into system;
    :Navigate to admin dashboard;
    
    if (Admin has required permissions?) then (yes)
        :Load dashboard widgets;
        :Fetch system analytics;
        :Display performance metrics;
        
        while (Admin interacts with dashboard) then (browsing)
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
            end
        end
        
    else (no)
        :Show "Access denied" error;
        :Redirect to regular dashboard;
    end
    
    stop
```

### Test Scenarios

#### Test Case 1: Admin Dashboard Access
```gherkin
Feature: Admin Dashboard
  Scenario: Admin views system analytics
    Given user has admin role
    When user navigates to admin dashboard
    Then dashboard should load successfully
    And system analytics should be displayed
    And all widgets should show current data
```

#### Test Case 2: Non-admin Access
```gherkin
Scenario: Regular user accesses admin dashboard
    Given user has regular user role
    When user tries to access admin dashboard
    Then system should show "Access denied" error
    And user should be redirected to regular dashboard
```

#### Test Case 3: Agent Performance View
```gherkin
Scenario: Admin views agent performance
    Given admin is on dashboard
    When admin clicks "Agent Performance" tab
    Then agent statistics should load
    And rating trends should be displayed
    And usage patterns should be shown
```

---

## 9. Error Handling Activity

### Activity Diagram
```mermaid
activityDiagram
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
                    end
                end
                
            else (no)
                :Check circuit breaker status;
                
                if (Circuit breaker open?) then (yes)
                    :Return "Service temporarily unavailable";
                    :Log service outage;
                else (no)
                    :Try alternative service;
                    :Return degraded functionality;
                end
            end
            
        else (no)
            :Return 401 Unauthorized;
            :Redirect to login;
        end
        
    else (no)
        :Return 400 Bad Request;
        :Show validation errors;
    end
    
    stop
```

### Test Scenarios

#### Test Case 1: Validation Error
```gherkin
Feature: Error Handling
  Scenario: Invalid request format
    When user sends malformed JSON request
    Then system should return 400 Bad Request
    And system should show specific validation errors
    And error should be logged for monitoring
```

#### Test Case 2: Service Unavailable
```gherkin
Scenario: Backend service down
    Given Agent Service is down
    When user tries to send chat message
    Then system should return 503 Service Unavailable
    And system should show graceful error message
    And circuit breaker should activate
```

#### Test Case 3: Authentication Error
```gherkin
Scenario: Expired authentication token
    Given user's JWT token has expired
    When user makes authenticated request
    Then system should return 401 Unauthorized
    And user should be redirected to login
```

---

## 10. Service Health Check Activity

### Activity Diagram
```mermaid
activityDiagram
    start
    
    :Health monitoring system starts;
    :Schedule periodic health checks;
    
    while (System running) then (monitoring)
        :Check API Gateway health;
        :Check Agent Service health;
        :Check Knowledge Base health;
        :Check Dashboard Service health;
        :Check Wayfinder Service health;
        :Check Voice Service health;
        :Check Database connectivity;
        :Check external service dependencies;
        
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
        end
        
        :Wait for next check interval;
    end
    
    stop
```

### Test Scenarios

#### Test Case 1: All Services Healthy
```gherkin
Feature: Health Monitoring
  Scenario: All systems operational
    Given all services are running normally
    When health check runs
    Then all services should report "healthy"
    And overall status should be "Healthy"
    And no alerts should be generated
```

#### Test Case 2: Service Degradation
```gherkin
Scenario: Service performance degradation
    Given Agent Service response time > 5 seconds
    When health check runs
    Then Agent Service should report "degraded"
    And overall status should be "Degraded"
    And alert should be generated
```

#### Test Case 3: Service Failure
```gherkin
Scenario: Service completely down
    Given Database connection fails
    When health check runs
    Then Database should report "unhealthy"
    And dependent services should show "degraded"
    And critical alert should be sent
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

## Conclusion

Activity diagrams này cung cấp foundation comprehensive cho testing strategy của hệ thống DATN Chatbot. Key benefits:

### 🎯 Testing Coverage
- **Complete user journeys** từ start đến finish
- **Error scenarios** và edge cases
- **Performance boundaries** và load testing
- **Security flows** và authentication testing

### 🔄 Test Automation
- **Structured test cases** với Gherkin format
- **Reusable test utilities** và fixtures
- **Integration test examples** cho end-to-end scenarios
- **Load testing configurations** cho performance testing

### 📊 Quality Assurance
- **Decision points** và branching logic coverage
- **Error handling paths** và recovery testing
- **Health monitoring** và system reliability testing
- **User experience flows** và accessibility testing

### 🚀 Continuous Testing
- **CI/CD integration** ready test structure
- **Automated test execution** possibilities
- **Test data management** strategies
- **Performance benchmarking** capabilities

Documentation này sẽ serve as blueprint cho comprehensive testing strategy, ensuring system reliability và quality delivery.
