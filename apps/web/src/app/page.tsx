import { JOB_NAMES } from "@memora/shared";

export default function Home() {
  return (
    <main style={{ maxWidth: 720, margin: "4rem auto", padding: "0 1.5rem" }}>
      <h1 style={{ fontWeight: 600, letterSpacing: "-0.02em" }}>
        念册 · Memora
      </h1>
      <p style={{ lineHeight: 1.6, color: "#555" }}>
        登录在 <a href="/login">/login</a>
        ，相册、上传和分享在 <a href="/albums">/albums</a>
        。打开某本相册可以按主题看故事或翻页，用的是预览图。三套模板的示例样张在{" "}
        <a href="/preview">/preview</a>
        ，不需要上传照片。打开分享请访问 <code>/s/&lt;token&gt;</code>
        。设了密码的链接会先要求输入密码。
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
