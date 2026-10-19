"""念册 ML 推理服务 — P0 健康检查桩（人脸/CLIP/场景在 W7+ 接入）"""

from fastapi import FastAPI

app = FastAPI(title="memora-ml", version="0.0.1")


@app.get("/health")
def health():
    return {
        "ok": True,
        "service": "memora-ml",
        "capabilities": {
            "ml.face": "stub",
            "ml.clip": "stub",
            "ml.scene": "stub",
        },
    }
