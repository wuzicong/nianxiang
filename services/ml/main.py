"""念册 ML 推理服务 — CPU 健康检查桩（人脸/CLIP/场景在 W7+ 接入）。不要换成 GPU 基础镜像。"""

from fastapi import FastAPI

app = FastAPI(title="memora-ml", version="0.0.1")


@app.get("/health")
def health():
    return {
        "ok": True,
        "service": "memora-ml",
        "device": "cpu",
        "capabilities": {
            "ml.face": "stub",
            "ml.clip": "stub",
            "ml.scene": "stub",
        },
    }
