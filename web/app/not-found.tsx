import Link from "next/link";

export default function NotFound() {
  return (
    <div className="grid min-h-[60vh] place-items-center text-center">
      <div>
        <p className="font-mono text-xs text-lime">❯ 404</p>
        <h1 className="mt-2 text-2xl font-semibold text-white">That escalation doesn&apos;t exist</h1>
        <Link href="/tickets" className="btn btn-ghost mt-6">Back to escalations</Link>
      </div>
    </div>
  );
}
