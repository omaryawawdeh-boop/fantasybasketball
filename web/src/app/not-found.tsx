import Link from "next/link";

export default function NotFound() {
  return (
    <div className="py-16 text-center">
      <h1 className="text-xl font-semibold">Page not found</h1>
      <p className="mt-1 text-sm text-muted">That page doesn&apos;t exist.</p>
      <Link href="/" className="mt-4 inline-block underline">
        Back to the feed
      </Link>
    </div>
  );
}
