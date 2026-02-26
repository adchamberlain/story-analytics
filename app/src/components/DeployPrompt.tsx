const DEPLOY_URL = 'https://github.com/adchamberlain/story-analytics/blob/main/docs/deploy-aws.md'

/**
 * Inline deploy prompt shown as a popover when a cloud-only feature is clicked locally.
 * Renders an overlay + positioned card. Parent must be `relative`.
 */
export function DeployPopover({ onClose }: { onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute right-0 top-full mt-2 z-50 w-72 bg-surface-raised border border-border-default rounded-xl shadow-lg p-4">
        <p className="text-[14px] text-text-primary font-medium mb-1">Deploy to share</p>
        <p className="text-[13px] text-text-muted leading-relaxed">
          Sharing requires a public URL. Deploy to AWS to get a shareable link.
        </p>
        <a
          href={DEPLOY_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-block text-[13px] text-blue-500 hover:text-blue-400 font-medium"
        >
          View deploy instructions &rarr;
        </a>
      </div>
    </>
  )
}

/**
 * Card-style deploy teaser for settings sections that are hidden locally.
 * Shows a title, description of what the feature does, and a deploy link.
 */
export function DeployTeaser({ title, description }: { title: string; description: string }) {
  return (
    <section className="bg-surface-raised rounded-2xl shadow-card border border-border-default p-7 opacity-80">
      <h2 className="text-[17px] font-semibold text-text-primary mb-1">{title}</h2>
      <p className="text-[14px] text-text-muted leading-relaxed mb-4">{description}</p>
      <a
        href={DEPLOY_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-block text-[13px] text-blue-500 hover:text-blue-400 font-medium"
      >
        Deploy to AWS to unlock &rarr;
      </a>
    </section>
  )
}
