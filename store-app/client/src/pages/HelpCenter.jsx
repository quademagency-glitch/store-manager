import { useState, useMemo, useEffect, useRef, Fragment } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '../components/ui';
import { HELP_ARTICLES, HELP_CATEGORIES } from '../constants/helpArticles';

/* ============================================================
   A markdown subset, rendered to React elements.

   Not a markdown library, the whole point of this page is that
   it adds nothing to the bundle. It handles exactly what
   constants/helpArticles.js uses:

     ## / ###        headings
     - item          bullet list
     1. item         numbered list
     | a | b |       table (with a --- separator row)
     **bold**        strong
     *italic*        emphasis
     `code`          inline code
     [text](url)     link; `#article:<id>` links within the help centre

   Anything else renders as literal text, which is the right
   failure mode for content that ships with the app: a stray
   character looks odd, it does not break the page.

   Output is React nodes rather than an HTML string, so there is
   no dangerouslySetInnerHTML anywhere in this file.
   ============================================================ */

/* `**bold**` must precede `*italic*` in the alternation, or the italic branch
   claims the first two asterisks of a bold run and everything after it
   misparses. */
const INLINE_PATTERN = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;

function renderInline(text, keyPrefix, onArticleLink) {
  return text.split(INLINE_PATTERN).filter(Boolean).map((chunk, i) => {
    const key = `${keyPrefix}-${i}`;

    if (chunk.startsWith('**') && chunk.endsWith('**')) {
      return <strong key={key}>{chunk.slice(2, -2)}</strong>;
    }
    if (chunk.startsWith('*') && chunk.endsWith('*')) {
      return <em key={key}>{chunk.slice(1, -1)}</em>;
    }
    if (chunk.startsWith('`') && chunk.endsWith('`')) {
      return <code key={key} className="help-code">{chunk.slice(1, -1)}</code>;
    }

    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(chunk);
    if (link) {
      const [, label, href] = link;
      // Cross-references between articles stay inside the help centre rather
      // than navigating away and losing the reader's place.
      if (href.startsWith('#article:')) {
        const id = href.slice('#article:'.length);
        return (
          <button
            key={key}
            type="button"
            className="help-inline-link"
            onClick={() => onArticleLink(id)}
          >
            {label}
          </button>
        );
      }
      return (
        <a key={key} href={href} target="_blank" rel="noopener noreferrer" className="help-inline-link">
          {label}
        </a>
      );
    }

    return <Fragment key={key}>{chunk}</Fragment>;
  });
}

/** Split a `| a | b |` row into its cells. */
const tableCells = (line) => line.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
const isTableRow = (line) => line.trim().startsWith('|');
const isTableDivider = (line) => /^\|[\s|:-]+\|$/.test(line.trim());

function renderMarkdown(source, onArticleLink) {
  const lines = source.trim().split('\n');
  const blocks = [];

  // Consecutive lines of the same kind are gathered before being emitted, so
  // a list is one <ul> rather than one per bullet.
  let paragraph = [];
  let list = null; // { ordered: boolean, items: string[] }
  let table = null; // { head: string[], rows: string[][] }

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    const text = paragraph.join(' ');
    blocks.push(<p key={`p-${blocks.length}`}>{renderInline(text, `p${blocks.length}`, onArticleLink)}</p>);
    paragraph = [];
  };

  const flushList = () => {
    if (!list) return;
    const Tag = list.ordered ? 'ol' : 'ul';
    const index = blocks.length;
    blocks.push(
      <Tag key={`l-${index}`} className="help-list">
        {list.items.map((item, i) => (
          <li key={i}>{renderInline(item, `l${index}-${i}`, onArticleLink)}</li>
        ))}
      </Tag>,
    );
    list = null;
  };

  const flushTable = () => {
    if (!table) return;
    const index = blocks.length;
    blocks.push(
      <div key={`t-${index}`} className="help-table-scroll">
        <table className="help-table">
          <thead>
            <tr>{table.head.map((cell, i) => <th key={i}>{renderInline(cell, `th${index}-${i}`, onArticleLink)}</th>)}</tr>
          </thead>
          <tbody>
            {table.rows.map((row, r) => (
              <tr key={r}>{row.map((cell, c) => <td key={c}>{renderInline(cell, `td${index}-${r}-${c}`, onArticleLink)}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>,
    );
    table = null;
  };

  const flushAll = () => {
    flushParagraph();
    flushList();
    flushTable();
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (line.trim() === '') {
      flushAll();
      continue;
    }

    if (isTableRow(line)) {
      flushParagraph();
      flushList();
      if (isTableDivider(line)) continue; // the |---|---| separator carries no content
      const cells = tableCells(line);
      if (!table) table = { head: cells, rows: [] };
      else table.rows.push(cells);
      continue;
    }
    flushTable();

    const heading = /^(#{2,3})\s+(.*)$/.exec(line);
    if (heading) {
      flushAll();
      const Tag = heading[1].length === 2 ? 'h2' : 'h3';
      blocks.push(
        <Tag key={`h-${blocks.length}`} className="help-heading">
          {renderInline(heading[2], `h${blocks.length}`, onArticleLink)}
        </Tag>,
      );
      continue;
    }

    // `-` only, deliberately not `*`: now that `*italic*` is supported, a
    // paragraph opening with an emphasised phrase would otherwise be read as
    // a bullet.
    const bullet = /^-\s+(.*)$/.exec(line);
    if (bullet) {
      flushParagraph();
      if (!list || list.ordered) { flushList(); list = { ordered: false, items: [] }; }
      list.items.push(bullet[1]);
      continue;
    }

    const numbered = /^\d+\.\s+(.*)$/.exec(line);
    if (numbered) {
      flushParagraph();
      if (!list || !list.ordered) { flushList(); list = { ordered: true, items: [] }; }
      list.items.push(numbered[1]);
      continue;
    }

    // A wrapped continuation of the list item above, indented in the source.
    if (list && /^\s{2,}\S/.test(rawLine)) {
      list.items[list.items.length - 1] += ` ${line.trim()}`;
      continue;
    }

    flushList();
    paragraph.push(line.trim());
  }

  flushAll();
  return blocks;
}

/* ============================================================ */

const normalise = (s) => s.toLowerCase();

export default function HelpCenter() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const articleRef = useRef(null);

  // `?article=<id>` is how contextual "?" buttons elsewhere in the app deep-link
  // here. Kept in the URL rather than component state so the link is shareable
  // and the browser's back button steps between articles.
  const selectedId = searchParams.get('article');

  const results = useMemo(() => {
    const q = normalise(query.trim());
    return HELP_ARTICLES.filter((article) => {
      if (category !== 'all' && article.category !== category) return false;
      if (!q) return true;
      return (
        normalise(article.title).includes(q) ||
        normalise(article.summary).includes(q) ||
        normalise(article.body).includes(q)
      );
    });
  }, [query, category]);

  const selected = useMemo(
    () => HELP_ARTICLES.find((a) => a.id === selectedId) || null,
    [selectedId],
  );

  const openArticle = (id) => {
    setSearchParams(id ? { article: id } : {}, { replace: false });
  };

  // Reading position follows the reader: jumping from one article to another
  // via a cross-reference should start you at the top of the new one.
  useEffect(() => {
    if (selected && articleRef.current) {
      articleRef.current.scrollTo?.({ top: 0 });
      articleRef.current.focus?.({ preventScroll: true });
    }
  }, [selected]);

  const categoryLabel = (id) => HELP_CATEGORIES.find((c) => c.id === id)?.label ?? id;

  return (
    <div className="help-center">
      <PageHeader
        title="Help Centre"
        subtitle="Guides for everything from your first sale to closing the books."
      />

      <div className="help-layout">
        {/* ── Category rail + search ── */}
        <aside className="help-sidebar">
          <div className="help-search">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
              <path d="M20 20L16.65 16.65" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search help"
              aria-label="Search help articles"
            />
          </div>

          <nav className="help-categories" aria-label="Help categories">
            <button
              type="button"
              className={`help-category ${category === 'all' ? 'is-active' : ''}`}
              onClick={() => setCategory('all')}
            >
              All topics
              <span className="help-category-count">{HELP_ARTICLES.length}</span>
            </button>
            {HELP_CATEGORIES.map((cat) => {
              const count = HELP_ARTICLES.filter((a) => a.category === cat.id).length;
              return (
                <button
                  key={cat.id}
                  type="button"
                  className={`help-category ${category === cat.id ? 'is-active' : ''}`}
                  onClick={() => setCategory(cat.id)}
                >
                  {cat.label}
                  <span className="help-category-count">{count}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        {/* ── Article, or the list of them ── */}
        <section className="help-content" ref={articleRef} tabIndex={-1}>
          {selected ? (
            <article className="help-article surface-1">
              <button type="button" className="help-back" onClick={() => openArticle(null)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M15 18L9 12L15 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                All articles
              </button>

              <p className="help-article-category">{categoryLabel(selected.category)}</p>
              <h2 className="help-article-title">{selected.title}</h2>

              <div className="help-article-body">
                {renderMarkdown(selected.body, openArticle)}
              </div>
            </article>
          ) : (
            <>
              <div className="help-results-meta">
                {query.trim()
                  ? `${results.length} ${results.length === 1 ? 'article' : 'articles'} matching “${query.trim()}”`
                  : `${results.length} ${results.length === 1 ? 'article' : 'articles'}`}
              </div>

              {results.length === 0 ? (
                <div className="help-empty surface-1">
                  <h3>Nothing matched that</h3>
                  <p>
                    Try a shorter search, or browse a category on the left. Still stuck?
                    Email <a href="mailto:support@quaderp.app">support@quaderp.app</a> and
                    we&rsquo;ll help.
                  </p>
                </div>
              ) : (
                <div className="help-card-grid">
                  {results.map((article) => (
                    <button
                      key={article.id}
                      type="button"
                      className="help-card surface-1"
                      onClick={() => openArticle(article.id)}
                    >
                      <span className="help-card-category">{categoryLabel(article.category)}</span>
                      <span className="help-card-title">{article.title}</span>
                      <span className="help-card-summary">{article.summary}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
