# Google Cloud OAuth Client ID 발급

## 목적
앱이 "구글로 로그인" 버튼을 띄울 때 필요한 OAuth Client ID 를 발급한다.

## 절차

1. https://console.cloud.google.com/ 접속, 본인 구글 계정 로그인.
2. 상단 프로젝트 선택 → "새 프로젝트" → 이름: `hyerim-attendance`.
3. 좌측 메뉴 → "API 및 서비스" → "사용자 인증 정보".
4. 상단 "OAuth 동의 화면 구성" 클릭.
   - User Type: **외부**
   - 앱 이름: `혜림교회 청소년부 출석부`
   - 사용자 지원 이메일: 본인 이메일
   - 개발자 연락처: 본인 이메일
   - 저장 후 "테스트 사용자"에 교사 14명 이메일 추가 (또는 게시 → 검증 면제 신청)
5. 다시 "사용자 인증 정보" → "사용자 인증 정보 만들기" → "OAuth 클라이언트 ID".
   - 애플리케이션 유형: **웹 애플리케이션**
   - 이름: `hyerim-attendance-web`
   - **승인된 JavaScript 원본**:
     - `https://<github-user>.github.io` (Pages 도메인)
     - 커스텀 도메인이 있으면 함께 등록
   - 승인된 리디렉션 URI: 사용 안 함 (GIS 는 popup/FedCM)
6. 발급된 Client ID 를 메모. 형식: `1234567890-abc...apps.googleusercontent.com`

## 출력
- `OAUTH_CLIENT_ID = ...` 1개. 이후 GAS Script Properties 와 `web/index.html` 상수에 입력.
