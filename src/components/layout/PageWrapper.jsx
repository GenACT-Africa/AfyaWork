export function PageWrapper({ title, subtitle, action, children }) {
  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {(title || action) && (
        <div className="flex items-start justify-between mb-6">
          <div>
            {title && <h1 className="text-2xl font-bold text-gray-900">{title}</h1>}
            {subtitle && <p className="text-gray-500 mt-1 text-sm">{subtitle}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </div>
  );
}
