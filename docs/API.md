# API Reference & Contracts — Appsensi

Appsensi uses a layered API architecture consisting of:
1. **tRPC v11 Wrapper API** (`/api/trpc/*`) — End-to-end type-safe RPC wrapper (Zod input/output validation + SuperJSON `Date` serialization) that delegates all attendance and registration procedures to `appsensi-server`.
2. **Backend REST & WebAuthn API** (`appsensi-server` at `VITE_WEBAUTHN_SERVER_URL`, defaulting to `http://localhost:8080`) — Go + Gin + GORM + `go-webauthn` service managing PostgreSQL persistence and FIDO2 / WebAuthn cryptographic ceremonies.

---

## 1. tRPC Wrapper API Reference

All procedures are exposed via `createTRPCRouter` at [`src/integrations/trpc/router.ts`](file:///c:/Users/gaming/Documents/GitHub/appsensi/src/integrations/trpc/router.ts) and call `appsensi-server` via [`src/integrations/trpc/server-client.ts`](file:///c:/Users/gaming/Documents/GitHub/appsensi/src/integrations/trpc/server-client.ts).

```
trpc
├── attendance
│   ├── demoCatalog   (Query    -> GET  /attendance/demo-catalog)
│   ├── roster        (Query    -> GET  /attendance/roster)
│   └── checkIn       (Mutation -> POST /attendance/check-in)
└── registration
    ├── list                  (Query    -> GET  /registration/list)
    ├── linkStudentUser       (Mutation -> POST /registration/link-student)
    └── cleanupIncompleteUser (Mutation -> POST /registration/cleanup-incomplete)
```

---

### 1.1 `attendance.demoCatalog`
Lists all campus rooms that have scheduled courses along with their weekly class sessions. Used for room selection and schedule previews on the home page (`/`).

- **Type**: Query
- **Input**: None (`void`)
- **Output**: `DemoCatalogRoom[]`

#### Response Schema
```typescript
interface DemoCatalogRoom {
  code: string;           // Normalized lowercase code, e.g. "h.2.4"
  floor: number;          // Floor number, e.g. 2
  roomNumber: string;     // Room number, e.g. "204"
  buildingCode: string;   // Building letter, e.g. "H"
  buildingName: string;   // Building name, e.g. "Building H"
  facultyCode: string | null;
  facultyName: string | null;
  schedules: Array<{
    id: string;           // UUID of class_schedule
    courseCode: string;   // e.g. "CS201"
    courseName: string;   // e.g. "Distributed Systems"
    section: string;      // e.g. "A"
    dayOfWeek: string;    // e.g. "Monday"
    startTime: string;    // e.g. "09:00"
    endTime: string;      // e.g. "11:30"
  }>;
}
```

---

### 1.2 `attendance.roster`
Returns the active class session and the list of enrolled students who have not yet checked in for a room on a given calendar date.

- **Type**: Query
- **Input**:
```typescript
{
  room: string;          // Room code e.g. "h.2.4" (case-insensitive)
  scheduleId?: string;   // Optional UUID to override active session
  date?: string;         // Optional YYYY-MM-DD (defaults to server today)
}
```
- **Output**: `RosterResult`

#### Response Schema
```typescript
interface RosterResult {
  room: string;
  sessionDate: string;   // YYYY-MM-DD
  dayOfWeek: string;     // e.g. "Monday"
  schedule: {
    id: string;
    courseCode: string;
    courseName: string;
    credits: number;
    section: string;
    instructor: string;
    dayOfWeek: string;
    startTime: string;
    endTime: string;
    academicTerm: string;
  } | null;
  availableSchedules: Array<{
    id: string;
    courseCode: string;
    courseName: string;
    section: string;
    dayOfWeek: string;
    startTime: string;
    endTime: string;
  }>;
  total: number;         // Total enrolled students for active session
  present: number;       // Number of students already checked in
  pending: Array<{
    id: string;          // UUID of student
    studentId: string;   // e.g. "STU-882194"
    username: string;    // Matches WebAuthn username
    name: string;        // Full name
    department: string | null;
    photoUrl: string | null;
    isRegistered: boolean; // True if student has registered a passkey
  }>;
}
```

---

### 1.3 `attendance.checkIn`
Records a student's attendance in the database after successful passkey verification.

- **Type**: Mutation
- **Input**:
```typescript
{
  room: string;          // Room code e.g. "h.2.4"
  studentId: string;     // Student UUID or student ID string
  scheduleId?: string;   // Optional explicit schedule UUID
  date?: string;         // Optional session date YYYY-MM-DD
}
```
- **Output**: `CheckInResult`

#### Response Schema
```typescript
interface CheckInResult {
  id: string;            // Student UUID
  studentId: string;     // Student badge ID, e.g. "STU-882194"
  name: string;          // Student full name
  room: string;          // Room code
  sessionDate: string;   // YYYY-MM-DD
  checkedInAt: Date;     // Timestamp of check-in
}
```

#### Error Codes
| Code | HTTP Equivalent | Reason |
| :--- | :---: | :--- |
| `NOT_FOUND` | 404 | Room or Student not found in database |
| `PRECONDITION_FAILED` | 412 | Student has no registered passkey, or no class scheduled |
| `BAD_REQUEST` | 400 | Student is not enrolled in the active class schedule |
| `CONFLICT` | 409 | Student is already checked in for this session date |

---

### 1.4 `registration.list`
Lists all enrolled students joined with their corresponding WebAuthn user accounts and credential registration status.

- **Type**: Query
- **Input**: None (`void`)
- **Output**: `RegistrationStudentRow[]`

#### Response Schema
```typescript
interface RegistrationStudentRow {
  id: string;            // Student UUID
  name: string;          // Student name
  username: string;      // Student ID / WebAuthn username
  department: string | null;
  userId: string | null; // UUID from users table if linked
  email: string | null;  // Email from users table
  createdAt: Date | null;// Registration date
  isRegistered: boolean; // True if has user record and credentials
}
```

---

### 1.5 `registration.linkStudentUser`
Links an existing `students` record to a newly created `users` record following completion of passkey registration.

- **Type**: Mutation
- **Input**:
```typescript
{
  studentId: string;     // Student UUID
  username: string;      // Username string (matches student_id)
}
```
- **Output**:
```typescript
{
  userId: string;
  email: string;
  createdAt: Date;
}
```

---

### 1.6 `registration.cleanupIncompleteUser`
Removes an unverified `users` record (one with 0 passkey credentials) if a user aborts or fails the registration ceremony midway.

- **Type**: Mutation
- **Input**:
```typescript
{
  username: string;
}
```
- **Output**:
```typescript
{
  cleaned: boolean;      // True if incomplete record was removed
}
```

---

## 2. Backend REST & WebAuthn API (`appsensi-server`)

The Go backend service runs at `VITE_WEBAUTHN_SERVER_URL` (default `http://localhost:8080`) and owns all runtime PostgreSQL queries, attendance mutations, and WebAuthn ceremonies.

| Method | Path | Caller | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/register/begin` | Browser | Generates WebAuthn registration challenge & creation options |
| `POST` | `/register/finish` | Browser | Verifies attestation, stores passkey credential, and auto-links student |
| `POST` | `/login/begin` | Browser | Generates WebAuthn assertion challenge & request options |
| `POST` | `/login/finish` | Browser | Verifies assertion signature and updates credential sign counter |
| `GET` | `/attendance/demo-catalog` | tRPC (`attendance.demoCatalog`) | Lists classrooms with scheduled courses and weekly sessions |
| `GET` | `/attendance/roster` | tRPC (`attendance.roster`) | Returns active class session and pending student roster |
| `POST` | `/attendance/check-in` | tRPC (`attendance.checkIn`) | Records verified student attendance for the active session |
| `GET` | `/registration/list` | tRPC (`registration.list`) | Lists students paired with WebAuthn account & passkey status |
| `POST` | `/registration/link-student` | tRPC (`registration.linkStudentUser`) | Idempotently links `students.user_id` to `users.id` |
| `POST` | `/registration/cleanup-incomplete` | tRPC (`registration.cleanupIncompleteUser`) | Deletes unverified `users` record with zero passkey credentials |

### 2.1 `POST /register/begin`
Initiates WebAuthn registration for a student.

- **Request Body**:
```json
{
  "email": "student@campus.edu",
  "username": "STU-FCS-001"
}
```
- **Response**: `200 OK`
```json
{
  "publicKey": {
    "challenge": "BASE64_URL_STRING",
    "rp": {
      "name": "Appsensi",
      "id": "localhost"
    },
    "user": {
      "id": "BASE64_URL_HANDLE",
      "name": "student@campus.edu",
      "displayName": "student@campus.edu"
    },
    "pubKeyCredParams": [
      { "type": "public-key", "alg": -7 },
      { "type": "public-key", "alg": -257 }
    ],
    "authenticatorSelection": {
      "authenticatorAttachment": "platform",
      "userVerification": "preferred"
    },
    "timeout": 60000
  }
}
```

---

### 2.2 `POST /register/finish`
Completes credential registration, validates the attestation statement, and persists the public key into `credentials`.

- **Request Body**:
```json
{
  "email": "student@campus.edu",
  "username": "STU-FCS-001",
  "id": "CREDENTIAL_ID",
  "rawId": "RAW_ID_BASE64",
  "type": "public-key",
  "response": {
    "clientDataJSON": "BASE64_STRING",
    "attestationObject": "BASE64_STRING"
  }
}
```
- **Response**: `200 OK`
```json
{
  "status": "registration success"
}
```

---

### 2.3 `POST /login/begin`
Initiates WebAuthn authentication ceremony for attendance check-in.

- **Request Body**:
```json
{
  "username": "STU-FCS-001"
}
```
- **Response**: `200 OK`
```json
{
  "publicKey": {
    "challenge": "BASE64_URL_STRING",
    "timeout": 60000,
    "rpId": "localhost",
    "allowCredentials": [
      {
        "type": "public-key",
        "id": "STORED_CREDENTIAL_ID"
      }
    ],
    "userVerification": "preferred"
  }
}
```

---

### 2.4 `POST /login/finish`
Verifies the cryptographic assertion signature and updates the credential counter.

- **Request Body**:
```json
{
  "username": "STU-FCS-001",
  "id": "CREDENTIAL_ID",
  "rawId": "RAW_ID_BASE64",
  "type": "public-key",
  "response": {
    "clientDataJSON": "BASE64_STRING",
    "authenticatorData": "BASE64_STRING",
    "signature": "BASE64_SIGNATURE",
    "userHandle": "BASE64_USER_HANDLE"
  }
}
```
- **Response**: `200 OK`
```json
{
  "status": "login success"
}
```
