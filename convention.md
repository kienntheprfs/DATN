# Convention khi plan tính năng mới
- Plan chia làm 2 phần: plan kiến trúc và plan implementation
    + Plan kiến trúc tập trung vào thiết kế tổng thể, các quyết định kiến trúc, và các diagram quan trọng, trade-offs, scenerios,... 
    + Plan implementation tập trung vào các bước cụ thể để triển khai tính năng mới, bao gồm thiết kế chi tiết, cấu trúc thư mục, và các file cần tạo/cập nhật.

- Plan plan.md thể hiện rõ mục tiêu, scope, các yêu cầu của người dùng, xuyên suốt lịch sử hội thoại: thể hiện rõ các yêu cầu mà người dùng đã trình bày, các câu claude code đã hỏi người dùng và đã được chính người dùng làm rõ (chi tiết), các câu hỏi mà người dùng đã hỏi và câu trả lời, các giả định đã được xác nhận, các rủi ro đã được đánh giá và các giải pháp đã được đề xuất để giải quyết những rủi ro đó.

    + pipeline flow diagram / flow diagram (+ mô tả pipeline execution flow/flow diagram), sequence diagram, state diagram...
    Lưu ý: vẽ luồng chạy bằng mermaid sequenceDiagram. vẽ luồng quyết định bằng mermaid Decision Flow (flowchart). 
    + lý do thiết kế Architectural decision & trade-offs (Why?), scenerios (nếu có), 
    + Các layer kiến trúc tổng thể (mermaid syntax), hệ thống lại các trường hợp, pattern tổng quát mà code follow, other considerations, intergration points and những điểm cải thiện thêm trong tương lai, 
    + security considerations, db schema changes (nếu có), tổng quan hiarchy/layer khác nếu có
    + BỔ SUNG NHỮNG KHÍA CẠNH THÔNG TIN KHÁC mà chức năng có liên quan hay được đánh giá là quan trọng..., bỏ qua chi tiết hiện thực code đã làm gì.     
    + mô tả thêm những gì code chưa thể hiện được cần phải đọc thêm document khác nếu có

- Plan implementation.md thể hiện rõ các implementation step cho tính năng mới, các bước cụ thể để triển khai tính năng mới bao gồm các bước như 
    + thiết kế kiến trúc, cấu trúc thư mục
    + bên dưới cấu trúc thư mục là danh sách các file sẽ tạo/cập nhật và nội dung mô tả dạng đoạn chi tiết những gì cần cập nhật trong file (**KHÔNG** được viết code cụ thể/code hiện thực từng file; được viết code config hoặc code snippet ngắn để minh họa nếu cần thiết),
    + các kế hoạch code review, kế hoạch kiểm thử, kiểm tra chất lượng code, tối ưu hiệu suất, và triển khai sản phẩm,...
    + Cần consider TRIỆT ĐỂ đến "#Convention implementation chung của dự án" của dự án khi viết phần này, và mô tả rõ ràng những điểm nào trong phần implementation step đã áp dụng convention nào, nếu có thể thì giải thích thêm lý do tại sao áp dụng convention đó vào phần implementation step này
    + Success criteria: mô tả rõ ràng các tiêu chí dạng checklist để đánh giá xem tính năng đã được triển khai thành công hay chưa, có thể bao gồm các tiêu chí về chức năng, hiệu suất, bảo mật, trải nghiệm người dùng, và các tiêu chí khác liên quan đến mục tiêu của tính năng mới.



- Tạo chỉ 1 folder duy nhất cho chức năng mới với tên là docs/<feature_name>/, chứa hai file md là "plan.md" và "implementation.md", trong thư mục của dịch vụ hiện tại. Tiếp tục iterate và sửa đổi file plan trong folder chức năng cho đến khi hoàn thiện plan.

- Sau đó, khi người dùng yêu cầu rõ ràng là "viết file hiện thực" mới bắt đầu viết file implementation.md, và tiếp tục iterate và sửa đổi file implementation.md cho đến khi hoàn thiện phần implementation step.

- Khi được yêu cầu "kiểm tra xem #file:implementation.md có follow #file:plan.md và tuân thủ triệt để #file:convention.md chưa", kiểm tra chi tiết sau đó tạo file #conventions_applied_in_implementation.md trong thư mục docs/<feature_name>/ chức năng mới, mô tả rõ ràng | Convention | Áp dụng ở đâu | Lý do |


# Convention implementation chung của dự án (sử dụng khi implement tính năng mới hoặc refactor code cũ)
- Đây là dự án backend service-based (gần giống microservices), nên mỗi service phải có sự tách biệt rõ ràng về code, (tuy nhiên dùng) shared database, và tách biệt deployment để đảm bảo tính độc lập và dễ dàng mở rộng trong tương lai


- Chạy dịch vụ bằng vsc task runner tương ứng với mỗi service

- Các bảng table của Mỗi dịch vụ nằm trong một database schema postgresql riêng, vẫn chung database, đặt tên bảng có prefix là tên dịch vụ (vd: dashboard_trending_topics, dashboard_user_preferences,...), nếu có khóa ngoại FK thì phải đặt tên để sau này drop được FK, tương tự cần đặt tên với các constraint khác cần đặt tên để thao tác lên được
- Áp dụng Shared database cho service hiện tại đang xét -> chỉ READ, không sửa các bảng thuộc về dịch vụ khác
- Read thì xài chung nhiều service, write phải gọi API qua service chủ quản, không được sửa trực tiếp vào database của service khác

- Mỗi service chỉ làm đúng nghiệp vụ của mình, việc đã được service khác xử lý thì service này không cần thiết chú ý đến, không cần làm bất cứ thứ gì
- Vì là service-based nên cần phải có sự tách biệt rõ ràng về code: code của service này TUYỆT ĐỐI KHÔNG được phép có sự phụ thuộc vào code của service khác

- Đọc kỹ cấu trúc code của các service khác trong tổ chức, học hỏi và áp dụng những best practices đã được chứng minh hiệu quả trong các service khác vào service của mình để xây dựng một service chất lượng cao đáp ứng nhu cầu của khách hàng

-	Implement thông minh, code một cách generic, kiến trúc plug-in để có thể dễ dàng thay đổi, khi muốn mở rộng chức năng ra thêm thì sửa đổi code cũ ít nhất có thể mà vẫn có thể adapt chức năng mới, nếu code hiện có chưa được hiệu quả thì cứ chỉnh sửa để thông minh hơn

-   Tách biệt nhiệm vụ rõ ràng giữa các schema, service, repo, models, tránh sự phụ thuộc lẫn nhau, code quá dài để đảm bảo tính độc lập, tái sử dụng và dễ dàng mở rộng trong tương lai
-   Áp dụng Design Pattern và SOLID khi có thể
-	Áp dụng best practices và industry standards khi có thể
-	Viết test trong thư mục tests/ cho chức năng mới
-	Sử dụng python type hint cho toàn bộ lệnh gán

- Extract các config ra file config (class Settings) riêng, không hardcode trong code, và dùng biến môi trường để lưu các thông tin nhạy cảm như database credentials, API keys,... để bảo mật và dễ dàng thay đổi cấu hình khi cần thiết


# API
- API phải rõ ràng, dễ hiểu, có cấu trúc tốt, và tuân theo RESTful design principles

## Performance
-	Kiểm tra xem trong chức năng mới và trong source code của service hiện tại đang phát triển có chỗ nào có thể tối ưu performance hơn không, nếu có thì tối ưu tất cả

## Database
-	Dùng SQLModel khi có thể để gộp chức năng của SQLAlchemy ORM + Pydantic DTO thành một; các trường hợp DTO có sự khác biệt hoặc không cần expose hết data table thì tách Pydantic validator (DTO) riêng ra; khi cần xử lý ORM phức tạp quá khả năng SQLModel thì vẫn dùng SQLAlchemy. NẾU có khóa ngoại FK thì phải đặt tên để sau này drop được FK, tương tự cần đặt tên với các constraint khác cần đặt tên để thao tác lên được
-	Áp dụng index, và các kĩ thuật tối ưu database khác để hiệu năng truy vấn cao hơn
-	Dùng Alembic để migrate DB Postgres nếu có thay đổi model ORM sử dụng autogenerate.KHÔNG TIN TƯỞNG HOÀN TOÀN autogenerate và check thủ công lại xem file migration đã phản ánh đúng thay đổi chưa. Kiểm tra khóa ngoại và các constraint khác được đặt tên chưa để downgrade, upgrade không bị lỗi.
- Mỗi dịch vụ có một schema riêng trong database, và các bảng liên quan đến alembic dùng riêng và thuộc về schema của dịch vụ đó

-	Kiểm tra xem trong chức năng mới và trong src của service hiện tại tính ACID đã được đảm bảo chưa, kiểm tra các vấn đề tiềm năng khác liên quan đến database (như race condition, concurrency, database constraints, isolation, deadlock,... và nhiều vấn đề khác), sau đó sửa lỗi tất cả

## Code quality
-	Viết code, chia folder, làm flow chạy expressive nhất có thể để không cần viết doc quá nhiều mà vẫn hiểu được, docstring đầy đủ cho tất cả class, function, biến,…
-	Dùng các thư viện có sẵn, hạn chế hiện thực lại reinvent the wheel, tái sử dụng lại các module khác đã viết và ổn định

-	Kiểm tra xem trong chức năng mới và trong src của service hiện tại có trường hợp nào có exeption chưa được bắt đủ hết, logger chưa có, status code chưa có, hoặc được chưa được trả về cho phía người dùng với tin nhắn đủ rõ ràng, user friendly không. Nếu có thể reraise lại lỗi thì ưu tiên. Sửa lỗi tất cả nếu phát hiện được

-	Document trong code phải rõ ràng, cập nhật lại khi function, class, … có thay đổi

## Documentation
- Đối với file README: viết/cập nhật hướng dẫn chi tiết cách thiết lập, khởi tạo, tất cả các ví dụ API, các trường hợp sử dụng của dịch vụ hiện đang phát triển, hướng dẫn chạy test, và các hướng dẫn khác...
- Dùng tiếng việt có dấu cho README