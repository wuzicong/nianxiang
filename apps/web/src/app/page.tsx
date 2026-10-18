import { JOB_NAMES } from "@memora/shared";

export default function Home() {
  return (
    <main style={{ maxWidth: 720, margin: "4rem auto", padding: "0 1.5rem" }}>
      <h1 style={{ fontWeight: 600, letterSpacing: "-0.02em" }}>
        念册 · Memora
      </h1>
      <p style={{ lineHeight: 1.6, color: "#555" }}>
        登录在 <a href="/login">/login</a>
        。相册和可撤销分享走 API；打开分享请访问 <code>/s/&lt;token&gt;</code>
        。设了密码的链接会先要求输入密码。页面颜色来自三套 theme.json。选片排版还没接到这个首页。
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
