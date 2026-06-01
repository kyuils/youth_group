# Apps Script 배포 & 통합 테스트

## 사전 준비
- [Task 0.2 완료](01-setup-google-cloud.md) — OAUTH_CLIENT_ID 확보
- [Task 0.3 완료](02-setup-sheet-tabs.md) — 시트 ID 확보, 4개 탭 생성

## 1) clasp 설치 (1회)

```powershell
npm install -g @google/clasp
clasp login
```

## 2) Apps Script 프로젝트 만들기

구글 시트(사본) 열기 → 확장프로그램 → Apps Script.

`scriptId` 메모. (URL `script.google.com/d/<scriptId>/edit`)

로컬 `gas/` 폴더에서:

```powershell
clasp clone <scriptId>
```

(또는 IDE 에서 파일 6개를 손으로 붙여넣기. clasp 가 더 편함.)

## 3) Script Properties 등록

Apps Script IDE → 프로젝트 설정 → 스크립트 속성 추가:

| 속성 | 값 |
|---|---|
| `SHEET_ID` | 사본 시트의 ID |
| `OAUTH_CLIENT_ID` | Task 0.2 에서 발급한 ID |

## 4) 배포

IDE 우상단 "배포" → "새 배포" → 유형 "웹 앱":
- 설명: `v1.0.0`
- 실행: **나** (소유자)
- 액세스: **모든 사용자**

배포되면 웹앱 URL 메모. 형식: `https://script.google.com/macros/s/.../exec`.

## 5) 통합 테스트 — curl

### whoami (토큰 없음 → unauthorized)
```powershell
curl -X POST "<GAS_URL>" -H "Content-Type: text/plain" -d "{\"action\":\"whoami\"}"
```
기대: `{"ok":false,"code":"no_token"}`

### unknown action
```powershell
curl -X POST "<GAS_URL>" -H "Content-Type: text/plain" -d "{\"action\":\"banana\"}"
```
기대: `{"ok":false,"code":"unknown_action","action":"banana"}`

### 헬스체크
```powershell
curl "<GAS_URL>"
```
기대: `{"ok":true,"service":"hyerim-attendance","version":"v1.0"}`

토큰이 있는 시나리오는 클라이언트 배포 후 브라우저 콘솔에서 검증.
