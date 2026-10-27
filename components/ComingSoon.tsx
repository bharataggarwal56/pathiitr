export default function ComingSoon({ title }: { title: string }) {
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold text-navy">{title}</h1>
      <p className="text-muted">Coming soon.</p>
    </div>
  );
}
