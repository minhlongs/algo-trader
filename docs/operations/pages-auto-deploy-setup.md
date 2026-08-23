# Pages Auto-Deploy Setup (escrow E7)

> Bilingual guide to finish enabling automatic Cloudflare Pages deploys.
> Hướng dẫn song ngữ để hoàn tất bật deploy tự động lên Cloudflare Pages.

## What is already done — Đã làm sẵn

- ✅ `.github/workflows/pages-deploy.yml` — build dashboard + deploy to Pages
  project `algo-trader` (same as the verified manual go-live deploy)
- ✅ Old Worker workflow `cloudflare-deploy.yml` demoted to manual-only (no more red X per merge)
- ✅ GitHub secret `CLOUDFLARE_ACCOUNT_ID` = set
- ✅ Repo variable `PAGES_AUTO_DEPLOY` = `false` (kill switch, default OFF)

## Why the kill switch — Vì sao có kill switch

Private repos have limited Actions minutes. With `PAGES_AUTO_DEPLOY=false`, pushes to main
do NOT trigger deploys (zero minutes burned). Turn it on only when you want auto-deploys.

Repo private bị giới hạn phút Actions. Khi `PAGES_AUTO_DEPLOY=false`, push lên main sẽ
KHÔNG chạy deploy (không tốn phút). Chỉ bật khi muốn deploy tự động.

## One-time user steps — Các bước người dùng làm 1 lần

### 1️⃣ Create API Token — Tạo API Token

1. Open https://dash.cloudflare.com/profile/api-tokens → **Create Token**
2. Template: **Edit Cloudflare Workers** (covers Pages) or custom:
   - Account → Cloudflare Pages → **Edit**
   - User → Memberships → **Read** (wrangler verification)
3. Copy the token value.

Mở link trên → Create Token → chọn quyền **Cloudflare Pages: Edit** → copy token.

### 2️⃣ Save token to GitHub — Lưu token vào GitHub

```bash
gh secret set CLOUDFLARE_API_TOKEN   # paste token when prompted
```

### 3️⃣ Enable auto-deploy — Bật deploy tự động

```bash
gh variable set PAGES_AUTO_DEPLOY --body true
```

### 4️⃣ First run — Chạy lần đầu

Push any change under `dashboard/**` to main (or run the "Deploy Pages" workflow manually
via `gh workflow run pages-deploy.yml`). The workflow:

1. Builds `dashboard/` with pnpm
2. Deploys from repo root: `wrangler pages deploy dashboard/dist --project-name algo-trader`
3. Smoke-checks https://algo-trader.pages.dev and https://cashclaw.cc (must be HTTP 200)

## Disable anytime — Tắt bất cứ lúc nào

```bash
gh variable set PAGES_AUTO_DEPLOY --body false
```

## Rollback — Quay lui

Deploy failure never touches a healthy site: Pages keeps serving the previous deployment
until the new one succeeds. To roll back content, redeploy an older commit manually:

```bash
git checkout <old-sha> && cd dashboard && pnpm i && pnpm run build && cd ..
npx wrangler pages deploy dashboard/dist --project-name algo-trader --commit-hash <old-sha>
```

Deploy thất bại không ảnh hưởng site đang chạy — Pages giữ bản cũ tới khi bản mới thành công.
