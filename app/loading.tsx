export default function Loading() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center">
      <h1 className="text-4xl md:text-6xl font-bold text-yellow-400 mb-4">
        たっちレディオクイズ
      </h1>
      <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-yellow-400"></div>
    </main>
  );
}
