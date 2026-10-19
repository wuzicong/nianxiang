import Link from "next/link";

export default function PreviewNotFound() {
  return (
    <main className="preview-index">
      <h1>没有这套模板</h1>
      <p className="preview-index-lead">样张只开放棉花糖日记、京都纸灯和杂志 Heirloom。</p>
      <p>
        <Link href="/preview">返回样张目录</Link>
      </p>
    </main>
  );
}
