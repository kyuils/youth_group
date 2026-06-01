# GitHub Pages 배포

## 1) GitHub 저장소 생성

- 이름: `hyerim-attendance` (또는 원하는 이름)
- public 또는 private (GitHub Free 도 private Pages 가능 정책 확인)

## 2) 로컬에서 푸시

```powershell
git remote add origin https://github.com/<user>/hyerim-attendance.git
git branch -M main
git push -u origin main
```

## 3) Pages 활성화

저장소 → Settings → Pages:
- Source: `Deploy from a branch`
- Branch: `main` / `/web` 폴더 (또는 root)

저장 후 1~2분 뒤 URL 활성화:
- 예: `https://<user>.github.io/hyerim-attendance/web/index.html`

(폴더가 `/web` 이라 경로에 `/web/` 가 붙음. 사용자에게 깔끔하게 보이고 싶으면 root 로 두거나 GitHub Actions 로 `/web` 만 배포.)

## 4) HTML 의 설정값 채우기

`web/index.html` 상단의 `APP_CONFIG`:

```js
window.APP_CONFIG = {
  GAS_URL: 'https://script.google.com/macros/s/AKfycb.../exec',
  OAUTH_CLIENT_ID: '1234567890-abc...apps.googleusercontent.com',
};
```

수정 후 커밋·푸시 → 자동 재배포.

## 5) Google Cloud Console 에 도메인 등록

[Task 0.2 가이드](01-setup-google-cloud.md) 의 "승인된 JavaScript 원본" 에:
- `https://<user>.github.io`

가 들어 있는지 확인. 누락 시 추가하고 저장.

## 6) 첫 검증

- 발급된 URL 접속 → "구글로 로그인" 표시 확인
- TEACHERS 시트에 등록된 이메일로 로그인 → 본인 반 학생 표시 확인
- 출석 토글 → 시트 ATTENDANCE 탭에 행 추가 확인
- 미등록 이메일로 로그인 → "접근 권한이 없어요" 화면 확인
