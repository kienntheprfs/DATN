# server.py
from fastapi import FastAPI, Body
from fastapi.responses import Response
import subprocess
import io

app = FastAPI()

# CẤU HÌNH ĐƯỜNG DẪN
# Nếu bạn dùng piper cài qua pip:
PIPER_PATH = "./piper/piper.exe"
# Nếu bạn dùng file exe tải về (Windows):
# PIPER_PATH = "./piper.exe"

# ĐƯỜNG DẪN MODEL (Đổi tên đúng file bạn tải)
MODEL_PATH = "./piper/vi_VN-vais1000-medium.onnx"


@app.post("/")
async def tts(text: str = Body(..., embed=True)):
    """
    Nhận text, gọi Piper CLI để tạo âm thanh, trả về bytes
    """
    try:
        # Gọi lệnh piper qua subprocess
        # Lệnh tương đương: echo "text" | piper --model ... --output_raw
        cmd = [PIPER_PATH, "--model", MODEL_PATH, "--output_raw"]  # Xuất ra raw PCM data

        process = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

        # Gửi text vào stdin và nhận audio từ stdout
        stdout_data, stderr_data = process.communicate(input=text.encode("utf-8"))

        if process.returncode != 0:
            return Response(content=f"Error: {stderr_data.decode()}", status_code=500)

        # Trả về audio raw (Pipecat có thể cần thêm header WAV, nhưng raw thường stream tốt hơn)
        # Lưu ý: Pipecat PiperTTSService mặc định có thể mong đợi WAV hoặc Raw tùy cấu hình.
        # Ở đây ta trả về Raw PCM 16-bit mono.
        return Response(content=stdout_data, media_type="audio/l16")

    except Exception as e:
        return Response(content=str(e), status_code=500)


# Chạy server: uvicorn server:app --host 0.0.0.0 --port 5000
