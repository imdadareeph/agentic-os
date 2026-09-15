import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ExternalLink, X } from 'lucide-react'
import type { VaultNote } from '@/services/memory'

export interface VaultNotePanelProps {
  path: string | null
  note: VaultNote | null
  loading: boolean
  error: string | null
  onNavigate: (path: string) => void
  onClose?: () => void
}

function formatTags(frontmatter: Record<string, unknown>): string[] {
  const raw = frontmatter.tags
  if (Array.isArray(raw)) return raw.map(String)
  if (typeof raw === 'string') return [raw]
  return []
}

function obsidianUri(vaultPath: string): string {
  return `obsidian://open?vault=jarvis&file=${encodeURIComponent(vaultPath.replace(/\.md$/i, ''))}`
}

export default function VaultNotePanel({
  path,
  note,
  loading,
  error,
  onNavigate,
  onClose,
}: VaultNotePanelProps) {
  const tags = note ? formatTags(note.frontmatter) : []

  return (
    <aside className="flex flex-col h-full bg-[#08070e] border-l border-white/10 shrink-0 w-full lg:w-[380px] max-lg:max-h-[45vh] max-lg:border-l-0 max-lg:border-t">
      <div className="flex items-start justify-between gap-2 px-4 py-3 border-b border-white/10 shrink-0">
        <div className="min-w-0">
          {note ? (
            <>
              <h2 className="text-[13px] font-light text-white/90 truncate">{note.title}</h2>
              <p className="text-[9px] font-mono text-white/35 truncate mt-0.5">{note.path}</p>
            </>
          ) : path ? (
            <p className="text-[11px] font-mono text-white/40 truncate">{path}</p>
          ) : (
            <p className="text-[11px] text-white/40">Note preview</p>
          )}
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="lg:hidden p-1 text-white/40 hover:text-white/80"
            aria-label="Close preview"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {note && (
        <div className="px-4 py-2 border-b border-white/5 flex flex-wrap items-center gap-2 shrink-0">
          <span className="text-[9px] text-white/30 font-mono">
            {new Date(note.touchedAt).toLocaleString()}
          </span>
          {note.embedded && (
            <span className="text-[8px] uppercase tracking-wide px-1.5 py-px rounded bg-emerald-500/15 text-emerald-400/80">
              embedded
            </span>
          )}
          {tags.map(tag => (
            <span
              key={tag}
              className="text-[8px] px-1.5 py-px rounded bg-white/5 text-white/45"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {note?.truncated && (
        <p className="px-4 py-2 text-[9px] text-amber-400/80 border-b border-white/5 shrink-0">
          Note truncated — body exceeds 512 KB preview limit.
        </p>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-jarvis px-4 py-3">
        {!path && !loading && (
          <p className="text-[11px] text-white/30 leading-relaxed">
            Select a star to preview its note from the vault.
          </p>
        )}
        {loading && (
          <div className="space-y-2 animate-pulse">
            <div className="h-3 bg-white/10 rounded w-3/4" />
            <div className="h-3 bg-white/10 rounded w-full" />
            <div className="h-3 bg-white/10 rounded w-5/6" />
          </div>
        )}
        {error && !loading && (
          <p className="text-[11px] text-red-400/80 leading-relaxed">{error}</p>
        )}
        {note && !loading && (
          <div className="vault-markdown text-[12px] text-white/75 leading-relaxed [&_h1]:text-base [&_h1]:font-light [&_h1]:text-white/90 [&_h1]:mt-0 [&_h1]:mb-2 [&_h2]:text-sm [&_h2]:font-light [&_h2]:text-white/85 [&_h2]:mt-4 [&_h2]:mb-1.5 [&_h3]:text-[12px] [&_h3]:text-white/80 [&_h3]:mt-3 [&_h3]:mb-1 [&_p]:my-2 [&_ul]:my-2 [&_ul]:pl-4 [&_ul]:list-disc [&_ol]:my-2 [&_ol]:pl-4 [&_ol]:list-decimal [&_li]:my-0.5 [&_code]:font-mono [&_code]:text-[11px] [&_code]:bg-white/5 [&_code]:px-1 [&_code]:rounded [&_pre]:my-2 [&_pre]:p-2 [&_pre]:bg-white/5 [&_pre]:rounded [&_pre]:overflow-x-auto [&_a]:text-amber-400/90 [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-white/20 [&_blockquote]:pl-3 [&_blockquote]:text-white/50">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{note.body}</ReactMarkdown>
          </div>
        )}
      </div>

      {note && note.outboundLinks.length > 0 && (
        <div className="px-4 py-2 border-t border-white/10 shrink-0">
          <p className="text-[9px] uppercase tracking-wide text-white/30 mb-1.5">Links</p>
          <div className="flex flex-wrap gap-1.5">
            {note.outboundLinks.map(link => (
              <button
                key={link.label}
                type="button"
                disabled={!link.resolved || !link.path}
                onClick={() => link.path && onNavigate(link.path)}
                className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                  link.resolved
                    ? 'border-amber-500/30 text-amber-300/90 hover:bg-amber-500/10'
                    : 'border-white/10 text-white/25 cursor-default'
                }`}
              >
                {link.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {note && (
        <div className="px-4 py-3 border-t border-white/10 shrink-0">
          <a
            href={obsidianUri(note.path)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[10px] text-white/50 hover:text-amber-400/90 transition-colors"
          >
            <ExternalLink size={11} />
            Open in Obsidian
          </a>
        </div>
      )}
    </aside>
  )
}
