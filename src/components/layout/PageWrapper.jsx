export function PageWrapper({ title, subtitle, action, children }) {
  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {(title || action) && (
        <div className="flex items-start justify-between mb-8">
          <div className="flex items-start gap-4">
            <div className="w-1 self-stretch bg-gradient-to-b from-teal-500 to-emerald-400 rounded-full shrink-0" />
            <div>
              {title && <h1 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">{title}</h1>}
              {subtitle && <p className="text-gray-500 mt-1 text-sm">{subtitle}</p>}
            </div>
          </div>
          {action && <div className="shrink-0 ml-4">{action}</div>}
        </div>
      )}
      {children}
    </div>
  );
}
