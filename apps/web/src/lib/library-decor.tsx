export function LibraryDecor({ svg, className }: { svg: string | null; className?: string }) {
  if (!svg) return null;
  return (
    <span
      className={className}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
