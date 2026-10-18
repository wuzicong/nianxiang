import { JOB_NAMES } from "@memora/shared";

export default function Home() {
  return (
    <main style={{ maxWidth: 720, margin: "4rem auto", padding: "0 1.5rem" }}>
      <h1 style={{ fontWeight: 600, letterSpacing: "-0.02em" }}>
        念册 · Memora
      </h1>
      <p style={{ lineHeight: 1.6, color: "#555" }}>
        P0 前端壳：上传、智能标签与成册能力将在后续里程碑接入。当前仓库已对齐 Job
        契约与双模式部署变量。
      </p>
      <section style={{ marginTop: "2rem" }}>
        <h2 style={{ fontSize: "1rem" }}>冻结 Job 名（节选）</h2>
        <ul style={{ fontFamily: "ui-monospace, monospace", fontSize: 14 }}>
          <li>{JOB_NAMES.MEDIA_DERIVATIVE}</li>
          <li>{JOB_NAMES.META_EXIF}</li>
          <li>{JOB_NAMES.ALBUM_RENDER}</li>
        </ul>
      </section>
    </main>
  );
}
