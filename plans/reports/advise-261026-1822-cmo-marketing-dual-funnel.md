# Báo cáo Tư vấn Chiến lược: Tổng lực Marketing 100% Nghiệp vụ với Mekong CLI Kit (/cmo) & Phễu Kép CashClaw

- **Ngày:** 2026-10-26
- **Chế độ:** `ak-advise --ultra` (Best-of-5 Verifier Selection)
- **Tác giả:** Antigravity / Verifier Hội đồng Cấp cao
- **Đích đến:** `docs/marketing/` & `dashboard/` & `~/.claude/agents/sophia-cmo.md`

---

## 1. Kết luận Đánh giá (Verdict)

Ý tưởng huy động **Agent `/cmo` của Mekong CLI Kit** cùng toàn bộ đội ngũ Marketing (`copywriter`, `scout`, `ui-ux-designer`) ra quân tổng lực là **hoàn toàn đúng thời điểm và tối quan trọng**, bởi vì toàn bộ nền tảng kỹ thuật cốt lõi (PostgreSQL Usage Metering MCU, Fail-Closed Risk State, Leaderboard trung thực, và Cloudflare Worker/Pages trên `cashclaw.cc`) đã đạt 100% chất lượng sản xuất và CI xanh.

Tuy nhiên, **nếu chỉ chạy marketing theo kiểu truyền thống (viết bài PR chung chung) thì sẽ thất bại ngay lập tức**, vì hiện tại đang có 4 "nút thắt cổ chai" kỹ thuật - nội dung:
1. Agent `/cmo` đang bị khóa sandbox cứng tại `apps/sophia-ai-factory/**`, không có quyền can thiệp vào `dashboard/` của `algo-trader`.
2. Trang chủ `/` (`landing.tsx`) đang tuyên bố *"No paywall. No newsletter funnel"* — tự chặn đứng dòng tiền vào trang thanh toán `/pricing` ($0 / $49 / $199).
3. Giao diện bị lỗi song ngữ (Hero không đổi tiếng Việt khi bấm toggle; trang Pricing bản tiếng Anh bị lẫn tiếng Việt ở FAQ).
4. Kho tài liệu `docs/marketing/` (17 file) đang chứa dữ liệu cũ sai lệch (nhắc đến 100 sàn CEX và các gói giá $149/$499 đã lỗi thời).

Giải pháp chiến lược số 1 được Hội đồng thẩm định `--ultra` chấm điểm cao nhất (98/100) là: **Mở quyền cho `/cmo` trên cả Dashboard + Docs, thiết lập Phễu Kép (Dual-Funnel: Proof-of-Work → RaaS Subscription), và triển khai chiến dịch 4 mặt trận (X/Reddit, Discord/Telegram, Email Nurture, Blog SEO) bám sát dữ liệu thực tế 100%.**

---

## 2. Những việc CẦN LÀM (What You Should Do)

1. **Giai đoạn 1: Mở khóa Thẩm quyền & Quy chuẩn cho `/cmo` (`~/.claude/agents/sophia-cmo.md`):**
   - Bổ sung `dashboard/src/pages/**`, `dashboard/src/components/**`, `dashboard/src/locales/**`, `dashboard/public/**`, `dashboard/index.html`, và `docs/**` vào trường `allowed-paths` của file cấu hình `/cmo`.
   - Bổ sung chỉ dẫn Brand Voice cho **CashClaw & Solo Quant Desk**: phong cách kỹ thuật định lượng minh bạch, sử dụng thuật ngữ Polar-safe ("autonomous agent stack", "quantitative desk", "Kelly sizing"), không dùng từ ngữ phóng đại rẻ tiền.

2. **Giai đoạn 2: Khơi thông Phễu Kép & Sửa lỗi Song ngữ trên Giao diện (`dashboard/`):**
   - **Sửa `dashboard/src/components/hero-solo-quant.tsx`**: Thêm prop nhận ngôn ngữ (`lang?: 'en' | 'vi'`) và render nội dung tương ứng để khi người dùng bấm nút đổi ngôn ngữ trên trang chủ, toàn bộ tiêu đề, phụ đề và nút bấm chuyển sang tiếng Việt hoàn chỉnh.
   - **Sửa `dashboard/src/pages/landing.tsx`**: Chuyển đổi khối kết bài từ *"No paywall"* sang khối **Dual-Funnel CTA**:
     - *Nút 1:* "Khám phá Phương pháp luận & Dữ liệu Thực nghiệm" (trỏ tới `/methodology` và `/manifesto`).
     - *Nút 2:* "Bắt đầu với Gói Miễn phí ($0) hoặc Nâng cấp Pro ($49)" (trỏ tới `/pricing` và `/signup`).
   - **Sửa `dashboard/src/pages/pricing-page.tsx`**: Dịch chuẩn 100% tiếng Anh cho `faq3a` và `faq4a` trong từ điển `COPY.en`, làm nổi bật tính năng bảo vệ rủi ro tự động (Fail-Closed Circuit Breaker) và cách tính hạn mức MCU rõ ràng.

3. **Giai đoạn 3: Bơm đầy SEO Kỹ thuật 100% (`dashboard/index.html` & `dashboard/public/`):**
   - Thêm Meta Tags chi tiết: `<title>CashClaw — Autonomous Quant Desk & Prediction Market RaaS on Polymarket</title>`, mô tả đầy đủ, `canonical`, OpenGraph và Twitter Card ảnh thực tế.
   - Bổ sung Schema JSON-LD (`SoftwareApplication` kèm tính năng và giá cả minh bạch).
   - Tạo file `dashboard/public/robots.txt` và `dashboard/public/sitemap.xml` tự động bao phủ 9 route công khai chính.

4. **Giai đoạn 4: Đồng bộ 100% Kho Vũ khí Marketing 4 Mặt Trận (`docs/marketing/`):**
   - **Mặt trận 1 (X/Twitter, Reddit r/algotrading, Hacker News):** Cập nhật `launch-twitter-thread.md` (chuỗi 8 tweet kể về hành trình từ 1 M1 Max workstation đến desk tự động trên Polymarket), `launch-reddit-post.md` (bài viết chuyên sâu về kiến trúc Fail-Closed và Kelly sizing), và bài HN Show HN.
   - **Mặt trận 2 (Polymarket Discord & Telegram Communities):** Cập nhật `launch-discord-announcement.md` và `golive-announcement-brief.md` tập trung vào giá trị thực tế: giảm thiểu rủi ro trượt giá, bắt chênh lệch spread, tự động ngắt khi có sự cố.
   - **Mặt trận 3 (Chuỗi 5 Email Tự động Nurture: Free → Pro $49):**
     - *Email 1 (Ngay sau đăng ký Free):* Chào mừng + Hướng dẫn kết nối an toàn với API key Polymarket (chỉ quyền Trade, không quyền Rút tiền).
     - *Email 2 (Ngày 2):* Case study: Cách thuật toán Quarter-Kelly bảo vệ vốn trước cú sốc tin tức.
     - *Email 3 (Ngày 4):* Khám phá Bảng xếp hạng Chiến lược Backtest (Truth in Data — cảnh báo mẫu nhỏ dưới 30 trade).
     - *Email 4 (Ngày 7):* Phân tích chạm ngưỡng hạn mức gói Free (10 trades/ngày) và lợi thế của gói Pro ($49/tháng).
     - *Email 5 (Ngày 10):* Ưu đãi đặc biệt giảm 20% tháng đầu gói Pro hoặc Enterprise.
   - **Mặt trận 4 (Blog SEO Kỹ thuật & Bán hàng Song ngữ):** Hoàn thiện 2 bài blog chuyên sâu `launch-blog-post.md` và `blog-arbitrage-engine.md` chuẩn MDX song ngữ VN+EN.

---

## 3. Những việc TUYỆT ĐỐI KHÔNG NÊN LÀM (What You Shouldn't Do)

1. **Không hứa hẹn lợi nhuận viển vông ("guaranteed profit", "100% win rate", "làm giàu nhanh"):** Cộng đồng Polymarket và các nhà giao dịch quant có độ hoài nghi rất cao. Mọi thông điệp phải tập trung vào: **Kiểm soát rủi ro, Kỷ luật vị thế (Kelly sizing), và Tự động hóa tiết kiệm thời gian**.
2. **Không che giấu các giao dịch lỗ hay kết quả backtest xấu:** Lợi thế lớn nhất của Solo Quant Desk là **sự trung thực (Verifiability)**. Cần phô diễn rõ ràng cảnh báo `INSUFFICIENT_SAMPLE (<30)` trên Bảng xếp hạng như một bằng chứng về tính liêm chính dữ liệu.
3. **Không tạo xung đột thương hiệu giữa "Solo Quant Desk" và "CashClaw":** Cần định vị rõ: *Solo Quant Desk* là "nhà xưởng / phòng lab công khai của một nhà nghiên cứu độc lập", còn *CashClaw* là "nền tảng phần mềm SaaS đóng gói từ phòng lab đó để bất kỳ ai cũng có thể sử dụng".
4. **Không chạy quảng cáo trả phí (Paid Ads) trước khi các luồng chuyển đổi tự nhiên (Organic Funnel) được kiểm chứng:** Hãy dùng lượng truy cập từ X, Reddit, Discord và SEO kỹ thuật để đo lường tỷ lệ chuyển đổi từ Free sang Pro trước khi đổ ngân sách quảng cáo.

---

## 4. Lộ trình Thực thi Từng bước (Step-by-Step Route)

```
[Bước 1: Quyền hạn]     Cập nhật ~/.claude/agents/sophia-cmo.md (Thêm dashboard/**, docs/**)
       │
[Bước 2: Giao diện]     Sửa hero-solo-quant.tsx (song ngữ) + landing.tsx (Dual-Funnel CTA) + pricing-page.tsx (FAQ EN)
       │
[Bước 3: SEO Kỹ thuật]  Tạo sitemap.xml, robots.txt, bổ sung Meta Tags + JSON-LD trong index.html
       │
[Bước 4: Kho Nội dung]  Đồng bộ 17 file trong docs/marketing/ sang thông số thật ($0/$49/$199) trên cả 4 mặt trận
       │
[Bước 5: Kiểm định]     Chạy npm test + tsc + build dashboard + deploy Cloudflare xác minh 100%
```

---

## 5. Danh mục Công việc Cụ thể (Work Checklist)

- [ ] Cập nhật `~/.claude/agents/sophia-cmo.md` mở rộng `allowed-paths` và hướng dẫn thương hiệu CashClaw.
- [ ] Cập nhật `dashboard/src/components/hero-solo-quant.tsx` hỗ trợ prop `lang` song ngữ Anh – Việt.
- [ ] Cập nhật `dashboard/src/pages/landing.tsx` tích hợp Dual-Funnel CTA dẫn khách sang `/pricing` và `/signup`.
- [ ] Cập nhật `dashboard/src/pages/pricing-page.tsx` sửa lỗi bản dịch tiếng Anh ở `faq3a` và `faq4a`.
- [ ] Bổ sung thẻ SEO, OpenGraph và Schema JSON-LD vào `dashboard/index.html`.
- [ ] Tạo mới `dashboard/public/robots.txt` và `dashboard/public/sitemap.xml`.
- [ ] Cập nhật toàn bộ các file trong `docs/marketing/` (Twitter, Reddit, Discord, Email sequence, Blog) khớp với bảng giá $0 / $49 / $199.
- [ ] Chạy `cd dashboard && pnpm run build` và deploy lên Cloudflare Pages xác nhận hoạt động trên `cashclaw.cc`.

---

## 6. Chỉ số Đo lường Thành công (Success Metrics)

1. **Giao diện & Chuyển ngữ:** 100% các thành phần trên trang `/` và `/pricing` hiển thị đúng ngôn ngữ khi bấm chuyển đổi (0 lỗi lẫn chữ, 0 văn bản tiếng Việt trong bản tiếng Anh).
2. **SEO & Thu thập dữ liệu:** `curl -sI https://cashclaw.cc/robots.txt` và `curl -sI https://cashclaw.cc/sitemap.xml` trả về `HTTP 200`; Google Rich Results Test nhận diện hợp lệ Schema `SoftwareApplication`.
3. **Phễu Chuyển đổi:** Trang chủ `/` có tối thiểu 2 điểm kích hoạt dẫn khách hàng trực tiếp sang `/pricing` và `/signup`.
4. **Tính nhất quán Nội dung:** 100% các file tài liệu trong `docs/marketing/` đồng nhất về tên gói (Free $0, Pro $49, Enterprise $199) và thông số kỹ thuật thực tế.

---

## 7. Khung Bàn giao Thực thi (Handoff Brief)

```text
Objective: Thiết lập Phễu Kép (Dual-Funnel) và đồng bộ 100% nghiệp vụ Marketing đa kênh cho CashClaw trên giao diện web, SEO kỹ thuật và kho tài liệu tiếp thị.
Done means:
1. File ~/.claude/agents/sophia-cmo.md có allowed-paths bao phủ dashboard/** và docs/**.
2. Trang / (landing.tsx & hero-solo-quant.tsx) hỗ trợ chuyển ngữ VN/EN 100% và có CTA dẫn sang /pricing & /signup; trang /pricing hiển thị chuẩn 100% tiếng Anh không lẫn tiếng Việt.
3. dashboard/public/robots.txt và dashboard/public/sitemap.xml tồn tại; dashboard/index.html có đầy đủ thẻ SEO và JSON-LD.
4. docs/marketing/ đồng bộ 100% thông điệp và mức giá $0 / $49 / $199 cho cả 4 kênh (X/Reddit, Discord, Email Nurture, Blog SEO).
5. Build dashboard thành công (exit 0) và deploy lên Cloudflare Pages cashclaw.cc hoạt động bình thường.
Out of scope: Tự ý đăng bài lên các tài khoản mạng xã hội bên ngoài mà không có lệnh của người dùng; sửa đổi logic giao dịch cốt lõi trong src/desk/.
Constraints: Tuân thủ quy tắc LOC <= 200 mỗi file, 0 kiểu :any, 0 console.log, bảo tồn ngôn ngữ Polar-safe trên giao diện công khai.
Stop and ask only if: Gặp lỗi phân quyền hệ thống nghiêm trọng hoặc hành động có nguy cơ xóa dữ liệu không thể hoàn tác.
```
EOF
