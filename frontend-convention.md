# Phần 1: Chuyển đổi giao diện HTML tailwind sang Next.js

# Mục tiêu

Xem xét kỹ lưỡng code HTML trong state được yêu cầu của màn hình knowledge tại `#file:temp` và chuyển đổi toàn bộ giao diện này sang Next.js với chất lượng production-ready.

- Luôn tự chạy code frontend và sửa lỗi lint, lỗi tĩnh khác, lỗi runtime khi xong tính năng, không tự ý build frontend
---

# Phạm vi thực hiện
Thư mục code nằm trong frontend/

## Chuyển đổi sang Next.js

Chuyển đổi toàn bộ code HTML sang cấu trúc Next.js (App Router hoặc Pages Router tùy theo project hiện tại), đảm bảo:

* Đặt màn hình vào đúng route thuộc khu vực admin
* Không làm thay đổi giao diện so với bản HTML gốc
* Code sạch, rõ ràng, dễ maintain
* Tái sử dụng các thành phần có sẵn như sidebar, header, table, filter, modal, pagination, v.v. nếu có thể được refactor để phù hợp với Next.js nhưng phải đảm bảo giữ nguyên thiết kế và trải nghiệm người dùng
*  Tuân thủ các best practices của React và Next.js, đồng thời đảm bảo hiệu suất và khả năng mở rộng của ứng dụng.

---

## Tổ chức cấu trúc thư mục

Phân rã giao diện thành các component hợp lý, tuân thủ cấu trúc dự án hiện có:

* Tách nhỏ component theo từng phần UI (header, table, filter, modal, pagination, v.v.)
* Tránh tạo component quá lớn hoặc có nhiều trách nhiệm
* Ưu tiên tính tái sử dụng và khả năng mở rộng
* Đặt đúng vị trí theo convention (components, modules, features, etc.)
* Trang route là nơi tập trung logic điều hướng, state quản lý chung, và kết nối các component lại với nhau
* Đặt tên file component trong component/ là CamelCase, rõ ràng, có ý nghĩa
---

## Giữ nguyên thiết kế

Đảm bảo giữ nguyên toàn bộ các yếu tố từ file HTML:

* Màu sắc
* Font chữ
* Khoảng cách (spacing)
* Layout và bố cục
* Icon
* Style chi tiết (border, shadow, radius, v.v.)

Không tự ý thay đổi design nếu không cần thiết.

---

## Responsive (Mobile-first)

Đảm bảo toàn bộ UI responsive tốt trên:

* Mobile
* Tablet
* Desktop (PC)

Yêu cầu:

* Áp dụng nguyên tắc mobile-first
* Component phải co giãn linh hoạt
* Không bị vỡ layout ở bất kỳ breakpoint nào
* Đảm bảo tính thẩm mỹ và usability dù ở kích thước màn hình nào, trên mọi thiết bị

---

## Xử lý tương tác UI

Hiện thực đầy đủ các tương tác từ HTML và bổ sung nếu cần:

* Button (click, disabled, loading)
* Modal (open/close, overlay, animation)
* Dropdown
* Search
* Filter
* Pagination
* Hover / focus / active states
* Tooltip cho mọi phần tử cần thiết

Yêu cầu:

* Không để UI ở trạng thái "tĩnh"
* Mọi hành động của người dùng phải có phản hồi trực quan
* Animation/transition mượt mà

---

## Quản lý state

Quản lý state một cách hiệu quả:

* Không tạo state dư thừa hoặc quá phức tạp
* State phải rõ ràng, dễ hiểu, dễ debug
* Cập nhật state chính xác và kịp thời
* Ưu tiên:

  * Local state khi phù hợp
  * Global state (nếu cần) theo chuẩn project





## Sidebar Admin

Tạo sidebar riêng cho admin nếu dự án chưa có:

* Không dùng chung với sidebar của user
* Thiết kế phù hợp với layout admin
* Đảm bảo consistency với toàn bộ hệ thống admin

---

## UI Library & Công nghệ

Sử dụng các thư viện UI hiện đại (nếu phù hợp với project), ví dụ:

* TailwindCSS / CSS Modules / Styled Components
* Headless UI / Radix UI / shadcn/ui (nếu cần)

**Tận dụng tối đa các component, các thao tác interaction có sẵn từ thư viện để tăng tốc độ phát triển, nhưng phải đảm bảo tuân thủ design gốc.**

Yêu cầu:

* Không phá vỡ design gốc
* Tối ưu trải nghiệm người dùng
* Tuân thủ nguyên tắc thiết kế hiện đại

---

## Best Practices & Hiệu năng

Tuân thủ React và Next.js best practices:

* Tách logic và UI rõ ràng
* Hạn chế re-render không cần thiết
* Sử dụng memoization khi hợp lý
* Lazy loading / code splitting nếu cần
* Tối ưu hiệu suất render

Tuân thủ triệt để các industry standards về code quality, maintainability và performance khác

Thông báo các practice đã áp dụng trong code để reviewer dễ dàng đánh giá.
---

# Kết quả mong muốn

* Giao diện giống 100% bản HTML ban đầu
* Code rõ ràng, có cấu trúc tốt, dễ maintain
* Component tái sử dụng cao
* Responsive hoàn chỉnh
* Tương tác mượt mà, không có trạng thái "đơ"
* Sẵn sàng tích hợp API trong bước tiếp theo

---



# Phần 2: Tích hợp API & Data Fetching và Refractor cấu trúc trang
* Sử dụng task runner vscode để chạy đúng lệnh khởi động frontend và các service backend, gateway, tránh lỗi do chạy sai lệnh

## API Calls & Data Fetching
* Refractor để Parent component chỉ nên quản lý state chung, truyền xuống child qua props, từng component con tự động handle tất cả các logic chỉ của component con đó (như sort + filter + map + UI formatting + ...) và quản lý state riêng của component đó. Nếu cùng một logic handle được dùng ở nhiều component con thì mới để ở component cha rồi truyền xuống component con.
* Dùng Axios gọi API, tuân thủ chuẩn project
* Dùng React Query (TanStack Query) để quản lý data fetching, caching, và state liên quan đến server nếu cần thiết
* Refractor để gọi API ở component con nếu data chỉ phục vụ riêng component đó, ngược lại, call API ở component cha rồi truyền data xuống component con qua props. Không call API ở nhiều nơi nếu cùng một data, tránh duplicated code và inconsistent state.
* Xử lý toàn bộ loading, error states, và các trạng thái khác một cách rõ ràng và trục quan trong UI, đảm bảo người dùng luôn biết được trạng thái hiện tại của ứng dụng. 
* Thêm skeleton loading hoặc shimmer effect cho bảng và các component cần fetch và tải dữ liệu như card, info khác, ...
* Thêm toast cho các hành động quan trọng như submit form, delete, update, v.v. để thông báo kết quả cho người dùng
* Tooltip cho mọi phần tử cần thiết để giải thích chức năng hoặc trạng thái của phần tử đó, đặc biệt là những phần tử dài không hiển thị đầy đủ hoặc có chức năng phức tạp
* Tự động filter/search/sort có debounce mỗi khi người dùng tương tác lên các input/select drop down/...
* Để giảm N+1 API calls, nếu component cần gọi backend nhiều lần, xử lý ở backend để trả về data đã được xử lý sẵn, tránh phải gọi API nhiều lần từ frontend để lấy data phụ thuộc. Nếu không thể xử lý ở backend, có thể cân nhắc batch API calls hoặc sử dụng React Query để quản lý hiệu quả hơn.
* Sử dụng thư viện hiện đại thay cho việc tự viết lại logic thủ công bất cứ khi nào có thể
* Chạy frontend bằng vsc task runner tương ứng
---