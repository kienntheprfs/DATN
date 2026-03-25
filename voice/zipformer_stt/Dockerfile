# Sử dụng Python 3.10 (phiên bản ổn định nhất cho K2/Torch cũ)
FROM python:3.10-slim

# Cài đặt các thư viện hệ thống cần thiết cho xử lý âm thanh
# libsndfile1: cần cho torchaudio/soundfile
# ffmpeg: cần cho xử lý file media
# git: cần nếu source code có kéo sub-module
RUN apt-get update && apt-get install -y \
    git \
    libsndfile1 \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Thiết lập thư mục làm việc
WORKDIR /app

# Copy toàn bộ code hiện tại vào trong Docker
COPY . .

# Cài đặt Python dependencies
# Lưu ý: Vì Docker chạy Linux, nên file requirements.txt GỐC (chứa link linux_x86_64) sẽ chạy ngon lành.
# KHÔNG dùng file requirements.txt mà nãy giờ mình sửa cho Windows nhé.
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

RUN if [ -d "/usr/local/lib/python3.10/site-packages/k2/lib64" ]; then \
    ln -s /usr/local/lib/python3.10/site-packages/k2/lib64 /usr/local/lib/python3.10/site-packages/k2/lib; \
    fi

# Mở port 7860 (Port mặc định của Gradio)
EXPOSE 7860

# Thiết lập biến môi trường để Gradio lắng nghe từ bên ngoài
ENV GRADIO_SERVER_NAME="0.0.0.0"

# Lệnh chạy ứng dụng
CMD ["python", "app.py"]